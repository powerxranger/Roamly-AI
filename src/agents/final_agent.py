"""Merges itinerary and extras into a single complete plan."""

from langchain_core.messages import AIMessage

from src.graph.state import TravelState
from src.utils.async_utils import bump_llm_calls


"""Merges flight, weather, hotel, itinerary, budget, and packing into a complete travel dossier."""

from langchain_core.messages import AIMessage

from src.graph.state import TravelState
from src.utils.async_utils import bump_llm_calls


def final_agent(state: TravelState):
    flight_results = (state.get("flight_results") or "").strip()
    weather_results = (state.get("weather_results") or "").strip()
    hotel_results = (state.get("hotel_results") or "").strip()
    itinerary = (state.get("itinerary") or "").strip()
    budget_breakdown = (state.get("budget_breakdown") or "").strip()
    packing_list = (state.get("packing_list") or "").strip()
    travel_essentials = (state.get("travel_essentials") or "").strip()

    # Assemble complete flow: Flight -> Weather -> Hotel -> Itinerary -> Budget -> Packing
    sections = []

    if flight_results:
        sections.append(f"## ✈️ Flight Information\n\n{flight_results}")

    if weather_results:
        sections.append(f"## 🌤️ Weather & Climate Outlook\n\n{weather_results}")

    if hotel_results:
        sections.append(f"## 🏨 Hotel Suggestions\n\n{hotel_results}")

    if itinerary:
        sections.append(f"## 📅 Day-by-Day Itinerary\n\n{itinerary}")

    if budget_breakdown:
        sections.append(f"## 💰 Budget Breakdown\n\n{budget_breakdown}")

    if packing_list:
        sections.append(f"## 🎒 Packing Checklist\n\n{packing_list}")

    if travel_essentials:
        sections.append(f"## 🧭 Travel Essentials & Tips\n\n{travel_essentials}")

    final_content = "\n\n---\n\n".join(sections) if sections else (itinerary or "Your travel plan is ready.")

    return {
        "messages": [AIMessage(content=final_content)],
        "llm_calls": bump_llm_calls(state),
    }
