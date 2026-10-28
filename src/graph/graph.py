"""Wires the agents together into the LangGraph workflow."""

from functools import lru_cache

from langgraph.graph import END, START, StateGraph

from src.agents.extras_agent import extras_agent
from src.agents.final_agent import final_agent
from src.agents.flight_agent import flight_agent
from src.agents.hotel_agent import hotel_agent
from src.agents.itinerary_agent import itinerary_agent
from src.agents.weather_agent import weather_agent
from src.clients.checkpointer import get_checkpointer
from src.config.session import require, resolve_database_url
from src.graph.state import TravelState


def build_graph() -> StateGraph:
    """Build the uncompiled graph. Useful for tests and for visualisation."""

    graph = StateGraph(TravelState)

    graph.add_node("flight_agent", flight_agent)
    graph.add_node("weather_agent", weather_agent)
    graph.add_node("hotel_agent", hotel_agent)
    graph.add_node("itinerary_agent", itinerary_agent)
    graph.add_node("extras_agent", extras_agent)
    graph.add_node("final_agent", final_agent)

    graph.add_edge(START, "flight_agent")
    graph.add_edge("flight_agent", "weather_agent")
    graph.add_edge("weather_agent", "hotel_agent")
    graph.add_edge("hotel_agent", "itinerary_agent")
    graph.add_edge("itinerary_agent", "extras_agent")
    graph.add_edge("extras_agent", "final_agent")
    graph.add_edge("final_agent", END)

    return graph


@lru_cache(maxsize=4)
def _compiled_graph(database_url: str):
    return build_graph().compile(checkpointer=get_checkpointer(database_url or None))


def get_travel_graph():
    url = resolve_database_url()
    return _compiled_graph(url or "")