"""Merges budget, packing, must-visit picks, and travel essentials with guaranteed fallbacks."""

import re
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from src.agents.prompts import (
    EXTRAS_AGENT_PROMPT,
    EXTRAS_SYSTEM_PROMPT,
)
from src.clients.llm import get_llm
from src.graph.state import TravelState
from src.utils.async_utils import bump_llm_calls


def _extract_section(content: str, header_pattern: str, next_headers: list[str]) -> str:
    """Extract a markdown section by header name, up to the next known section or end of text."""
    pattern = (
        rf"(?i)(?:^|\n)(?:#{{1,4}}\s*|\*\*\s*|\d+\.\s*)?({header_pattern})(?:\*\*)?\s*[:\n]"
        rf"([\s\S]*?)(?=(?:\n(?:#{{1,4}}\s*|\*\*\s*|\d+\.\s*)(?:{'|'.join(next_headers)})\b|\Z))"
    )
    match = re.search(pattern, content)
    if match:
        body = match.group(2).strip()
        header = match.group(1).strip()
        return f"### {header}\n\n{body}"
    return ""


def _extract_number(text: str, pattern: str, default: int) -> int:
    m = re.search(pattern, text, re.IGNORECASE)
    if m:
        try:
            return int(m.group(1).replace(",", ""))
        except Exception:
            return default
    return default


def _extract_budget_amount(query: str) -> tuple[int, str]:
    """Returns (total_amount, currency_symbol) from user query."""
    q = query.lower()
    # Check for Lakhs / Lacs
    mLakh = re.search(r"(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs)\b", q)
    if mLakh:
        return int(float(mLakh.group(1)) * 100000), "₹"

    # Check for direct INR
    mInr = re.search(r"₹\s*([\d,]+)", query)
    if mInr:
        return int(mInr.group(1).replace(",", "")), "₹"

    # Check for USD / $
    mUsd = re.search(r"\$\s*([\d,]+)", query)
    if mUsd:
        return int(mUsd.group(1).replace(",", "")), "$"

    # Default to ₹1,50,000
    return 150000, "₹"


def _generate_fallback_budget(query: str, dest: str) -> str:
    total_amt, curr = _extract_budget_amount(query)
    people = _extract_number(query, r"(\d+)\s*(?:people|person|traveller|travelers)", 2)
    per_person = total_amt // max(people, 1)

    # Allocation percentages
    flight_share = int(total_amt * 0.38)
    hotel_share = int(total_amt * 0.30)
    food_share = int(total_amt * 0.16)
    transit_share = int(total_amt * 0.08)
    activities_share = int(total_amt * 0.08)

    return (
        f"### Budget Breakdown\n\n"
        f"- Flights: {curr}{flight_share:,} estimated round-trip total for {people} travellers\n"
        f"- Hotels (stay): {curr}{hotel_share:,} total for group accommodation in {dest}\n"
        f"- Food & Dining: {curr}{food_share:,} for authentic meals, street food & group dinners\n"
        f"- Local Transport: {curr}{transit_share:,} for airport transfers, private minibus & metro\n"
        f"- Sightseeing & Activities: {curr}{activities_share:,} for museum entries, cable cars & day trips\n"
        f"- Total Estimated Cost: {curr}{total_amt:,} total estimated trip budget\n"
        f"- Cost Per Person: {curr}{per_person:,} per person ({people} travellers)\n"
    )


def _generate_fallback_packing(dest: str, weather_summary: str) -> str:
    is_cold = bool(re.search(r"snow|cold|winter|chill|below|5°|6°|7°|8°|9°|10°", weather_summary, re.IGNORECASE))
    clothing_advice = (
        "Thermal base layers, fleece jacket, windproof coat, gloves & beanie"
        if is_cold
        else "Breathable cotton t-shirts, light sweater, sunglasses & comfortable walking pants"
    )
    return (
        f"### Packing Checklist\n\n"
        f"- Essentials: Passport (valid 6+ mos), visa copy, travel insurance, flight tickets, hotel vouchers, debit/credit cards\n"
        f"- Clothing: {clothing_advice}\n"
        f"- Footwear: Broken-in cushioned walking shoes, moisture-wicking socks, waterproof boots if hiking\n"
        f"- Toiletries & Health: Lip balm, high-SPF moisturizer, basic med kit (paracetamol, altitude/motion sickness tablets)\n"
        f"- Electronics: Universal travel adapter, 10,000mAh+ power bank, smartphone with offline maps\n"
        f"- Extras: Compact umbrella, reusable insulated water bottle, daypack for excursions\n"
    )


def _generate_fallback_must_visit(dest: str) -> str:
    d_lower = (dest or "").lower()
    if any(x in d_lower for x in ["japan", "tokyo", "kyoto", "osaka"]):
        return (
            f"### Must-Visit & Local Picks\n\n"
            f"- Top Attractions: Fushimi Inari Taisha (Kyoto), Senso-ji Temple & Shibuya Sky (Tokyo), Arashiyama Bamboo Forest, Dotonbori Canal (Osaka)\n"
            f"- Hidden Gems: Yanaka old-town district (Tokyo), Omoide Yokocho lantern-lit alley, Uji green tea fields, Gion Shirakawa quiet canals\n"
            f"- Local Food & Drinks: Fresh Tsukiji sushi & sashimi, authentic Tonkotsu ramen, hot takoyaki, savory okonomiyaki, matcha sweets & Japanese draft beer\n"
            f"- Local Experience Tips: Visit major shrines at sunrise to enjoy serenity; get an IC card (Suica/Pasmo) for instant tap-and-go travel on all subways and trains\n"
        )
    if any(x in d_lower for x in ["italy", "rome", "florence", "venice", "milan"]):
        return (
            f"### Must-Visit & Local Picks\n\n"
            f"- Top Attractions: The Colosseum & Roman Forum, Vatican Museums & St. Peter's, Florence Duomo & Uffizi, Venice Grand Canal\n"
            f"- Hidden Gems: Trastevere cobblestone backstreets, Oltrarno artisan leather workshops, Cannaregio quiet wine bars in Venice\n"
            f"- Local Food & Drinks: Cacio e Pepe, Neapolitan wood-fired pizza, Bistecca alla Fiorentina, artisanal pistachio gelato, Aperol Spritz\n"
            f"- Local Experience Tips: Book Colosseum and Vatican skip-the-line tickets weeks early; enjoy early evening aperitivo with complimentary appetizers\n"
        )
    return (
        f"### Must-Visit & Local Picks\n\n"
        f"- Top Attractions: Iconic heritage landmarks, historic old town district, panoramic viewpoint lookouts & national monuments in {dest}\n"
        f"- Hidden Gems: Atmospheric neighborhood side streets, quiet cultural courtyards & scenic waterfront or garden walks\n"
        f"- Local Food & Drinks: Celebrated regional specialties, fresh local market delicacies, artisan bakeries & signature beverages\n"
        f"- Local Experience Tips: Explore the central market in the morning for fresh seasonal produce and authentic local encounters\n"
    )


def _generate_fallback_essentials(dest: str) -> str:
    d_lower = (dest or "").lower()
    if any(x in d_lower for x in ["japan", "tokyo", "kyoto", "osaka"]):
        return (
            f"### Travel Essentials\n\n"
            f"- Visa & Entry: Apply for Japan Tourist eVisa (or 90-day visa waiver depending on passport); passport must be valid for stay duration\n"
            f"- Currency & Payments: Japanese Yen (JPY); cards widely accepted in department stores, but carry ¥10,000–¥20,000 cash for temples, shrines & ramen ticket machines\n"
            f"- Timezone: Japan Standard Time (JST, UTC+9)\n"
            f"- Electrical: 100V, 50/60Hz, Type A and Type B plugs (two flat parallel pins; carry a flat-pin universal travel adapter)\n"
            f"- Connectivity: Buy an airport eSIM (Airalo or Ubigi) or rent a pocket Wi-Fi router upon arrival at Haneda/Narita\n"
            f"- Local Transport Tips: Buy a digital Suica/Pasmo card on Apple/Google Wallet for all subways, buses, and 7-Eleven vending; use Shinkansen for intercity travel\n"
            f"- Safety & Emergency: Exceptionally safe country; emergency numbers: 110 for Police, 119 for Ambulance and Fire\n"
        )
    if any(x in d_lower for x in ["italy", "rome", "florence", "venice", "milan"]):
        return (
            f"### Travel Essentials\n\n"
            f"- Visa & Entry: Schengen Visa required for non-EU travelers; passport must be valid for at least 3 months beyond departure date\n"
            f"- Currency & Payments: Euro (€); credit cards widely accepted; keep €30–€50 cash for small cafes and gelato\n"
            f"- Timezone: Central European Time (CET, UTC+1 / CEST, UTC+2 in summer)\n"
            f"- Electrical: 230V, 50Hz, European Type C, F, and L plugs\n"
            f"- Connectivity: Affordable local tourist SIM or regional EU eSIM gives seamless coverage across all member countries\n"
            f"- Local Transport Tips: Book Frecciarossa high-speed trains early for 50%+ discounts; always validate paper bus/tram tickets before boarding\n"
            f"- Safety & Emergency: Watch personal belongings in crowded metro stations and tourist plazas; call 112 for all EU emergency services\n"
        )
    return (
        f"### Travel Essentials\n\n"
        f"- Visa & Entry: Check electronic visa or visa-on-arrival eligibility; ensure passport has at least 6 months validity\n"
        f"- Currency & Payments: Local currency & major cards; carry small cash denominations for local stalls & taxis\n"
        f"- Timezone & Timing: Check destination local UTC offset; morning hours are best for popular monuments\n"
        f"- Electrical: Check plug type and carry a universal travel adapter\n"
        f"- Connectivity: Buy an airport tourist eSIM or local SIM card for navigation and translation\n"
        f"- Local Transport Tips: Use official ride-hailing apps or local metro systems with clear metered fares\n"
        f"- Safety & Emergency: Store digital copies of passport and travel insurance on your phone; note local emergency numbers\n"
    )


def extras_agent(state: TravelState):
    from src.agents.destination import extract_destination
    user_query = state.get("user_query", "")
    dest = state.get("destination") or extract_destination(user_query) or "Destination"
    weather = state.get("weather_results", "")

    # Token-efficient truncated context (prevents 4,000-token prompt bloat)
    prompt = EXTRAS_AGENT_PROMPT.format(
        user_query=user_query,
        flight_results=state.get("flight_results", "")[:1000],
        hotel_results=state.get("hotel_results", "")[:1000],
        weather_results=weather[:600],
        itinerary=state.get("itinerary", "")[:1200],
    )

    content = ""
    try:
        response = get_llm(max_tokens=1800).invoke([
            SystemMessage(content=EXTRAS_SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ])
        content = getattr(response, "content", "") or ""
    except Exception as e:
        print(f"Extras agent warning: {e}. Activating intelligent synthesis fallback.")

    budget_breakdown = _extract_section(
        content,
        r"Budget Breakdown",
        [r"Packing Checklist", r"Must-Visit", r"Travel Essentials"],
    )
    packing_list = _extract_section(
        content,
        r"Packing Checklist",
        [r"Must-Visit", r"Travel Essentials", r"Budget Breakdown"],
    )
    must_visit = _extract_section(
        content,
        r"Must-Visit & Local Picks|Must-Visit|Local Picks",
        [r"Travel Essentials", r"Budget Breakdown", r"Packing Checklist"],
    )
    travel_essentials = _extract_section(
        content,
        r"Travel Essentials",
        [r"Budget Breakdown", r"Packing Checklist", r"Must-Visit"],
    )

    # GUARANTEED REFLECTION: Never leave sections missing or empty for any trip
    if not budget_breakdown:
        budget_breakdown = _generate_fallback_budget(user_query, dest)
    if not packing_list:
        packing_list = _generate_fallback_packing(dest, weather)
    if not must_visit:
        must_visit = _generate_fallback_must_visit(dest)
    if not travel_essentials:
        travel_essentials = _generate_fallback_essentials(dest)

    return {
        "budget_breakdown": budget_breakdown,
        "packing_list": packing_list,
        "must_visit": must_visit,
        "travel_essentials": travel_essentials,
        "messages": [AIMessage(content="Trip extras generated")],
        "llm_calls": bump_llm_calls(state),
    }
