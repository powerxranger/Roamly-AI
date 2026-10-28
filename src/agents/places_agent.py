"""Recommends must-visit places and local food."""

from langchain_core.messages import AIMessage

from src.agents.prompts import PLACES_SEARCH_QUERY
from src.graph.state import TravelState
from src.mcp_servers.remote import tavily_mcp_search
from src.utils.async_utils import bump_llm_calls, run_async


def places_agent(state: TravelState):
    query = PLACES_SEARCH_QUERY.format(user_query=state.get("user_query", ""))
    results = run_async(tavily_mcp_search(query))

    return {
        "must_visit": results,
        "messages": [AIMessage(content="Must-visit places fetched")],
        "llm_calls": bump_llm_calls(state),
    }
