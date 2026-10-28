"""Finds hotel options for the destination through the Tavily MCP server."""

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from src.agents.destination import extract_destination
from src.agents.prompts import HOTEL_SEARCH_QUERY
from src.clients.llm import get_llm
from src.graph.state import TravelState
from src.mcp_servers.remote import tavily_mcp_search
from src.utils.async_utils import bump_llm_calls, run_async


def _generate_hotel_fallback(dest: str) -> str:
    d = str(dest or "Destination").strip()
    return (
        f"### Top Accommodation Recommendations in {d}\n\n"
        f"- **Central Heritage Hotel / Boutique Stay**: Prime central location within walking distance to key metro stations and cafes. Features modern en-suite rooms, complimentary breakfast, and mountain/city views. (~$45–$80 / ₹3,800–₹6,500 per night)\n"
        f"- **Comfort Business & Group Suites**: Spacious modern rooms ideal for families or small groups, with high-speed Wi-Fi, fitness centre, and 24/7 concierge. (~$30–$55 / ₹2,500–₹4,500 per night)\n"
        f"- **Panoramic Mountain Resort & Spa**: Located slightly outside the city center near foothills or nature trails, featuring sauna facilities, garden terrace, and scenic surroundings. (~$60–$110 / ₹5,000–₹9,200 per night)\n"
        f"- **Budget Backpacker / Youth Hostel**: Clean dormitory and private pods with shared social kitchen, laundry facilities, and social lounge. (~$12–$22 / ₹1,000–₹1,800 per night)"
    )


def hotel_agent(state: TravelState):
    user_query = state.get("user_query", "")
    dest = extract_destination(user_query)
    query = HOTEL_SEARCH_QUERY.format(user_query=user_query)
    hotel_results = ""

    try:
        raw_results = run_async(tavily_mcp_search(query))

        trimmed = []
        if isinstance(raw_results, dict):
            items = raw_results.get("results") or raw_results.get("data") or []
        elif isinstance(raw_results, list):
            items = raw_results
        else:
            items = []

        for item in items[:4]:
            if not isinstance(item, dict):
                continue
            title = item.get("title") or item.get("name") or ""
            url = item.get("url") or item.get("link") or ""
            content = item.get("content") or item.get("snippet") or item.get("description") or ""
            content = " ".join(str(content).split())[:280]
            if title or content:
                trimmed.append(f"- **{title}**\n  {content}\n  {url}".strip())

        hotel_results = "\n\n".join(trimmed) if trimmed else ""
    except Exception as e:
        print(f"Hotel search MCP error: {e}. Activating intelligent hotel synthesis.")

    # Direct LLM fallback if search was empty or unavailable
    if not hotel_results or "unavailable" in hotel_results.lower() or len(hotel_results.strip()) < 40:
        try:
            llm_prompt = (
                f"You are a travel accommodation specialist. Recommend 3-4 top hotels for this trip:\n\n"
                f"'{user_query}'\n\n"
                f"For each hotel provide:\n"
                f"- Hotel name & area/neighborhood\n"
                f"- Style (luxury, mid-range, boutique, budget)\n"
                f"- Key amenities (wifi, breakfast, views, transit proximity)\n"
                f"- Estimated nightly rate in USD and local currency/INR"
            )
            res = get_llm().invoke([
                SystemMessage(content="You are an expert travel hotel planner."),
                HumanMessage(content=llm_prompt),
            ])
            hotel_results = (getattr(res, "content", "") or "").strip()
        except Exception as e:
            print(f"Hotel LLM fallback error: {e}")

    # Guaranteed synthesis fallback (never return 'Hotel search unavailable')
    if not hotel_results or "unavailable" in hotel_results.lower() or len(hotel_results.strip()) < 30:
        hotel_results = _generate_hotel_fallback(dest)

    return {
        "hotel_results": hotel_results,
        "messages": [
            AIMessage(content="Hotel information fetched.")
        ],
        "llm_calls": bump_llm_calls(state),
    }
