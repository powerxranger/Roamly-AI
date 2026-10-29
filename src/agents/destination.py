"""Pulls the destination out of a free-form travel query."""

import re

from src.agents.prompts import DESTINATION_EXTRACTION_PROMPT
from src.clients.cache import cached
from src.clients.llm import get_llm
from src.config.settings import CACHE_TTL_DESTINATION


def _fallback_destination(query: str) -> str:
    q = query.strip()
    # Strip months and seasons first so "Italy in July" doesn't capture "in"
    m = re.search(
        r"(?:to|visit|explore|travel to)\s+([A-Za-z\s,-]{2,30}?)(?=\s+(?:from|for|in\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|spring|summer|winter|autumn)|during|with|on|departing|under|budget|\.|\,|$))",
        q,
        re.IGNORECASE,
    )
    if not m:
        m = re.search(r"(?:to|in)\s+([A-Za-z\s]{2,30})", q, re.IGNORECASE)

    if m:
        dest = m.group(1).strip()
        # Clean trailing prepositions like "in", "to", "for"
        dest = re.sub(r"\s+(?:in|to|for|from|with|and|or)$", "", dest, flags=re.IGNORECASE).strip()
        dest = re.sub(r"^(?:the|a|an)\s+", "", dest, flags=re.IGNORECASE).strip()
        return dest

    return q


@cached(prefix="destination", ttl=CACHE_TTL_DESTINATION)
def extract_destination(query: str) -> str:
    """
    Cached: the same query always maps to the same destination, so this
    LLM call is pure overhead on a repeat.
    """

    try:
        prompt = DESTINATION_EXTRACTION_PROMPT.format(query=query)
        response = get_llm().invoke(prompt)
        dest = response.content.strip()
        return dest or _fallback_destination(query)
    except Exception as e:
        print(f"Destination extraction error: {e}")
        return _fallback_destination(query)
