"""Generates a smart packing checklist."""

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from src.agents.prompts import PACKING_AGENT_PROMPT, PACKING_SYSTEM_PROMPT
from src.clients.llm import get_llm
from src.graph.state import TravelState
from src.utils.async_utils import bump_llm_calls


def packing_agent(state: TravelState):
    prompt = PACKING_AGENT_PROMPT.format(
        user_query=state.get("user_query", ""),
        weather_results=state.get("weather_results", ""),
    )

    response = get_llm().invoke([
        SystemMessage(content=PACKING_SYSTEM_PROMPT),
        HumanMessage(content=prompt),
    ])

    return {
        "packing_list": response.content,
        "messages": [AIMessage(content="Packing checklist generated")],
        "llm_calls": bump_llm_calls(state),
    }
