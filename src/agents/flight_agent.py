"""Turns the user query into concrete flight guidance using AviationStack MCP."""

import json
import re

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from src.agents.prompts import FLIGHT_AGENT_PROMPT, FLIGHT_SYSTEM_PROMPT
from src.clients.llm import get_llm
from src.config.settings import (
    AIRLINE_DATA_CHAR_LIMIT,
    AIRPORT_DATA_CHAR_LIMIT,
)
from src.graph.state import TravelState
from src.mcp_servers.local import aviation_mcp_call
from src.utils.async_utils import bump_llm_calls, run_async, truncate


_CITY_RE = re.compile(r"\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b")


def _extract_cities(query: str):
    cities = []
    for m in _CITY_RE.findall(query):
        low = m.lower()
        if low in {"plan", "trip", "from", "to", "in", "for", "with", "days", "day"}:
            continue
        if m not in cities:
            cities.append(m)
    return cities


def _to_text(data):
    if isinstance(data, str):
        return data
    try:
        return json.dumps(data)
    except Exception:
        return str(data)


def _filter_airports(airports, cities):
    text = _to_text(airports)
    if not cities:
        return text
    filtered = []
    for line in text.splitlines():
        low = line.lower()
        if any(c.lower() in low for c in cities):
            filtered.append(line)
    if filtered:
        return "\n".join(filtered[:80])
    return text


def _filter_airlines(airlines, cities):
    text = _to_text(airlines)
    if not cities:
        return text
    filtered = []
    for line in text.splitlines():
        low = line.lower()
        if any(c.lower() in low for c in cities) or "international" in low or "air" in low:
            filtered.append(line)
    if filtered:
        return "\n".join(filtered[:60])
    return text


def flight_agent(state: TravelState):
    print("\nINSIDE FLIGHT AGENT\n")

    query = state["user_query"]
    cities = _extract_cities(query)

    try:
        airports = run_async(aviation_mcp_call("list_airports"))
        airlines = run_async(aviation_mcp_call("list_airlines"))

        airports_f = _filter_airports(airports, cities)
        airlines_f = _filter_airlines(airlines, cities)

        prompt = FLIGHT_AGENT_PROMPT.format(
            query=query,
            airport_data=truncate(airports_f, max(AIRPORT_DATA_CHAR_LIMIT // 2, 1500)),
            airline_data=truncate(airlines_f, max(AIRLINE_DATA_CHAR_LIMIT // 2, 1000)),
        )

        response = get_llm().invoke([
            SystemMessage(content=FLIGHT_SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ])

        flight_data = response.content

    except Exception as e:
        flight_data = f"Flight information unavailable: {str(e)}"

    return {
        "flight_results": flight_data,
        "messages": [
            AIMessage(content="Flight recommendations generated")
        ],
        "llm_calls": bump_llm_calls(state),
    }
