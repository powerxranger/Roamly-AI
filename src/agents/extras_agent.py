"""Merges budget, packing, must-visit picks, and travel essentials with guaranteed fallbacks."""

import re
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from src.agents.prompts import (
    EXTRAS_AGENT_PROMPT,
    EXTRAS_SYSTEM_PROMPT,
)
from src.clients.llm import get_llm
from src.graph.state import TravelState
from src.utils.async_utils import bump_llm_calls


def _extract_section(content: str, header_pattern: str, next_headers: list[str]) -> str:
    """Extract a markdown section by header name, up to the next known section or end of text."""
    pattern = (
        rf"(?i)(?:^|\n)(?:#{{1,4}}\s*|\*\*\s*|\d+\.\s*)?({header_pattern})(?:\*\*)?\s*[:\n]"
        rf"([\s\S]*?)(?=(?:\n(?:#{{1,4}}\s*|\*\*\s*|\d+\.\s*)(?:{'|'.join(next_headers)})\b|\Z))"
    )
    match = re.search(pattern, content)
    if match:
        body = match.group(2).strip()
        header = match.group(1).strip()
        return f"### {header}\n\n{body}"
    return ""


def _extract_number(text: str, pattern: str, default: int) -> int:
    m = re.search(pattern, text, re.IGNORECASE)
    if m:
        try:
            return int(m.group(1).replace(",", ""))
        except Exception:
            return default
    return default


def extract_budget_info(query: str, dest: str = "") -> dict:
    """
    Universally extracts budget amount, currency symbol, code, and formatted text from any user query.
    Supports EUR (€), GBP (£), USD ($), JPY (¥), INR (₹ / Lakhs), AED, SAR, and other world currencies.
    Detects patterns like 'budget of 80000 euro', '€80,000', '80k euro', '$5,000', '1.5 lakh', 'under £4,500'.
    """
    q = str(query or "").strip().lower()
    clean_dest = str(dest or "").lower()

    # Currency map with canonical codes and symbols
    CURRENCY_MAP = {
        "euro": ("€", "EUR", "Euro"),
        "euros": ("€", "EUR", "Euro"),
        "eur": ("€", "EUR", "Euro"),
        "€": ("€", "EUR", "Euro"),
        "gbp": ("£", "GBP", "British Pound"),
        "pound": ("£", "GBP", "British Pound"),
        "pounds": ("£", "GBP", "British Pound"),
        "£": ("£", "GBP", "British Pound"),
        "usd": ("$", "USD", "US Dollar"),
        "dollar": ("$", "USD", "US Dollar"),
        "dollars": ("$", "USD", "US Dollar"),
        "$": ("$", "USD", "US Dollar"),
        "jpy": ("¥", "JPY", "Japanese Yen"),
        "yen": ("¥", "JPY", "Japanese Yen"),
        "¥": ("¥", "JPY", "Japanese Yen"),
        "inr": ("₹", "INR", "Indian Rupee"),
        "rs": ("₹", "INR", "Indian Rupee"),
        "rs.": ("₹", "INR", "Indian Rupee"),
        "rupee": ("₹", "INR", "Indian Rupee"),
        "rupees": ("₹", "INR", "Indian Rupee"),
        "₹": ("₹", "INR", "Indian Rupee"),
        "aed": ("AED ", "AED", "UAE Dirham"),
        "dirham": ("AED ", "AED", "UAE Dirham"),
        "dirhams": ("AED ", "AED", "UAE Dirham"),
        "sar": ("SAR ", "SAR", "Saudi Riyal"),
        "riyal": ("SAR ", "SAR", "Saudi Riyal"),
        "riyals": ("SAR ", "SAR", "Saudi Riyal"),
        "aud": ("A$", "AUD", "Australian Dollar"),
        "cad": ("C$", "CAD", "Canadian Dollar"),
        "sgd": ("S$", "SGD", "Singapore Dollar"),
        "chf": ("CHF ", "CHF", "Swiss Franc"),
    }

    # 1. Lakhs / Lacs notation: e.g. "1.5 lakh", "2 lakhs", "1.5 lac" -> INR (₹)
    m_lakh = re.search(r"(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs)\b", q)
    if m_lakh:
        amt = int(float(m_lakh.group(1)) * 100000)
        return {
            "amount": amt,
            "symbol": "₹",
            "code": "INR",
            "name": "Indian Rupee",
            "formatted": f"₹{amt:,}",
            "has_explicit_budget": True,
        }

    # 2. Currency symbol prefix with number: e.g. "€80,000", "€ 80000", "$5,000", "£4,500", "¥500,000", "₹1,60,000", "€80k"
    m_sym = re.search(r"([€$£¥₹])\s*([\d,]+(?:\.\d+)?)\s*(k\b)?", query, re.IGNORECASE)
    if m_sym:
        sym = m_sym.group(1)
        raw_val = float(m_sym.group(2).replace(",", ""))
        if m_sym.group(3):
            raw_val *= 1000
        amt = int(raw_val)
        curr_info = CURRENCY_MAP.get(sym, (sym, "CUSTOM", "Currency"))
        return {
            "amount": amt,
            "symbol": curr_info[0],
            "code": curr_info[1],
            "name": curr_info[2],
            "formatted": f"{curr_info[0]}{amt:,}",
            "has_explicit_budget": True,
        }

    # 3. Phrasing with "budget of", "budget", "under", "cost", "max": e.g. "budget of 80000 euro", "under 80,000 EUR", "budget of 5000 USD"
    curr_tokens_regex = r"(?:euro|euros|eur|€|usd|dollars?|\$|gbp|pounds?|£|jpy|yen|¥|inr|rs\.?|rupees?|₹|aed|dirhams?|sar|riyals?|aud|cad|sgd|chf)"
    m_phrase = re.search(
        rf"(?:budget(?:\s+of)?|under|cost(?:\s+of)?|max(?:\s+of)?)\s*[:\s]*"
        rf"([€$£¥₹])?\s*([\d,]+(?:\.\d+)?)\s*(k\b)?\s*({curr_tokens_regex})?",
        q,
        re.IGNORECASE,
    )
    if m_phrase and (m_phrase.group(1) or m_phrase.group(4)):
        sym_token = (m_phrase.group(1) or m_phrase.group(4) or "").lower()
        curr_info = CURRENCY_MAP.get(sym_token, ("€" if "eur" in sym_token or "euro" in sym_token else ("₹", "INR", "INR")))
        raw_val = float(m_phrase.group(2).replace(",", ""))
        if m_phrase.group(3):
            raw_val *= 1000
        amt = int(raw_val)
        return {
            "amount": amt,
            "symbol": curr_info[0],
            "code": curr_info[1],
            "name": curr_info[2],
            "formatted": f"{curr_info[0]}{amt:,}",
            "has_explicit_budget": True,
        }

    # 4. Number followed by currency code/word: e.g. "80000 euro", "80000 euros", "80,000 EUR", "80k euro", "5000 usd", "4500 gbp"
    m_suffix = re.search(
        rf"([\d,]+(?:\.\d+)?)\s*(k\b)?\s*({curr_tokens_regex})\b",
        q,
        re.IGNORECASE,
    )
    if m_suffix:
        raw_val = float(m_suffix.group(1).replace(",", ""))
        if m_suffix.group(2):
            raw_val *= 1000
        amt = int(raw_val)
        curr_token = m_suffix.group(3).lower()
        curr_info = CURRENCY_MAP.get(curr_token, ("€" if "eur" in curr_token or "euro" in curr_token else ("₹", "INR", "INR")))
        return {
            "amount": amt,
            "symbol": curr_info[0],
            "code": curr_info[1],
            "name": curr_info[2],
            "formatted": f"{curr_info[0]}{amt:,}",
            "has_explicit_budget": True,
        }

    # 5. Phrasing with "budget of [number]" without explicit currency token
    m_num_only = re.search(
        r"(?:budget(?:\s+of)?|under|cost(?:\s+of)?|max(?:\s+of)?)\s*[:\s]*([\d,]+(?:\.\d+)?)\s*(k\b)?",
        q,
        re.IGNORECASE,
    )
    if m_num_only:
        raw_val = float(m_num_only.group(1).replace(",", ""))
        if m_num_only.group(2):
            raw_val *= 1000
        amt = int(raw_val)
        # Infer currency from destination or origin hints
        is_eu = any(x in clean_dest for x in ["paris", "france", "rome", "italy", "spain", "amsterdam", "europe", "germany"])
        is_us = any(x in clean_dest for x in ["usa", "new york", "america", "california"])
        is_uk = any(x in clean_dest for x in ["london", "uk", "scotland", "england"])
        is_jp = any(x in clean_dest for x in ["japan", "tokyo", "kyoto", "osaka"])
        if is_eu:
            sym, code, name = "€", "EUR", "Euro"
        elif is_us:
            sym, code, name = "$", "USD", "US Dollar"
        elif is_uk:
            sym, code, name = "£", "GBP", "British Pound"
        elif is_jp:
            sym, code, name = "¥", "JPY", "Japanese Yen"
        else:
            sym, code, name = "₹", "INR", "Indian Rupee"
        return {
            "amount": amt,
            "symbol": sym,
            "code": code,
            "name": name,
            "formatted": f"{sym}{amt:,}",
            "has_explicit_budget": True,
        }

    # 6. Default Fallback when no budget was mentioned in query
    is_eu = any(x in clean_dest for x in ["paris", "france", "rome", "italy", "spain", "amsterdam", "europe", "germany"])
    if is_eu:
        return {
            "amount": 2500,
            "symbol": "€",
            "code": "EUR",
            "name": "Euro",
            "formatted": "€2,500",
            "has_explicit_budget": False,
        }
    return {
        "amount": 150000,
        "symbol": "₹",
        "code": "INR",
        "name": "Indian Rupee",
        "formatted": "₹1,50,000",
        "has_explicit_budget": False,
    }


def _extract_budget_amount(query: str) -> tuple[int, str]:
    """Returns (total_amount, currency_symbol) from user query for backward compatibility."""
    info = extract_budget_info(query)
    return info["amount"], info["symbol"]


def _generate_fallback_budget(query: str, dest: str) -> str:
    b_info = extract_budget_info(query, dest)
    total_amt = b_info["amount"]
    curr = b_info["symbol"]
    people = _extract_number(query, r"(\d+)\s*(?:people|person|traveller|travelers|adults)", 2)
    per_person = total_amt // max(people, 1)

    # Exact allocation percentages summing to 100% without rounding drift
    flight_share = int(total_amt * 0.38)
    hotel_share = int(total_amt * 0.30)
    food_share = int(total_amt * 0.16)
    transit_share = int(total_amt * 0.08)
    activities_share = total_amt - (flight_share + hotel_share + food_share + transit_share)

    return (
        f"### Budget Breakdown\n\n"
        f"- Flights: {curr}{flight_share:,} estimated round-trip total for {people} travellers\n"
        f"- Hotels (stay): {curr}{hotel_share:,} total for group accommodation in {dest}\n"
        f"- Food & Dining: {curr}{food_share:,} for authentic meals, street food & group dinners\n"
        f"- Local Transport: {curr}{transit_share:,} for airport transfers, private minibus & metro\n"
        f"- Sightseeing & Activities: {curr}{activities_share:,} for museum entries, cable cars & day trips\n"
        f"- Total Estimated Cost: {curr}{total_amt:,} total estimated trip budget\n"
        f"- Cost Per Person: {curr}{per_person:,} per person ({people} travellers)\n"
    )


def _generate_fallback_packing(dest: str, weather_summary: str) -> str:
    is_cold = bool(re.search(r"snow|cold|winter|chill|below|5°|6°|7°|8°|9°|10°", weather_summary, re.IGNORECASE))
    clothing_advice = (
        "Thermal base layers, fleece jacket, windproof coat, gloves & beanie"
        if is_cold
        else "Breathable cotton t-shirts, light sweater, sunglasses & comfortable walking pants"
    )
    return (
        f"### Packing Checklist\n\n"
        f"- Essentials: Passport (valid 6+ mos), visa copy, travel insurance, flight tickets, hotel vouchers, debit/credit cards\n"
        f"- Clothing: {clothing_advice}\n"
        f"- Footwear: Broken-in cushioned walking shoes, moisture-wicking socks, waterproof boots if hiking\n"
        f"- Toiletries & Health: Lip balm, high-SPF moisturizer, basic med kit (paracetamol, altitude/motion sickness tablets)\n"
        f"- Electronics: Universal travel adapter, 10,000mAh+ power bank, smartphone with offline maps\n"
        f"- Extras: Compact umbrella, reusable insulated water bottle, daypack for excursions\n"
    )


def _generate_fallback_must_visit(dest: str) -> str:
    d_lower = (dest or "").lower()
    if any(x in d_lower for x in ["japan", "tokyo", "kyoto", "osaka"]):
        return (
            f"### Must-Visit & Local Picks\n\n"
            f"- Top Attractions: Fushimi Inari Taisha (Kyoto), Senso-ji Temple & Shibuya Sky (Tokyo), Arashiyama Bamboo Forest, Dotonbori Canal (Osaka)\n"
            f"- Hidden Gems: Yanaka old-town district (Tokyo), Omoide Yokocho lantern-lit alley, Uji green tea fields, Gion Shirakawa quiet canals\n"
            f"- Local Food & Drinks: Fresh Tsukiji sushi & sashimi, authentic Tonkotsu ramen, hot takoyaki, savory okonomiyaki, matcha sweets & Japanese draft beer\n"
            f"- Local Experience Tips: Visit major shrines at sunrise to enjoy serenity; get an IC card (Suica/Pasmo) for instant tap-and-go travel on all subways and trains\n"
        )
    if any(x in d_lower for x in ["italy", "rome", "florence", "venice", "milan"]):
        return (
            f"### Must-Visit & Local Picks\n\n"
            f"- Top Attractions: The Colosseum & Roman Forum, Vatican Museums & St. Peter's, Florence Duomo & Uffizi, Venice Grand Canal\n"
            f"- Hidden Gems: Trastevere cobblestone backstreets, Oltrarno artisan leather workshops, Cannaregio quiet wine bars in Venice\n"
            f"- Local Food & Drinks: Cacio e Pepe, Neapolitan wood-fired pizza, Bistecca alla Fiorentina, artisanal pistachio gelato, Aperol Spritz\n"
            f"- Local Experience Tips: Book Colosseum and Vatican skip-the-line tickets weeks early; enjoy early evening aperitivo with complimentary appetizers\n"
        )
    return (
        f"### Must-Visit & Local Picks\n\n"
        f"- Top Attractions: Iconic heritage landmarks, historic old town district, panoramic viewpoint lookouts & national monuments in {dest}\n"
        f"- Hidden Gems: Atmospheric neighborhood side streets, quiet cultural courtyards & scenic waterfront or garden walks\n"
        f"- Local Food & Drinks: Celebrated regional specialties, fresh local market delicacies, artisan bakeries & signature beverages\n"
        f"- Local Experience Tips: Explore the central market in the morning for fresh seasonal produce and authentic local encounters\n"
    )


def _generate_fallback_essentials(dest: str) -> str:
    d_lower = (dest or "").lower()
    if any(x in d_lower for x in ["japan", "tokyo", "kyoto", "osaka"]):
        return (
            f"### Travel Essentials\n\n"
            f"- Visa & Entry: Apply for Japan Tourist eVisa (or 90-day visa waiver depending on passport); passport must be valid for stay duration\n"
            f"- Currency & Payments: Japanese Yen (JPY); cards widely accepted in department stores, but carry ¥10,000–¥20,000 cash for temples, shrines & ramen ticket machines\n"
            f"- Timezone: Japan Standard Time (JST, UTC+9)\n"
            f"- Electrical: 100V, 50/60Hz, Type A and Type B plugs (two flat parallel pins; carry a flat-pin universal travel adapter)\n"
            f"- Connectivity: Buy an airport eSIM (Airalo or Ubigi) or rent a pocket Wi-Fi router upon arrival at Haneda/Narita\n"
            f"- Local Transport Tips: Buy a digital Suica/Pasmo card on Apple/Google Wallet for all subways, buses, and 7-Eleven vending; use Shinkansen for intercity travel\n"
            f"- Safety & Emergency: Exceptionally safe country; emergency numbers: 110 for Police, 119 for Ambulance and Fire\n"
        )
    if any(x in d_lower for x in ["italy", "rome", "florence", "venice", "milan"]):
        return (
            f"### Travel Essentials\n\n"
            f"- Visa & Entry: Schengen Visa required for non-EU travelers; passport must be valid for at least 3 months beyond departure date\n"
            f"- Currency & Payments: Euro (€); credit cards widely accepted; keep €30–€50 cash for small cafes and gelato\n"
            f"- Timezone: Central European Time (CET, UTC+1 / CEST, UTC+2 in summer)\n"
            f"- Electrical: 230V, 50Hz, European Type C, F, and L plugs\n"
            f"- Connectivity: Affordable local tourist SIM or regional EU eSIM gives seamless coverage across all member countries\n"
            f"- Local Transport Tips: Book Frecciarossa high-speed trains early for 50%+ discounts; always validate paper bus/tram tickets before boarding\n"
            f"- Safety & Emergency: Watch personal belongings in crowded metro stations and tourist plazas; call 112 for all EU emergency services\n"
        )
    return (
        f"### Travel Essentials\n\n"
        f"- Visa & Entry: Check electronic visa or visa-on-arrival eligibility; ensure passport has at least 6 months validity\n"
        f"- Currency & Payments: Local currency & major cards; carry small cash denominations for local stalls & taxis\n"
        f"- Timezone & Timing: Check destination local UTC offset; morning hours are best for popular monuments\n"
        f"- Electrical: Check plug type and carry a universal travel adapter\n"
        f"- Connectivity: Buy an airport tourist eSIM or local SIM card for navigation and translation\n"
        f"- Local Transport Tips: Use official ride-hailing apps or local metro systems with clear metered fares\n"
        f"- Safety & Emergency: Store digital copies of passport and travel insurance on your phone; note local emergency numbers\n"
    )


def extras_agent(state: TravelState):
    from src.agents.destination import extract_destination
    user_query = state.get("user_query", "")
    dest = state.get("destination") or extract_destination(user_query) or "Destination"
    weather = state.get("weather_results", "")

    b_info = extract_budget_info(user_query, dest)
    budget_instruction = ""
    if b_info["has_explicit_budget"]:
        budget_instruction = (
            f"\n\nMANDATORY USER BUDGET REQUIREMENT:\n"
            f"The traveler has explicitly specified a total trip budget of {b_info['formatted']} ({b_info['name']}). "
            f"You MUST generate the 'Budget Breakdown' section strictly in {b_info['name']} using symbol {b_info['symbol']} ({b_info['code']}). "
            f"The 'Total Estimated Cost' MUST be exactly {b_info['formatted']}. "
            f"Ensure all line items (Flights, Hotels, Food, Transport, Activities) are in {b_info['symbol']} and sum up to {b_info['formatted']}."
        )

    # Token-efficient truncated context (prevents 4,000-token prompt bloat)
    prompt = EXTRAS_AGENT_PROMPT.format(
        user_query=user_query + budget_instruction,
        flight_results=state.get("flight_results", "")[:1000],
        hotel_results=state.get("hotel_results", "")[:1000],
        weather_results=weather[:600],
        itinerary=state.get("itinerary", "")[:1200],
    )

    content = ""
    try:
        response = get_llm(max_tokens=1800).invoke([
            SystemMessage(content=EXTRAS_SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ])
        content = getattr(response, "content", "") or ""
    except Exception as e:
        print(f"Extras agent warning: {e}. Activating intelligent synthesis fallback.")

    budget_breakdown = _extract_section(
        content,
        r"Budget Breakdown",
        [r"Packing Checklist", r"Must-Visit", r"Travel Essentials"],
    )
    packing_list = _extract_section(
        content,
        r"Packing Checklist",
        [r"Must-Visit", r"Travel Essentials", r"Budget Breakdown"],
    )
    must_visit = _extract_section(
        content,
        r"Must-Visit & Local Picks|Must-Visit|Local Picks",
        [r"Travel Essentials", r"Budget Breakdown", r"Packing Checklist"],
    )
    travel_essentials = _extract_section(
        content,
        r"Travel Essentials",
        [r"Budget Breakdown", r"Packing Checklist", r"Must-Visit"],
    )

    # GUARANTEED REFLECTION: Never leave sections missing or empty for any trip
    # If LLM didn't produce budget_breakdown, OR if user requested a specific currency and LLM used the wrong one:
    needs_budget_fallback = False
    if not budget_breakdown:
        needs_budget_fallback = True
    elif b_info["has_explicit_budget"]:
        sym = b_info["symbol"].strip()
        code = b_info["code"].strip()
        if sym not in budget_breakdown and code not in budget_breakdown:
            needs_budget_fallback = True

    if needs_budget_fallback:
        budget_breakdown = _generate_fallback_budget(user_query, dest)
    if not packing_list:
        packing_list = _generate_fallback_packing(dest, weather)
    if not must_visit:
        must_visit = _generate_fallback_must_visit(dest)
    if not travel_essentials:
        travel_essentials = _generate_fallback_essentials(dest)

    return {
        "budget_breakdown": budget_breakdown,
        "packing_list": packing_list,
        "must_visit": must_visit,
        "travel_essentials": travel_essentials,
        "messages": [AIMessage(content="Trip extras generated")],
        "llm_calls": bump_llm_calls(state),
    }
