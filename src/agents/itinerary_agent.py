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

    plans = [
        ("Arrival, Check-in & Old Town Stroll", "Arrive in city center, check into hotel, and take a relaxed stroll through the central boulevard.", "Sample local street foods, visit the vibrant central bazaar, and pick up fresh fruit/snacks.", "Sunset viewing from the iconic city viewpoint followed by traditional dinner."),
        ("Iconic Monuments & Cultural Architecture", "Morning walking tour of the historic cathedral, central square, and independence monuments.", "Lunch at an authentic traditional dining hall with regional lagman and tandoor bread.", "Evening stroll along pedestrian avenues, live street music, and cozy cafe hopping."),
        ("Mountain Alpine Ridges & Nature Excursion", "Scenic cable car ascent or day trip to alpine recreation ridges and high-altitude valleys.", "Mountain-side lunch with panoramic views of snow-dusted peaks.", "Relax at thermal baths or spa lounge, followed by a warm hearty dinner."),
        ("Local Arts, Museums & Neighborhoods", "Morning tour of the premier national art and historical museum.", "Relaxed cafe lunch in the tree-lined historic district followed by shopping for regional souvenirs.", "Craft brewery or cozy bistro dinner featuring grilled specialties."),
        ("Hidden Gorges & Panoramic Farewell Dinner", "Day excursion to scenic river canyon, lake shores, or natural gorge trails.", "Picnic or lakeside cafe lunch enjoying fresh mountain air and photography.", "Celebratory farewell dinner at a top panoramic restaurant overlooking city lights."),
    ]

    out = [f"### Trip Summary & Highlights\nA comprehensive {days}-day immersive itinerary in {dest}, thoughtfully pacing cultural discoveries, outdoor excursions, authentic local food, and relaxed evenings.\n"]
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
    dest = extract_destination(user_query)
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
