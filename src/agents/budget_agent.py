"""Creates a realistic budget breakdown for the trip."""

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from src.agents.prompts import BUDGET_AGENT_PROMPT, BUDGET_SYSTEM_PROMPT
from src.clients.llm import get_llm
from src.graph.state import TravelState
from src.utils.async_utils import bump_llm_calls


def budget_agent(state: TravelState):
    prompt = BUDGET_AGENT_PROMPT.format(
        user_query=state.get("user_query", ""),
        flight_results=state.get("flight_results", ""),
        hotel_results=state.get("hotel_results", ""),
    )

    response = get_llm().invoke([
        SystemMessage(content=BUDGET_SYSTEM_PROMPT),
        HumanMessage(content=prompt),
    ])

    return {
        "budget_breakdown": response.content,
        "messages": [AIMessage(content="Budget breakdown generated")],
        "llm_calls": bump_llm_calls(state),
    }
