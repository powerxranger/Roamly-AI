"""Merges itinerary and extras into a single complete plan."""

from langchain_core.messages import AIMessage

from src.graph.state import TravelState
from src.utils.async_utils import bump_llm_calls


def final_agent(state: TravelState):
    itinerary = (state.get("itinerary") or "").strip()
    flight_results = (state.get("flight_results") or "").strip()
    hotel_results = (state.get("hotel_results") or "").strip()
    weather_results = (state.get("weather_results") or "").strip()

    if itinerary:
        final_content = itinerary
    else:
        # Fallback if itinerary was missing or failed
        parts = ["# Travel Plan"]
        if flight_results:
            parts.append(f"### Flight Information\n\n{flight_results}")
        if hotel_results:
            parts.append(f"### Hotel Suggestions\n\n{hotel_results}")
        if weather_results:
            parts.append(f"### Weather Information\n\n{weather_results}")
        final_content = "\n\n".join(parts) if len(parts) > 1 else "Your travel plan has been generated."

    return {
        "messages": [AIMessage(content=final_content)],
        "llm_calls": bump_llm_calls(state),
    }
