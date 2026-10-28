"""PostgreSQL or In-Memory checkpointer used by LangGraph to persist conversation threads."""

from functools import lru_cache

import psycopg
from psycopg.rows import dict_row

from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.postgres import PostgresSaver

from src.config.session import resolve_database_url

_global_memory_saver = MemorySaver()


@lru_cache(maxsize=4)
def get_connection(database_url: str) -> psycopg.Connection:
    return psycopg.connect(
        database_url,
        autocommit=True,
        row_factory=dict_row,
    )


@lru_cache(maxsize=4)
def get_checkpointer(database_url: str | None = None):
    if not database_url:
        return _global_memory_saver

    try:
        checkpointer = PostgresSaver(get_connection(database_url))
        checkpointer.setup()
        return checkpointer
    except Exception as e:
        print(f"PostgreSQL connection failed ({e}). Falling back to in-memory checkpointer.")
        return _global_memory_saver


def get_session_checkpointer():
    """Checkpointer for whichever database URL the current session resolves to."""
    return get_checkpointer(resolve_database_url())
