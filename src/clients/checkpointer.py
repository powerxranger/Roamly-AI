"""PostgreSQL or In-Memory checkpointer used by LangGraph to persist conversation threads."""

import logging
import psycopg
from psycopg.rows import dict_row

from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.postgres import PostgresSaver

from src.config.session import resolve_database_url

logger = logging.getLogger(__name__)

_global_memory_saver = MemorySaver()
_cached_connection = None
_cached_db_url = None
_cached_checkpointer = None


def reset_checkpointer_cache():
    """Clear cached connection and checkpointer (e.g. after remote disconnection)."""
    global _cached_connection, _cached_db_url, _cached_checkpointer
    if _cached_connection:
        try:
            _cached_connection.close()
        except Exception:
            pass
    _cached_connection = None
    _cached_db_url = None
    _cached_checkpointer = None


def _get_live_connection(database_url: str) -> psycopg.Connection:
    """Returns a verified live connection. Reconnects automatically if dropped."""
    global _cached_connection, _cached_db_url

    if _cached_connection is not None and _cached_db_url == database_url:
        try:
            if not _cached_connection.closed:
                # Fast heartbeat check to catch server-side SSL drops
                with _cached_connection.cursor() as cur:
                    cur.execute("SELECT 1")
                return _cached_connection
        except Exception as e:
            logger.info("Cached DB connection was closed by server (%s). Reconnecting...", e)
            try:
                _cached_connection.close()
            except Exception:
                pass
            _cached_connection = None

    # Enable TCP keepalives to prevent cloud proxies (Render, Neon, Supabase) from closing idle SSL connections
    conn_params = {}
    if "keepalives" not in database_url.lower():
        conn_params = {
            "keepalives": 1,
            "keepalives_idle": 30,
            "keepalives_interval": 10,
            "keepalives_count": 5,
        }

    conn = psycopg.connect(
        database_url,
        autocommit=True,
        row_factory=dict_row,
        connect_timeout=10,
        **conn_params
    )
    _cached_connection = conn
    _cached_db_url = database_url
    return conn


def get_connection(database_url: str) -> psycopg.Connection:
    """Public helper to get a verified live connection."""
    return _get_live_connection(database_url)


def get_checkpointer(database_url: str | None = None):
    """
    Returns a healthy checkpointer.
    If PostgreSQL fails or drops connection, safely falls back to in-memory checkpointer.
    """
    global _cached_checkpointer, _cached_db_url

    if not database_url:
        return _global_memory_saver

    try:
        conn = _get_live_connection(database_url)
        if _cached_checkpointer is not None and _cached_db_url == database_url:
            return _cached_checkpointer

        checkpointer = PostgresSaver(conn)
        checkpointer.setup()
        _cached_checkpointer = checkpointer
        return checkpointer
    except Exception as e:
        logger.warning("PostgreSQL connection failed (%s). Falling back to in-memory checkpointer.", e)
        reset_checkpointer_cache()
        return _global_memory_saver


def get_session_checkpointer():
    """Checkpointer for whichever database URL the current session resolves to."""
    return get_checkpointer(resolve_database_url())

