"""
Groq chat model client with multi-model resilience, dynamic failover, and rate-limit shielding.
"""

import logging
import time
from functools import lru_cache
from typing import Any

from langchain_groq import ChatGroq

from src.config.session import require, resolve_groq_api_key
from src.config.settings import (
    GROQ_CONCIERGE_MAX_TOKENS,
    GROQ_MAX_TOKENS,
    GROQ_MODEL,
)

logger = logging.getLogger(__name__)

# High-capacity active production Groq models.
# llama-3.3-70b-versatile and llama-3.1-8b-instant provide 1,000,000 Tokens Per Day (TPD)
# and 128,000+ Tokens Per Minute (TPM), preventing rate limit exhaustion.
PRODUCTION_MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "gemma2-9b-it",
]


@lru_cache(maxsize=32)
def _build_raw_llm(model: str, api_key: str, max_tokens: int, temperature: float) -> ChatGroq:
    clean_key = (api_key or "").strip()
    kwargs = {
        "model": model,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "max_retries": 1,
    }
    if clean_key:
        kwargs["api_key"] = clean_key
    return ChatGroq(**kwargs)


class ResilientChatGroq:
    """
    Transparent ChatGroq wrapper that catches rate-limit errors (413/429/TPD/TPM)
    and rotates across high-capacity models seamlessly without failing the user.
    """

    def __init__(
        self,
        api_key: str,
        preferred_model: str,
        default_max_tokens: int,
        temperature: float = 0.3,
    ):
        self.api_key = api_key
        # Never default to an exhausted or low-quota model
        if "gpt-oss-20b" in preferred_model.lower():
            preferred_model = "llama-3.3-70b-versatile"
        self.preferred_model = preferred_model
        self.default_max_tokens = default_max_tokens
        self.temperature = temperature

    def invoke(self, input_data: Any, *args, **kwargs) -> Any:
        # Build candidate list starting with preferred_model
        candidates = [self.preferred_model]
        for m in PRODUCTION_MODELS:
            if m not in candidates:
                candidates.append(m)

        last_error = None
        for idx, model_name in enumerate(candidates):
            curr_max = self.default_max_tokens

            # Keep max_tokens prudent to conserve quota on smaller models
            if any(s in model_name.lower() for s in ["8b", "9b", "3b"]):
                curr_max = min(curr_max, 2500)

            client = _build_raw_llm(model_name, self.api_key, curr_max, self.temperature)
            try:
                response = client.invoke(input_data, *args, **kwargs)
                content = getattr(response, "content", "")
                # If model produced valid content, return immediately
                if content and str(content).strip():
                    return response

                # If model returned blank content, try next candidate
                logger.warning(
                    "Model '%s' returned blank response. Trying next candidate model...",
                    model_name
                )
                continue

            except Exception as e:
                err_str = str(e).lower()
                last_error = e

                # Check for rate limit, quota, decommissioned endpoint, or availability issues
                is_recoverable = any(
                    x in err_str
                    for x in [
                        "413",
                        "429",
                        "rate_limit",
                        "rate limit",
                        "tokens per minute",
                        "tokens per day",
                        "tpm",
                        "tpd",
                        "quota",
                        "request too large",
                        "model_not_found",
                        "not found",
                        "service unavailable",
                        "503",
                        "decommissioned",
                        "model_decommissioned",
                        "400",
                    ]
                )

                if is_recoverable:
                    logger.warning(
                        "Groq '%s' unavailable or rate-limited (%s). Switching to candidate %d/%d...",
                        model_name,
                        e,
                        idx + 2,
                        len(candidates),
                    )
                    time.sleep(0.2)
                    continue

                logger.warning(
                    "Unexpected error on model '%s': %s. Trying fallback model...",
                    model_name,
                    e,
                )
                continue

        if last_error:
            raise last_error
        raise RuntimeError("All available Groq model candidates failed.")

    def __getattr__(self, name: str) -> Any:
        client = _build_raw_llm(self.preferred_model, self.api_key, self.default_max_tokens, self.temperature)
        return getattr(client, name)


def get_llm(
    max_tokens: int | None = None,
    temperature: float = 0.3,
    model: str | None = None,
) -> ResilientChatGroq:
    """
    Returns a resilient Groq client configured for the current session key.
    """
    require("GROQ_API_KEY")
    api_key = resolve_groq_api_key()
    target_model = (model or GROQ_MODEL).strip()
    if "gpt-oss-20b" in target_model.lower():
        target_model = "llama-3.3-70b-versatile"
    target_max = max_tokens or GROQ_MAX_TOKENS

    return ResilientChatGroq(
        api_key=api_key,
        preferred_model=target_model,
        default_max_tokens=target_max,
        temperature=temperature,
    )


def get_concierge_llm() -> ResilientChatGroq:
    """
    Fast, focused LLM for conversational Q&A. Uses lightweight max_tokens
    and llama-3.1-8b-instant to ensure sub-second responses and zero rate limits.
    """
    return get_llm(
        max_tokens=GROQ_CONCIERGE_MAX_TOKENS,
        temperature=0.4,
        model="llama-3.1-8b-instant",
    )
