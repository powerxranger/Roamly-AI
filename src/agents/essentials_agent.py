"""Gives travel essentials like visa, currency, plugs."""

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from src.agents.prompts import ESSENTIALS_AGENT_PROMPT, ESSENTIALS_SYSTEM_PROMPT
from src.clients.llm import get_llm
from src.graph.state import TravelState
from src.utils.async_utils import bump_llm_calls


def essentials_agent(state: TravelState):
    prompt = ESSENTIALS_AGENT_PROMPT.format(
        user_query=state.get("user_query", ""),
    )

    response = get_llm().invoke([
        SystemMessage(content=ESSENTIALS_SYSTEM_PROMPT),
        HumanMessage(content=prompt),
    ])

    return {
        "travel_essentials": response.content,
        "messages": [AIMessage(content="Travel essentials generated")],
        "llm_calls": bump_llm_calls(state),
    }
