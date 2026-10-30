"""Pulls the destination out of a free-form travel query."""

import re

from src.agents.prompts import DESTINATION_EXTRACTION_PROMPT
from src.clients.cache import cached
from src.clients.llm import get_llm
from src.config.settings import CACHE_TTL_DESTINATION


KNOWN_DESTINATIONS = [
    # Middle East & Gulf
    "Saudi Arabia", "Riyadh", "Jeddah", "AlUla", "Abha", "Farasan Islands", "Dammam", "Mecca", "Medina", "Taif", "Umluj",
    "UAE", "Dubai", "Abu Dhabi", "Sharjah", "Ras Al Khaimah", "Fujairah",
    "Oman", "Muscat", "Salalah", "Qatar", "Doha", "Bahrain", "Manama", "Kuwait",
    "Jordan", "Amman", "Petra", "Aqaba",
    # Asia
    "Japan", "Tokyo", "Kyoto", "Osaka", "Hokkaido", "Okinawa", "Nara", "Hiroshima", "Hakone", "Fuji",
    "Thailand", "Bangkok", "Phuket", "Chiang Mai", "Krabi", "Koh Samui", "Pattaya",
    "Indonesia", "Bali", "Jakarta", "Lombok", "Yogyakarta",
    "Singapore", "Malaysia", "Kuala Lumpur", "Penang", "Langkawi",
    "Vietnam", "Hanoi", "Ho Chi Minh", "Da Nang", "Hoi An", "Phu Quoc",
    "South Korea", "Seoul", "Busan", "Jeju",
    "India", "Goa", "Kerala", "Rajasthan", "Jaipur", "Udaipur", "Ladakh", "Leh", "Manali", "Kashmir", "Varanasi", "Mumbai", "Delhi", "Bengaluru", "Agra",
    "Maldives", "Sri Lanka", "Colombo", "Galle", "Kandy", "Nepal", "Kathmandu", "Pokhara", "Bhutan",
    "Philippines", "Manila", "Boracay", "Palawan", "Cebu",
    "Taiwan", "Taipei", "Hong Kong", "China", "Beijing", "Shanghai",
    # Europe
    "Italy", "Rome", "Florence", "Venice", "Milan", "Amalfi", "Naples", "Sicily", "Tuscany", "Lake Como",
    "France", "Paris", "Nice", "Lyon", "Marseille", "Bordeaux", "French Riviera",
    "Spain", "Barcelona", "Madrid", "Seville", "Valencia", "Ibiza", "Mallorca", "Granada",
    "United Kingdom", "UK", "London", "Edinburgh", "Scotland", "Manchester",
    "Switzerland", "Zurich", "Geneva", "Lucerne", "Interlaken", "Zermatt", "Swiss Alps",
    "Greece", "Athens", "Santorini", "Mykonos", "Crete", "Rhodes",
    "Germany", "Berlin", "Munich", "Frankfurt", "Hamburg",
    "Netherlands", "Amsterdam", "Rotterdam",
    "Portugal", "Lisbon", "Porto", "Algarve", "Madeira",
    "Austria", "Vienna", "Salzburg", "Innsbruck",
    "Czech Republic", "Prague", "Hungary", "Budapest",
    "Turkey", "Istanbul", "Cappadocia", "Antalya", "Bodrum",
    "Norway", "Oslo", "Tromso", "Bergen", "Iceland", "Reykjavik",
    "Ireland", "Dublin", "Croatia", "Dubrovnik", "Split",
    "Sweden", "Stockholm", "Finland", "Helsinki", "Denmark", "Copenhagen", "Poland", "Krakow",
    # Americas & Oceania
    "USA", "New York", "San Francisco", "Los Angeles", "Las Vegas", "Miami", "Hawaii", "Orlando", "Chicago",
    "Canada", "Vancouver", "Toronto", "Montreal", "Banff",
    "Mexico", "Cancun", "Mexico City", "Tulum",
    "Brazil", "Rio de Janeiro", "Argentina", "Buenos Aires",
    "Australia", "Sydney", "Melbourne", "Brisbane", "Perth", "Cairns",
    "New Zealand", "Auckland", "Queenstown",
    # Central Asia & Caucasus
    "Georgia", "Tbilisi", "Almaty", "Kazakhstan", "Uzbekistan", "Tashkent", "Samarkand", "Baku", "Azerbaijan",
    # Africa
    "Egypt", "Cairo", "Luxor", "Sharm El Sheikh", "Hurghada",
    "Morocco", "Marrakech", "Casablanca", "Fes",
    "South Africa", "Cape Town", "Johannesburg",
    "Kenya", "Nairobi", "Tanzania", "Zanzibar", "Seychelles", "Mauritius",
]


def is_greeting_or_banter(query: str) -> bool:
    """Detect if the query is a conversational greeting, check-in, or casual banter."""
    if not query:
        return False
    q = query.strip().lower()
    # Strip trailing punctuation for reliable matching (e.g. "heyy!", "hiii?", "hello...")
    q_clean = re.sub(r"[?!.,;]+$", "", q).strip()
    return bool(
        re.search(
            r"^(?:hey+|heya|heyo|hello+|hi+|hiya+|yo+|sup|howdy|aloha|hola|bonjour|greetings?|good\s+(?:morning|afternoon|evening|day))\b|"
            r"\b(?:how(?:'s| is|s)?\s*(?:it|things?|you|u|life|everything)|what(?:'s|s)?\s*up|how\s+are\s+you|how\s+do\s+you\s+do|how\s+it\s+going|how\s+its\s+going)\b|"
            r"\b(?:how\s+are\s+things|how\s+are\s+you\s+doing)\b|"
            r"^(?:bro|mate|dude|buddy|friend)\b",
            q_clean,
        )
    )


def is_invalid_destination(cand: str) -> bool:
    """Strictly validate whether a candidate string is an actual destination name or conversational noise."""
    if not cand:
        return True
    c = cand.strip().lower()
    if len(c) < 2 or len(c) > 30:
        return True
    if any(ch in c for ch in ["?", "!", "@", "#", "$", "%", "*", "_"]):
        return True
    if is_greeting_or_banter(c):
        return True
    words = set(re.findall(r"\b[a-z']+\b", c))
    conversational_tokens = {
        "how", "its", "it", "going", "bro", "hey", "hello", "hi", "what", "whats", "what's",
        "hows", "how's", "are", "you", "u", "doing", "good", "fine", "thanks", "thank",
        "asking", "dude", "mate", "there", "is", "can", "tell", "help", "wanna", "want",
        "free", "time", "chaos", "away", "locate", "sup", "yo", "where", "why", "when",
        "your", "destination", "custom"
    }
    if any(tok in conversational_tokens for tok in words):
        return True
    if c in {"your destination", "destination", "custom destination", "custom trip", "home", "a day", "two days", "somewhere"}:
        return True
    return False


def _clean_destination_candidate(dest: str) -> str:
    """Strip conversational noise, filler words, and prepositions from destination candidates."""
    if not dest:
        return ""
    cand = dest.strip()
    cand = re.sub(
        r"\b(?:like|maybe|please|just|want|wanna|plan|trip|vacation|getaway|explore|visit|looking for|help me|going to|travel to|locate me to|locate me|free time|away from|chaos|some calm place in|calm place in|calm places in|peaceful place in|quiet place in|some place in|place in|spots in|places in|spot in|somewhere in)\b",
        "",
        cand,
        flags=re.IGNORECASE,
    ).strip()
    cand = re.sub(r"^(?:the|a|an|in|at|around|to|of)\s+", "", cand, flags=re.IGNORECASE).strip()
    cand = re.sub(r"\s+(?:in|at|to|for|from|with|and|or)$", "", cand, flags=re.IGNORECASE).strip()
    cand = re.sub(r'^["\']|["\']$', "", cand).strip()
    if is_invalid_destination(cand):
        return ""
    return cand.strip()


def extract_trip_locations(query: str) -> dict[str, str]:
    """
    Confidently and accurately recognizes Departure Origin (Source) and Arrival Target (Destination).
    Guarantees:
    1. Origin is recognized even in twisted queries like:
       - 'I want a 5 day Paris trip in July from Delhi. Find flights...' -> origin: 'Delhi', destination: 'Paris'
       - '7 day Japan trip from India in April...' -> origin: 'India', destination: 'Japan'
       - 'Trip from Mumbai to Bali for 5 days' -> origin: 'Mumbai', destination: 'Bali'
       - 'Plan a 7 day trip to Tokyo from Dhaka in April...' -> origin: 'Dhaka', destination: 'Tokyo'
       - '5 day trip in Paris departing from Delhi' -> origin: 'Delhi', destination: 'Paris'
    2. Origin can NEVER be assigned as the Destination.
    3. Conversational noise, months, durations, and non-travel words are never extracted.
    """
    if not query:
        return {"origin": "", "destination": ""}

    q = query.strip()
    if is_greeting_or_banter(q):
        dest = ""
        for d in sorted(KNOWN_DESTINATIONS, key=len, reverse=True):
            if re.search(r"\b" + re.escape(d) + r"\b", q, re.IGNORECASE):
                dest = d
                break
        return {"origin": "", "destination": dest}

    # Step 1: Extract Origin (Departure / Source)
    # Match patterns like: "from Delhi.", "from Delhi,", "from Delhi in July", "departing from Delhi"
    origin = ""
    origin_pattern = (
        r"\b(?:from|departing\s+from|departing|leaving\s+from|leaving|out\s+of|origin[:\s]+)\s+"
        r"([A-Za-z\s,-]{2,25}?)"
        r"(?=[.,;!?]|\s+(?:to\b|in\b|for\b|with\b|during\b|departing\b|under\b|budget\b|find\b|flights?\b|hotels?\b|weather\b|and\b|$)|$)"
    )
    m_orig = re.search(origin_pattern, q, re.IGNORECASE)
    if m_orig:
        raw_orig = m_orig.group(1).strip()
        raw_orig = re.sub(r"^[,\s.-]+|[,\s.-]+$", "", raw_orig)
        cleaned_orig = _clean_destination_candidate(raw_orig)
        invalid_origins = {
            "chaos", "scratch", "home", "now", "here", "me", "there", "us", "today", "tomorrow",
            "july", "june", "august", "april", "may", "march", "january", "february", "september",
            "october", "november", "december", "airport", "centre", "center", "centre"
        }
        if cleaned_orig and cleaned_orig.lower() not in invalid_origins:
            for d in KNOWN_DESTINATIONS:
                if d.lower() == cleaned_orig.lower() or re.search(r"\b" + re.escape(d) + r"\b", cleaned_orig, re.IGNORECASE):
                    origin = d
                    break
            if not origin and len(cleaned_orig) >= 2:
                origin = cleaned_orig.title()

    # Step 2: Extract Destination (Arrival / Target) - Origin can NEVER be Destination
    destination = ""

    # Strategy 1: "from [Origin] to [Destination]"
    m_from_to = re.search(r"\bfrom\s+[A-Za-z\s,-]{2,25}?\s+to\s+([A-Za-z\s,-]{2,25})\b", q, re.IGNORECASE)
    if m_from_to:
        cand = _clean_destination_candidate(m_from_to.group(1))
        cand = re.sub(r"\b(for|with|in|during|under|budget|mid-range|luxury|days?|nights?)\b.*$", "", cand, flags=re.IGNORECASE).strip()
        if cand and (not origin or cand.lower() != origin.lower()):
            for d in KNOWN_DESTINATIONS:
                if d.lower() == cand.lower() or re.search(r"\b" + re.escape(d) + r"\b", cand, re.IGNORECASE):
                    destination = d
                    break
            if not destination and len(cand) >= 2:
                destination = cand.title()

    # Strategy 2: "[Destination] (?:trip|getaway|vacation|tour|holiday|itinerary)"
    # E.g.: "I want a 5 day Paris trip in July from Delhi..." -> matches "5 day Paris trip" -> "Paris"
    if not destination:
        m_trip_pattern = re.search(
            r"\b([A-Za-z\s]{2,25}?)\s+(?:trip|getaway|vacation|tour|holiday|itinerary)\b",
            q,
            re.IGNORECASE
        )
        if m_trip_pattern:
            raw_cand = m_trip_pattern.group(1).strip()
            raw_cand = re.sub(
                r"\b(?:want|wanna|plan|create|build|need|book|a|an|the|\d+|day|days|night|nights|beach|scenic|rail|short|long|budget|luxury|solo|family|custom)\b",
                "",
                raw_cand,
                flags=re.IGNORECASE
            ).strip()
            cand = _clean_destination_candidate(raw_cand)
            if cand and len(cand) >= 2 and (not origin or (cand.lower() != origin.lower() and origin.lower() not in cand.lower())):
                for d in KNOWN_DESTINATIONS:
                    if d.lower() == cand.lower() or re.search(r"\b" + re.escape(d) + r"\b", cand, re.IGNORECASE):
                        destination = d
                        break
                if not destination and len(cand) >= 2 and not is_invalid_destination(cand):
                    destination = cand.title()

    # Strategy 3: Dedicated Calm / Peaceful / Scenic retreats in [Destination]
    if not destination:
        m_calm = re.search(
            r"\b(?:calm|peaceful|quiet|scenic|relaxing|hidden|serene|tranquil|isolated|untouched|good|nice|best|any)\s+"
            r"(?:place|places|spot|spots|destination|destinations|getaway|getaways|area|areas|retreat|retreats|location|locations|town|towns|village|villages|island|islands)\s+"
            r"(?:in|around|near|at|of)\s+([A-Za-z\s,-]{2,30}?)(?=[.,;!?]|\s+(?:for|with|during|from|\.|\,|$)|$)",
            q,
            re.IGNORECASE
        )
        if m_calm:
            cand = _clean_destination_candidate(m_calm.group(1))
            if cand and (not origin or cand.lower() != origin.lower()):
                for d in KNOWN_DESTINATIONS:
                    if d.lower() == cand.lower() or re.search(r"\b" + re.escape(d) + r"\b", cand, re.IGNORECASE):
                        destination = d
                        break
                if not destination and len(cand) >= 2:
                    destination = cand.title()

    # Strategy 4: "to/visit/explore/travel to/going to [Destination]"
    if not destination:
        m_to = re.search(
            r"(?:to|visit|explore|travel to|going to|getaway to|vacation in|holiday in|locate me to)\s+"
            r"([A-Za-z\s,-]{2,30}?)"
            r"(?=[.,;!?]|\s+(?:from|for|in\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|spring|summer|winter|autumn)|during|with|on|departing|under|budget|\.|\,|$)|$)",
            q,
            re.IGNORECASE
        )
        if m_to:
            cand = _clean_destination_candidate(m_to.group(1))
            if cand and len(cand) >= 2 and (not origin or (cand.lower() != origin.lower() and origin.lower() not in cand.lower())):
                for d in KNOWN_DESTINATIONS:
                    if d.lower() == cand.lower() or re.search(r"\b" + re.escape(d) + r"\b", cand, re.IGNORECASE):
                        destination = d
                        break
                if not destination and len(cand) >= 2 and not is_invalid_destination(cand):
                    destination = cand.title()

    # Strategy 5: Scan KNOWN_DESTINATIONS in query, STRICTLY skipping the identified origin
    if not destination:
        for d in sorted(KNOWN_DESTINATIONS, key=len, reverse=True):
            if origin and (d.lower() == origin.lower() or origin.lower() in d.lower() or d.lower() in origin.lower()):
                continue
            if re.search(r"\b" + re.escape(d) + r"\b", q, re.IGNORECASE):
                destination = d
                break

    # Strategy 6: Inverted / Prepositional "[Destination] from [Origin]"
    if not destination and origin:
        m_inv = re.search(
            r"\b([A-Za-z\s]{2,20}?)(?:\s+(?:in|for|during)\s+[A-Za-z0-9\s]+)?\s+from\s+",
            q,
            re.IGNORECASE
        )
        if m_inv:
            cand = _clean_destination_candidate(m_inv.group(1))
            non_dest = {"want", "wanna", "plan", "days", "day", "nights", "night", "trip", "flights", "hotels"}
            if cand and cand.lower() not in non_dest and len(cand) >= 2 and (not origin or cand.lower() != origin.lower()):
                for d in KNOWN_DESTINATIONS:
                    if d.lower() == cand.lower() or re.search(r"\b" + re.escape(d) + r"\b", cand, re.IGNORECASE):
                        destination = d
                        break
                if not destination and not is_invalid_destination(cand):
                    destination = cand.title()

    return {"origin": origin, "destination": destination}


def _fallback_destination(query: str) -> str:
    locs = extract_trip_locations(query)
    return locs.get("destination", "")


@cached(prefix="destination", ttl=CACHE_TTL_DESTINATION)
def extract_destination(query: str) -> str:
    """
    Cached: extracts the destination with origin-exclusion safeguard and sentence-cleansing.
    """
    # If query is purely greeting/banter, don't call LLM and never extract a fake destination
    if is_greeting_or_banter(query):
        return extract_trip_locations(query).get("destination", "")

    locs = extract_trip_locations(query)
    deterministic_dest = locs.get("destination", "")
    origin = locs.get("origin", "")

    # If deterministic extractor confidently found a known destination, return it immediately!
    if deterministic_dest:
        return deterministic_dest

    try:
        origin_instruction = f"NOTE: The user is departing from '{origin}'. NEVER extract '{origin}' as the destination.\n" if origin else ""
        prompt = f"{origin_instruction}{DESTINATION_EXTRACTION_PROMPT.format(query=query)}"
        response = get_llm().invoke(prompt)
        dest = (getattr(response, "content", "") or "").strip()
        dest = re.sub(r'^["\']|["\']$', '', dest).strip()

        # Sanity check 1: Reject invalid, conversational, or sentence outputs from LLM
        if is_invalid_destination(dest):
            return _fallback_destination(query)

        # Sanity check 2: Ensure the extracted destination is NOT the departure origin
        if origin and dest and (dest.lower() == origin.lower() or origin.lower() in dest.lower() or dest.lower() in origin.lower()):
            return _fallback_destination(query)

        final_dest = dest or _fallback_destination(query)
        return "" if is_invalid_destination(final_dest) else final_dest
    except Exception as e:
        print(f"Destination extraction error: {e}")
        final_dest = _fallback_destination(query)
        return "" if is_invalid_destination(final_dest) else final_dest
