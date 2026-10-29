"""Entry point the API layer calls to run one travel planning request."""

import logging
import re
import uuid

from langchain_core.messages import HumanMessage, SystemMessage

from src.agents.prompts import CONCIERGE_PROMPT, CONCIERGE_SYSTEM_PROMPT
from src.clients.llm import get_concierge_llm, get_llm
from src.config.session import require
from src.graph.graph import get_travel_graph
from src.graph.state import initial_state

logger = logging.getLogger(__name__)


def _is_focused_followup(query: str) -> bool:
    q = query.strip().lower()

    # 1. Quick action chips inserted by the UI (always follow-ups)
    if any(q.startswith(emoji) for emoji in ["🍝", "🚇", "🌧️", "💡", "📸"]):
        return True

    # 2. Specific single-topic follow-up requests:
    single_topic_patterns = [
        r"\b(fish spot|seafood spot|street food|budget eats|restaurant|restaurants|cafe|cafes|dishes|cuisine|sushi|trout)\b",
        r"\b(transit pass|transit guide|metro card|metro line|subway|bus routes|taxi fares|uber)\b",
        r"\b(scams to avoid|travel scam|travel scams|pickpocket|safety tips|is it safe|emergency number)\b",
        r"\b(rainy day|bad weather backup|indoor activities)\b",
        r"\b(photo spot|photo spots|hidden photo spots|instagram spots|viewpoints)\b",
        r"\b(sim card|esim|roaming|plug type|adapter voltage|atm fee|currency exchange rate)\b",
        r"\b(display the budget|split the budget|show budget distribution|per person cost for food)\b",
    ]
    for pattern in single_topic_patterns:
        # If it matches a specific follow-up topic AND does NOT explicitly ask to plan a trip
        if re.search(pattern, q) and not re.search(r"\b(plan|create|build|make|generate)\b", q):
            return True

    # 3. Questions starting with what/where/how/can you that do NOT ask for planning
    if re.search(r"^(?:what|where|how|which|tell me about|is there|are there|can you suggest|can u suggest|recommend)\b", q):
        if not re.search(r"\b(trip|itinerary|vacation|holiday|tour|travel plan|full plan|days?|nights?)\b", q):
            return True

    # 4. TRIP PLANNING OVERRIDES (MUST run the full 6-agent multi-agent pipeline)
    # Any query mentioning trip, itinerary, vacation, holiday, getaway, or tour
    if re.search(r"\b(trip|itinerary|vacation|holiday|getaway|tour|travel plan|full plan)\b", q):
        return False

    # Any query starting with a planning verb
    if re.search(r"^(?:plan|create|build|make|generate|organize|schedule|design|craft)\b", q):
        return False

    # Route pattern: "from [Origin] to [Dest]" or "[Origin] to [Dest]"
    if re.search(r"\b(?:from\s+)?[a-z\s,.-]{2,25}\s+to\s+[a-z\s,.-]{2,25}\b", q):
        return False

    # Duration patterns: "5 days", "3 nights", "2 weeks"
    if re.search(r"\b\d+\s*(?:day|days|night|nights|week|weeks)\b", q):
        return False

    # Group specifications: "for 23 people", "for 2 travellers"
    if re.search(r"\bfor\s+\d+\s*(?:people|person|persons|traveller|travellers|pax|group)\b", q):
        return False

    # Budget specifications: "under 15 lakh", "budget 2000 usd"
    if re.search(r"\b(?:under|budget|max)\s*(?:₹|\$)?\s*\d+\s*(?:lakh|lakhs|lac|lacs|k)?\b", q):
        return False

    # Short query (< 45 chars) that didn't match any trip criteria is likely a follow-up
    if len(q) < 45 and not re.search(r"\b(go to|visit|travel)\b", q):
        return True

    # Default to FULL multi-agent pipeline
    return False


def _extract_destination_hint(query: str) -> str:
    """Extract destination name from query, stripping noise words."""
    q = query.strip()
    # Check for "in/for/to [Destination]"
    m = re.search(
        r"\b(?:in|for|to|around|visit|visiting)\s+([A-Za-z\s,-]{2,30}?)(?=\s+(?:from|with|during|departing|under|budget|\.|\,|$))",
        q,
        re.IGNORECASE,
    )
    if m:
        cleaned = re.sub(
            r"\b(get|freshest|dishes|transit|passes|guide|food|trip|plan|like|please|just)\b",
            "",
            m.group(1),
            flags=re.IGNORECASE,
        ).strip()
        cleaned = re.sub(r"\s+(?:in|to|for|from|with)$", "", cleaned, flags=re.IGNORECASE).strip()
        if len(cleaned) > 2:
            return cleaned.title()

    # Check for well-known destinations mentioned anywhere in query
    dest_keywords = [
        "Italy", "Rome", "Milan", "Florence", "Venice", "Paris", "France", "Tokyo", "Japan",
        "London", "UK", "Barcelona", "Madrid", "Spain", "Bali", "Indonesia", "Thailand",
        "Bangkok", "Dubai", "UAE", "Singapore", "New York", "USA", "Switzerland", "Zurich",
        "Greece", "Athens", "Santorini", "Germany", "Berlin", "Munich", "Portugal", "Lisbon",
        "Bulgaria", "Sofia", "Turkey", "Istanbul", "Georgia", "Tbilisi", "Almaty", "Kazakhstan"
    ]
    for d in dest_keywords:
        if re.search(r"\b" + re.escape(d) + r"\b", q, re.IGNORECASE):
            return d

    return "your destination"


def _generate_concierge_fallback(query: str) -> str:
    q = query.lower()
    dest = _extract_destination_hint(query)
    is_italy = bool(re.search(r"\b(italy|rome|florence|milan|venice|naples)\b", dest, re.IGNORECASE))

    # 1. Transit & Transport Guide (Check first to avoid food collisions)
    if re.search(r"\b(transit|metro|subway|bus|transport|passes|train|trains|ticket|tickets)\b", q):
        if is_italy:
            return (
                f"### Public Transport & Transit Pass Guide for {dest}\n\n"
                f"- **High-Speed & Regional Trains**: Book **Trenitalia (Frecciarossa)** or **Italo** for fast travel between major cities (Rome, Florence, Milan, Venice). Book 2–3 weeks early for 50%+ discounts.\n"
                f"- **City Metro & Contactless Tap**: In Rome (Metro A & B) and Milan (M1–M5), simply tap your contactless credit card/Apple Pay at turnstiles (~€1.50–€2.20 per ride).\n"
                f"- **Transit Passes**: Look into the **Roma Pass** (48/72h unlimited transit + museum access) or **MilanoCard** for unlimited subway, tram, and city bus rides.\n"
                f"- **Crucial Local Rule**: Always validate paper bus/tram tickets in the yellow/orange stamping machine on board immediately to avoid spot fines (€50–€100).\n"
                f"- **Ride Apps**: Official licensed white taxis (FreeNow app) are much more reliable and affordable than unmetered cabs."
            )
        return (
            f"### Public Transport & Transit Pass Guide for {dest}\n\n"
            f"- **City Metro & Rapid Transit**: Most metropolitan lines support contactless credit card / phone tap at the gates for instant travel without buying paper tickets.\n"
            f"- **Day & Multi-Day Passes**: If taking 3+ rides per day, 24h or 72h unlimited transit visitor passes yield significant savings (~30–45% off single fares).\n"
            f"- **Official Ride-Hailing Apps**: Download the region's preferred ride app (Uber, FreeNow, or Bolt) before arriving to guarantee transparent metered rates.\n"
            f"- **Airport Express Transfers**: Dedicated airport trains or express airport shuttle buses are usually 3x faster and significantly cheaper than highway taxis.\n"
            f"- **Practical Tip**: Always validate transit tickets prior to boarding or keep your tap receipt to avoid random conductor inspection fines."
        )

    # 2. Food & Dining
    if re.search(r"\b(food|street food|eat|eats|dishes|cuisine|restaurant|restaurants|cafe|dining)\b", q):
        if is_italy:
            return (
                f"### Authentic Local Dining & Food Guide for {dest}\n\n"
                f"- **Authentic Trattorias & Osterias**: Skip restaurants with multilingual photo menus near tourist monuments. Look for family-run *Trattorie* with daily handwritten chalkboards.\n"
                f"- **Iconic Specialties**: Savor authentic Pasta alla Carbonara, Cacio e Pepe, Neapolitan wood-fired pizza, and fresh artisanal Gelato (look for natural colors in metal tins, not neon mounds).\n"
                f"- **Aperitivo Culture**: Between 6:30 PM and 8:30 PM, enjoy an Aperol Spritz or Negroni served with complimentary cured meats, cheeses, and focaccia snacks (€8–€12).\n"
                f"- **Budget & Pricing**: Casual trattoria meals run €15–€28 (₹1,400–₹2,500) per person. Note that bread/table service (*coperto*) of €1.50–€3 is standard.\n"
                f"- **Coffee Etiquette**: Order your espresso standing at the bar (*al banco*) for €1.20–€1.50 instead of sitting at outdoor square tables."
            )
        return (
            f"### Authentic Local Dining & Culinary Guide for {dest}\n\n"
            f"- **Local Food Markets & Bazaars**: Visit central food halls and morning markets for the freshest regional specialties, pastries, and authentic street eats.\n"
            f"- **Neighborhood Eateries**: Seek out busy spots frequented by locals 2-3 blocks away from primary tourist monuments.\n"
            f"- **Pricing Expectations**: High-quality street food and casual local dining typically ranges from $7–$18 (₹600–₹1,600) per person.\n"
            f"- **Dining Etiquette & Timing**: Dine according to local hours (e.g. lunch 1:00–2:30 PM, dinner 7:30–9:30 PM) to ensure dishes are cooked to order."
        )

    # 3. Rainy Day & Indoor Backup Activities
    if re.search(r"\b(rain|rainy|bad weather|indoor|museum|museums)\b", q):
        if is_italy:
            return (
                f"### Rainy Day & Indoor Culture Guide for {dest}\n\n"
                f"- **World-Class Art Galleries & Museums**: Spend rainy hours sheltered in iconic venues like the Vatican Museums, Galleria Borghese, the Uffizi Gallery, or Galleria dell'Accademia.\n"
                f"- **Historic Covered Markets**: Stroll through atmospheric covered food halls like **Mercato Centrale** for wine tasting, artisanal cheeses, and hot pasta.\n"
                f"- **Historic Basilicas & Cathedrals**: Marvel at interior frescoes, marble mosaics, and renaissance architecture inside magnificent cathedrals.\n"
                f"- **Opera & Classical Concerts**: Reserve evening tickets for an orchestral concert or opera performance in historic theaters.\n"
                f"- **Tip**: Book museum skip-the-line tickets online early, as indoor attractions fill up quickly on rainy days."
            )
        return (
            f"### Rainy Day & Indoor Backup Itinerary for {dest}\n\n"
            f"- **Premier National Museums & Art Galleries**: Explore prominent regional history and fine arts collections with comfortable indoor climate control.\n"
            f"- **Indoor Food Halls & Artisanal Markets**: Taste local coffees, pastries, and regional delicacies sheltered from the weather.\n"
            f"- **Historic Spas & Wellness Centers**: Enjoy regional bathhouses, thermal springs, or wellness centers.\n"
            f"- **Shopping Arcades & Cultural Centers**: Visit historic glass-domed gallerias or contemporary arts complexes.\n"
            f"- **Tip**: Reserve museum entry tickets online in advance to bypass outdoor standby queues in wet weather."
        )

    # 4. Safety Tips & Scams to Avoid
    if re.search(r"\b(scam|scams|safety|safe|emergency|pickpocket)\b", q):
        if is_italy:
            return (
                f"### Safety Tips & Scams to Avoid in {dest}\n\n"
                f"- **Metro & Landmark Pickpockets**: Be vigilant around crowded metro stations (Termini, Colosseo, Duomo) and public buses (e.g. Rome Bus 64). Keep bags zipped in front of you.\n"
                f"- **Friendship Bracelet & Rose Touts**: Strangers offering to tie a 'free' woven bracelet on your wrist or hand you a rose, then aggressively demanding €10–€20. Firmly say 'No grazie' and walk on.\n"
                f"- **Unofficial Airport Taxis**: Only take official white municipal taxis with roof signs and fixed airport rates displayed on the door (€50–€55 for Rome Fiumicino, €100 for Milan Malpensa).\n"
                f"- **Restaurant 'Catch of the Day' Trap**: Confirm fish or steak pricing per 100g (*all'etto*) before ordering to avoid surprise €150+ bills.\n"
                f"- **Emergency Numbers**: Call **112** for all emergency services (Police, Medical, Fire) across Italy and the EU."
            )
        return (
            f"### Safety Tips & Travel Awareness for {dest}\n\n"
            f"- **Luggage & Pocket Awareness**: Use front-facing cross-body bags or zipped interior pockets in crowded transit hubs and tourist plazas.\n"
            f"- **Curbside Taxi Touts**: Always ignore unofficial drivers soliciting rides inside terminal arrivals. Use designated taxi ranks or verified ride-hailing apps.\n"
            f"- **Currency & ATMs**: Withdraw cash only from official bank ATMs located inside bank vestibules, avoiding standalone street machines with high conversion markups.\n"
            f"- **Emergency Contact**: Standard national emergency numbers can be dialed toll-free from any local or roaming mobile phone."
        )

    # 5. Photogenic Sights & Viewpoints
    if re.search(r"\b(photo|photogenic|instagram|viewpoint|views|spots)\b", q):
        if is_italy:
            return (
                f"### 5 Most Photogenic & Iconic Sights in {dest}\n\n"
                f"- **Panoramic City Viewpoints**: Watch the sunset bathed in golden hour light over ancient terracotta rooftops and historic domes.\n"
                f"- **Historic Cobblestone Alleys**: Wander charming backstreets draped in ivy with vintage scooters and flower-laden balconies.\n"
                f"- **Monumental Piazzas**: Photograph grand fountains and baroque marble facades in early morning light before crowds gather.\n"
                f"- **Scenic Waterfronts & Bridges**: Capture historic stone bridges spanning river reflections at dusk.\n"
                f"- **Insider Tip**: The best light for photography is during the 45 minutes right after sunrise, offering empty streets and warm soft lighting."
            )
        return (
            f"### 5 Most Photogenic & Scenic Viewpoints in {dest}\n\n"
            f"- **Summit & Skyline Panoramas**: Visit high-elevation lookouts, tower observatories, or hilltop parks for sweeping views of the city.\n"
            f"- **Historic Architectural Landmarks**: Capture dramatic heritage facades, intricate arches, and monuments.\n"
            f"- **Vibrant Cultural Squares**: Capture lively central plazas, colorful street art districts, and evening lantern-lit streets.\n"
            f"- **Lakeside or River Promenades**: Scenic waterfront walks with bridge reflections and evening illumination.\n"
            f"- **Insider Tip**: Visit major open-air viewpoints during golden hour (just before sunset) for optimal natural lighting."
        )

    # Default general response tailored to destination
    return (
        f"### Curated Insider Recommendations for {dest}\n\n"
        f"- **Top Venues & Landmarks**: Explore the most iconic heritage sites, neighborhood squares, and authentic local experiences in {dest}.\n"
        f"- **Authentic Local Dining**: Dine where residents eat—sample regional dishes, seasonal specialties, and neighborhood food halls.\n"
        f"- **Practical Budget**: Expect casual dining to average $15–$30 (₹1,200–₹2,500) per person.\n"
        f"- **Insider Advice**: Plan visits to popular attractions early in the morning (before 10:00 AM) to experience them peacefully without long lines."
    )


def run_travel_agent(user_input: str, thread_id: str | None = None) -> dict:
    # GROQ_API_KEY is required to power the agents.
    # DATABASE_URL is optional (falls back to in-memory checkpointer if unset).
    require("GROQ_API_KEY")

    if not thread_id:
        thread_id = f"user_{uuid.uuid4().hex}"

    # Fast Concierge Mode: Handle focused queries in 2-3 seconds
    if _is_focused_followup(user_input):
        concierge_answer = ""
        try:
            llm = get_concierge_llm()
            messages = [
                SystemMessage(content=CONCIERGE_SYSTEM_PROMPT),
                HumanMessage(content=CONCIERGE_PROMPT.format(user_query=user_input.strip())),
            ]
            response = llm.invoke(messages)
            concierge_answer = (getattr(response, "content", "") or "").strip()
        except Exception as e:
            logger.warning("Concierge primary invocation error: %s", e)

        # Retry with simpler direct prompt if first attempt was empty
        if not concierge_answer or len(concierge_answer) < 30:
            try:
                llm2 = get_llm(max_tokens=600)
                simple_prompt = (
                    f"Provide an authentic, insider travel guide answering this question:\n\n"
                    f"'{user_input.strip()}'\n\n"
                    f"Include 3-4 top venues or recommendations, estimated prices in local currency & USD/INR, "
                    f"and practical insider advice."
                )
                res2 = llm2.invoke(simple_prompt)
                concierge_answer = (getattr(res2, "content", "") or "").strip()
            except Exception as e:
                logger.warning("Concierge fallback invocation error: %s", e)

        # Guaranteed helpful, topic-specific content (never return 'No details returned')
        if not concierge_answer or len(concierge_answer) < 20:
            concierge_answer = _generate_concierge_fallback(user_input)

        return {
            "thread_id": thread_id,
            "answer": concierge_answer,
            "is_followup": True,
            "flight_results": "",
            "hotel_results": "",
            "weather_results": "",
            "itinerary": "",
            "llm_calls": 1,
            "budget_breakdown": "",
            "packing_list": "",
            "must_visit": "",
            "travel_essentials": "",
        }

    config = {
        "configurable": {
            "thread_id": thread_id
        }
    }

    result = get_travel_graph().invoke(
        initial_state(user_input),
        config=config,
    )

    final_answer = ""
    for msg in reversed(result.get("messages", [])):
        content = getattr(msg, "content", None)
        if content and str(content).strip() not in (
            "Itinerary generated",
            "Trip extras generated",
            "Flight recommendations generated",
            "Hotel information fetched.",
            "Weather information fetched",
            "Plan generated.",
        ):
            final_answer = str(content)
            break

    if not final_answer:
        final_answer = result.get("itinerary") or "Plan ready."

    return {
        "thread_id": thread_id,
        "answer": final_answer,
        "is_followup": False,
        "flight_results": result.get("flight_results", ""),
        "hotel_results": result.get("hotel_results", ""),
        "weather_results": result.get("weather_results", ""),
        "itinerary": result.get("itinerary", ""),
        "llm_calls": result.get("llm_calls", 0),
        "budget_breakdown": result.get("budget_breakdown", ""),
        "packing_list": result.get("packing_list", ""),
        "must_visit": result.get("must_visit", ""),
        "travel_essentials": result.get("travel_essentials", ""),
    }


if __name__ == "__main__":
    # Run with:  python -m src.graph.runner
    user_query = (
        "I want to plan a trip to Paris in July. "
        "Can you help me find flights, hotels, and an itinerary?"
    )

    output = run_travel_agent(user_query, thread_id="test_thread_001")
    print(output["answer"])
