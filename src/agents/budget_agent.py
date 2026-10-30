"""Creates a realistic budget breakdown for the trip."""

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from src.agents.extras_agent import _generate_fallback_budget, extract_budget_info
from src.agents.prompts import BUDGET_AGENT_PROMPT, BUDGET_SYSTEM_PROMPT
from src.clients.llm import get_llm
from src.graph.state import TravelState
from src.utils.async_utils import bump_llm_calls


def budget_agent(state: TravelState):
    user_query = state.get("user_query", "")
    dest = state.get("destination", "")
    b_info = extract_budget_info(user_query, dest)

    budget_instruction = ""
    if b_info["has_explicit_budget"]:
        budget_instruction = (
            f"\n\nMANDATORY USER BUDGET REQUIREMENT:\n"
            f"The traveler has explicitly set a total trip budget of {b_info['formatted']} ({b_info['name']}). "
            f"You MUST generate the Budget Breakdown strictly in {b_info['name']} using symbol {b_info['symbol']} ({b_info['code']}). "
            f"The 'Total Estimated Cost' MUST be exactly {b_info['formatted']}. "
            f"All category costs must sum up to {b_info['formatted']}."
        )

    prompt = BUDGET_AGENT_PROMPT.format(
        user_query=user_query + budget_instruction,
        flight_results=state.get("flight_results", ""),
        hotel_results=state.get("hotel_results", ""),
    )

    budget_breakdown = ""
    try:
        response = get_llm().invoke([
            SystemMessage(content=BUDGET_SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ])
        budget_breakdown = getattr(response, "content", "") or ""
    except Exception as e:
        print(f"Budget agent error: {e}. Using fallback budget.")

    if not budget_breakdown or (b_info["has_explicit_budget"] and b_info["symbol"].strip() not in budget_breakdown and b_info["code"] not in budget_breakdown):
        budget_breakdown = _generate_fallback_budget(user_query, dest)

    return {
        "budget_breakdown": budget_breakdown,
        "messages": [AIMessage(content="Budget breakdown generated")],
        "llm_calls": bump_llm_calls(state),
    }
