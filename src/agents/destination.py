"""Pulls the destination out of a free-form travel query."""

import re

from src.agents.prompts import DESTINATION_EXTRACTION_PROMPT
from src.clients.cache import cached
from src.clients.llm import get_llm
from src.config.settings import CACHE_TTL_DESTINATION


def _fallback_destination(query: str) -> str:
    m = re.search(r"(?:to|in)\s+([A-Za-z\s]{2,30})", query, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return query.strip()


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
