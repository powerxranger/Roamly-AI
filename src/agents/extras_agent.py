"""Merges budget, packing, must-visit picks, and travel essentials into a single LLM call."""

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
        rf"(?i)(?:^|\n)(?:#{{1,4}}\s*|\*\*)?({header_pattern})(?:\*\*)?\s*[:\n]"
        rf"([\s\S]*?)(?=(?:\n(?:#{{1,4}}\s*|\*\*)(?:{'|'.join(next_headers)})\b|\Z))"
    )
    match = re.search(pattern, content)
    if match:
        body = match.group(2).strip()
        header = match.group(1).strip()
        return f"### {header}\n\n{body}"
    return ""


def extras_agent(state: TravelState):
    prompt = EXTRAS_AGENT_PROMPT.format(
        user_query=state.get("user_query", ""),
        flight_results=state.get("flight_results", ""),
        hotel_results=state.get("hotel_results", ""),
        weather_results=state.get("weather_results", ""),
        itinerary=state.get("itinerary", ""),
    )

    try:
        response = get_llm().invoke([
            SystemMessage(content=EXTRAS_SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ])
        content = response.content or ""
    except Exception as e:
        content = ""
        print(f"Extras agent error: {e}")

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

    # Fallback if markdown headers differed:
    if not (budget_breakdown or packing_list or travel_essentials or must_visit) and content.strip():
        budget_breakdown = content.strip()

    return {
        "budget_breakdown": budget_breakdown,
        "packing_list": packing_list,
        "must_visit": must_visit,
        "travel_essentials": travel_essentials,
        "messages": [AIMessage(content="Trip extras generated")],
        "llm_calls": bump_llm_calls(state),
    }
