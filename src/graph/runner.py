"""Entry point the API layer calls to run one travel planning request."""

import uuid

from src.config.session import require
from src.graph.graph import get_travel_graph
from src.graph.state import initial_state


"""Entry point the API layer calls to run one travel planning request."""

import re
import uuid

from langchain_core.messages import HumanMessage, SystemMessage

from src.agents.prompts import CONCIERGE_PROMPT, CONCIERGE_SYSTEM_PROMPT
from src.clients.llm import get_llm
from src.config.session import require
from src.graph.graph import get_travel_graph
from src.graph.state import initial_state


def _is_focused_followup(query: str) -> bool:
    q = query.strip().lower()

    # If the user explicitly asks to plan a full trip/itinerary, it's not a follow-up
    if re.search(r"\b(plan|create|build|make)\s+(?:a|an|me|my)?\s*(?:\d+\s*day|\d+\s*night|trip|vacation|itinerary|holiday|tour|getaway)\b", q):
        return False
    if re.search(r"\b(?:from\s+[a-z\s]{2,20}\s+to\s+[a-z\s]{2,20}\s+for\s+\d+)\b", q):
        return False

    # Typical follow-up signals or quick action chip queries
    followup_patterns = [
        r"^(what|where|how|which|can you|tell me|give me|suggest|recommend|do i need|is it safe)\b",
        r"\b(street food|food|budget eats|restaurant|cafe|dishes|vegetarian|vegan|cuisine)\b",
        r"\b(metro|subway|transit|bus|train|trains|pass|passes|ticket|tickets|taxi|cab|uber)\b",
        r"\b(scam|scams|safety|safe|emergency|police|hospital)\b",
        r"\b(packing|pack|clothes|wardrobe|dress code|shoes)\b",
        r"\b(photo|photogenic|instagram|hidden gems|viewpoint|nightlife)\b",
        r"\b(sim card|esim|wifi|atm|cash|currency exchange|plugs|adapter)\b",
        r"^🍝|🚇|🌧️|💡|📸",
    ]
    for pattern in followup_patterns:
        if re.search(pattern, q):
            return True

    # Short conversational queries (< 60 chars) without explicit full trip words are follow-ups
    if len(q) < 60 and not re.search(r"\b(plan|itinerary)\b", q):
        return True

    return False


def run_travel_agent(user_input: str, thread_id: str | None = None) -> dict:
    # Check everything up front so the caller learns about every missing key
    # at once, rather than one per failed attempt.
    require("GROQ_API_KEY", "DATABASE_URL")

    if not thread_id:
        thread_id = f"user_{uuid.uuid4().hex}"

    # Fast Concierge Mode: Handle focused queries in 2-3 seconds
    if _is_focused_followup(user_input):
        llm = get_llm()
        messages = [
            SystemMessage(content=CONCIERGE_SYSTEM_PROMPT),
            HumanMessage(content=CONCIERGE_PROMPT.format(user_query=user_input.strip())),
        ]
        response = llm.invoke(messages)
        concierge_answer = getattr(response, "content", str(response)).strip()

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
