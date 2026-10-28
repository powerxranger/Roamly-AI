"""Combines flight, hotel and weather results into a day-by-day itinerary."""

import re

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

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


def itinerary_agent(state: TravelState):
    print("\nINSIDE ITINERARY AGENT\n")

    user_query = state.get("user_query", "")
    duration_instruction = _get_duration_instruction(user_query)

    prompt = ITINERARY_AGENT_PROMPT.format(
        user_query=user_query,
        flight_results=state.get("flight_results", ""),
        hotel_results=state.get("hotel_results", ""),
        weather_results=state.get("weather_results", ""),
        duration_instruction=duration_instruction,
    )

    try:
        response = get_llm().invoke([
            SystemMessage(content=ITINERARY_SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ])
        itinerary = response.content or ""
    except Exception as e:
        print(f"Itinerary agent error: {e}")
        itinerary = f"Itinerary generation encountered an error: {str(e)}"

    return {
        "itinerary": itinerary,
        "messages": [AIMessage(content="Itinerary generated")],
        "llm_calls": bump_llm_calls(state),
    }
