"""Shared state passed between every node of the travel graph."""

import operator
from typing import Annotated, TypedDict

from langchain_core.messages import AnyMessage


class TravelState(TypedDict, total=False):
    messages: Annotated[list[AnyMessage], operator.add]
    user_query: str
    destination: str
    origin: str
    flight_results: str
    hotel_results: str
    itinerary: str
    llm_calls: int
    weather_results: str
    budget_breakdown: str
    packing_list: str
    must_visit: str
    travel_essentials: str


def initial_state(user_query: str) -> TravelState:
    """Build the empty state the graph starts from."""

    from langchain_core.messages import HumanMessage
    from src.agents.destination import _clean_destination_candidate, extract_destination, extract_trip_locations

    locs = extract_trip_locations(user_query)
    dest = _clean_destination_candidate(locs.get("destination", "") or extract_destination(user_query))
    orig = locs.get("origin", "")
    if not dest or len(dest) > 35:
        dest = "Saudi Arabia" if "saudi" in user_query.lower() else "Custom Destination"

    return {
        "messages": [HumanMessage(content=user_query)],
        "user_query": user_query,
        "destination": dest,
        "origin": orig,
        "flight_results": "",
        "hotel_results": "",
        "weather_results": "",
        "itinerary": "",
        "llm_calls": 0,
        "budget_breakdown": "",
        "packing_list": "",
        "must_visit": "",
        "travel_essentials": "",
    }
