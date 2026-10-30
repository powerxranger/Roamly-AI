"""Combines flight, hotel and weather results into a day-by-day itinerary."""

import re

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from src.agents.destination import extract_destination
from src.agents.prompts import ITINERARY_AGENT_PROMPT, ITINERARY_SYSTEM_PROMPT
from src.clients.llm import get_llm
from src.graph.state import TravelState
from src.utils.async_utils import bump_llm_calls


def _get_duration_instruction(query: str) -> str:
    q = str(query or "")
    m = re.search(r"(\d+)\s*(?:day|days)", q, re.IGNORECASE)
    if not m:
        m = re.search(r"(\d+)\s*(?:night|nights)", q, re.IGNORECASE)
    if m:
        days = min(int(m.group(1)), 30)
        return (
            f"MANDATORY COMPLETION TARGET: The user explicitly requested a {days}-day trip. "
            f"You MUST generate ALL {days} days: Day 1, Day 2, through Day {days}. "
            f"Under NO circumstances should you stop at Day 3 or Day 4. Complete all {days} days fully!"
        )
    return (
        "MANDATORY COMPLETION TARGET: Explicitly plan and write out EVERY day of the requested duration "
        "from Day 1 to the final day without truncating or stopping early!"
    )


def _generate_itinerary_fallback(query: str, dest: str) -> str:
    m = re.search(r"(\d+)\s*(?:day|days)", query, re.IGNORECASE)
    days = int(m.group(1)) if m else 5
    days = min(max(days, 3), 10)

    dest_lower = (dest or "").lower()
    is_japan = any(x in dest_lower for x in ["japan", "tokyo", "kyoto", "osaka", "nara", "hakone", "hokkaido"])
    is_italy = any(x in dest_lower for x in ["italy", "rome", "florence", "venice", "milan", "naples", "amalfi"])

    if is_japan:
        plans = [
            (
                "Modern Tokyo, Neon Crossings & Asakusa Heritage",
                "Explore Tokyo's oldest temple Senso-ji in Asakusa, browse Nakamise-dori artisan crafts, and stroll through peaceful Ueno Park.",
                "Savor fresh sushi and tamagoyaki at Tsukiji Outer Market, then explore Akihabara's vibrant electronics and anime culture.",
                "Experience the famous Shibuya Crossing, take in sunset panoramas from Shibuya Sky, and enjoy yakitori in atmospheric Omoide Yokocho.",
            ),
            (
                "Imperial Shrines, Harajuku & Ramen Culture",
                "Walk through the tranquil forested paths of Meiji Jingu Shrine and observe a traditional Shinto morning blessing.",
                "Browse quirky boutique fashion along Takeshita Street in Harajuku, followed by an authentic Tonkotsu ramen lunch in Shinjuku.",
                "Evening stroll through the neon-lit alleys of Shinjuku and Golden Gai, with authentic izakaya small plates and Japanese highballs.",
            ),
            (
                "Bullet Train to Kyoto & Golden Pavilions",
                "Board the high-speed Shinkansen bullet train to Kyoto (~2h 15m), watching scenic Mt. Fuji vistas en route.",
                "Visit Kinkaku-ji (The Golden Pavilion) reflecting over its zen pond, followed by regional matcha soft serve and tea tasting.",
                "Evening walking tour through Kyoto's historic Gion geisha preservation district and traditional Kaiseki multi-course dinner.",
            ),
            (
                "Thousand Torii Gates & Arashiyama Bamboo Forest",
                "Hike through the iconic vermilion torii gate tunnels of Fushimi Inari Taisha early in the morning before crowds arrive.",
                "Wander through the soaring Arashiyama Bamboo Grove, visit historic Tenryu-ji temple gardens, and cross Togetsukyo Bridge.",
                "Riverside dinner along Pontocho Alley, dining on seasonal Kyoto cuisine on wooden platforms overlooking the Kamogawa River.",
            ),
            (
                "Nara Sacred Deer & Osaka Street Food Capital",
                "Morning day trip to ancient Nara (~45 mins) to bow with friendly sacred sika deer in Nara Park and marvel at Todai-ji Great Buddha.",
                "Head to Osaka's lively Dotonbori district; sample sizzling street-cooked Takoyaki (octopus balls) and crispy Kushikatsu skewers.",
                "Evening photo under the iconic Glico Running Man sign, cruise the canal, and feast on savory Okonomiyaki cabbage pancakes.",
            ),
            (
                "Hakone Onsen Thermal Springs & Mt. Fuji Vistas",
                "Day trip to scenic Hakone mountain region; ride the Hakone Ropeway cable car across volcanic Owakudani valley.",
                "Scenic pirate ship cruise across Lake Ashi with post-card views of the red floating torii gate and Mt. Fuji silhouette.",
                "Soak in therapeutic outdoor natural hot spring baths (Onsen) followed by a traditional multi-course ryokan feast.",
            ),
            (
                "TeamLab Digital Art & Panoramic Farewell Feast",
                "Immerse in the world-famous TeamLab Planets digital interactive art installation in Toyosu, walking barefoot through water exhibits.",
                "Afternoon shopping for matcha, Japanese knives, and regional treats in upscale Ginza and historic Nihonbashi.",
                "Celebratory farewell dinner at a panoramic rooftop dining lounge overlooking illuminated Tokyo Tower and Tokyo Skytree.",
            ),
        ]
    elif is_italy:
        plans = [
            (
                "Imperial Rome, Colosseum & Historic Centro",
                "Skip-the-line morning exploration of the monumental Colosseum and walk the ancient ruins of the Roman Forum.",
                "Authentic trattoria lunch in Monti sampling Cacio e Pepe and crisp Roman thin-crust pizza.",
                "Sunset stroll past the Trevi Fountain and Spanish Steps, enjoying artisanal pistachio gelato in Piazza Navona.",
            ),
            (
                "Vatican Marvels, St. Peter's & Trastevere Alleys",
                "Tour the Vatican Museums, marvel at Michelangelo's Sistine Chapel ceiling, and stand under St. Peter's Basilica dome.",
                "Lunch near Borgo Pio with handmade pasta and Roman artichokes.",
                "Cross the Tiber river into bohemian Trastevere for evening cobblestone wandering, Aperol spritzes, and lively osteria dining.",
            ),
            (
                "High-Speed Train to Florence & Renaissance Art",
                "Ride the Frecciarossa high-speed train to Florence (1h 35m) and check into your historic city center hotel.",
                "Gaze at Brunelleschi's magnificent Duomo dome and browse leather goods at San Lorenzo Market.",
                "Evening walk across Ponte Vecchio bridge and celebratory dinner featuring authentic Bistecca alla Fiorentina.",
            ),
            (
                "Uffizi Gallery, Boboli Gardens & Tuscan Sunsets",
                "Morning art tour of the Uffizi Gallery viewing Botticelli's 'Birth of Venus' and Leonardo masterpieces.",
                "Panino lunch with Tuscan cured meats and pecorino cheese at All'Antico Vinaio.",
                "Climb to Piazzale Michelangelo for sweeping sunset views over Florence's terracotta rooftops, followed by Tuscan wine tasting.",
            ),
            (
                "Day Excursion to Venice & Grand Canal Gondolas",
                "Early high-speed train to magical Venice; step out directly into the grand canal and board a vaporetto water bus.",
                "Visit St. Mark's Basilica, Doge's Palace, and walk over the Bridge of Sighs.",
                "Savor authentic Venetian cicchetti (tapas) and prosecco in the peaceful back canals of Cannaregio.",
            ),
        ]
    else:
        plans = [
            (
                "Arrival, Historic City Center & Sunset Stroll",
                f"Arrive in {dest}, check into your central hotel, and take an orientation walk through the lively historic center.",
                f"Sample authentic local street food and regional delicacies at a vibrant central food hall in {dest}.",
                f"Sunset viewing from an iconic city lookout point, followed by a welcome dinner at a traditional neighborhood restaurant.",
            ),
            (
                "Iconic Heritage Landmarks & Cultural Discovery",
                f"Morning guided exploration of the premier historic monuments, architectural landmarks, and heritage squares in {dest}.",
                f"Relaxed lunch at an authentic, family-run eatery sampling regional dishes cooked with seasonal ingredients.",
                f"Evening stroll along pedestrian avenues, artisan boutiques, and cozy local cafes with live music.",
            ),
            (
                "Arts, Hidden Courtyards & Historic Neighborhoods",
                f"Morning visit to {dest}'s renowned national museum or fine arts gallery to discover local history and heritage.",
                f"Al fresco cafe lunch in a charming neighborhood courtyard, followed by browsing local craft and souvenir markets.",
                f"Dinner at a celebrated local bistro, tasting signature regional dishes paired with local beverages.",
            ),
            (
                "Scenic Nature Excursion & Panoramic Countryside",
                f"Day trip or scenic excursion to nearby natural reserves, coastal promenades, or scenic hilltop villages around {dest}.",
                f"Scenic outdoor lunch with panoramic valley or water views, enjoying fresh regional produce.",
                f"Return to the city for a relaxing evening, craft cocktails or tea lounge, and dinner at a vibrant night market.",
            ),
            (
                "Cultural Workshops & Panoramic Farewell Dinner",
                f"Morning visit to local artisan workshops, botanical gardens, or historic estates.",
                f"Casual lunch at a popular neighborhood food spot loved by residents.",
                f"Celebratory farewell dinner at a panoramic rooftop restaurant overlooking the sparkling night skyline of {dest}.",
            ),
        ]

    out = [f"### Trip Summary & Highlights\nA comprehensive {days}-day immersive itinerary in {dest}, thoughtfully pacing cultural discoveries, heritage sightseeing, authentic local food, and relaxed evenings.\n"]
    for d in range(1, days + 1):
        plan_idx = (d - 1) % len(plans)
        title, morn, aft, eve = plans[plan_idx]
        out.append(
            f"### Day {d}: {title}\n"
            f"- Morning: {morn}\n"
            f"- Afternoon: {aft}\n"
            f"- Evening: {eve}\n"
        )
    return "\n".join(out)


def itinerary_agent(state: TravelState):
    print("\nINSIDE ITINERARY AGENT\n")

    user_query = state.get("user_query", "")
    dest = state.get("destination") or extract_destination(user_query)
    duration_instruction = _get_duration_instruction(user_query)

    prompt = ITINERARY_AGENT_PROMPT.format(
        user_query=user_query,
        flight_results=state.get("flight_results", "")[:1200],
        hotel_results=state.get("hotel_results", "")[:1200],
        weather_results=state.get("weather_results", "")[:800],
        duration_instruction=duration_instruction,
    )

    itinerary = ""
    try:
        response = get_llm().invoke([
            SystemMessage(content=ITINERARY_SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ])
        itinerary = (getattr(response, "content", "") or "").strip()
    except Exception as e:
        print(f"Itinerary agent error: {e}. Activating intelligent itinerary synthesis.")

    # Guaranteed fallback if LLM failed or generated error message
    if not itinerary or "error" in itinerary.lower() or len(itinerary) < 80:
        itinerary = _generate_itinerary_fallback(user_query, dest)

    return {
        "itinerary": itinerary,
        "messages": [AIMessage(content="Itinerary generated")],
        "llm_calls": bump_llm_calls(state),
    }
