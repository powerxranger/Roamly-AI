"""Finds hotel options for the destination through the Tavily MCP server."""

from langchain_core.messages import AIMessage

from src.agents.prompts import HOTEL_SEARCH_QUERY
from src.graph.state import TravelState
from src.mcp_servers.remote import tavily_mcp_search
from src.utils.async_utils import bump_llm_calls, run_async


def hotel_agent(state: TravelState):
    query = HOTEL_SEARCH_QUERY.format(user_query=state.get("user_query", ""))

    try:
        raw_results = run_async(tavily_mcp_search(query))

        trimmed = []
        if isinstance(raw_results, dict):
            items = raw_results.get("results") or raw_results.get("data") or []
        elif isinstance(raw_results, list):
            items = raw_results
        else:
            items = []

        for item in items[:3]:
            if not isinstance(item, dict):
                continue
            title = item.get("title") or item.get("name") or ""
            url = item.get("url") or item.get("link") or ""
            content = item.get("content") or item.get("snippet") or item.get("description") or ""
            content = " ".join(str(content).split())[:280]
            if title or content:
                trimmed.append(f"- {title}\n  {content}\n  {url}".strip())

        hotel_results = "\n\n".join(trimmed) if trimmed else str(raw_results)[:1500]
    except Exception as e:
        print(f"Hotel agent error: {e}")
        hotel_results = f"Hotel search unavailable: {str(e)}"

    return {
        "hotel_results": hotel_results,
        "messages": [
            AIMessage(content="Hotel information fetched.")
        ],
        "llm_calls": bump_llm_calls(state),
    }
