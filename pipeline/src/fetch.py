"""Fetch race session data from FastF1."""

import logging
from pathlib import Path

import fastf1

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).parent.parent / "cache"


def fetch_race(year: int, event: str) -> fastf1.core.Session:
    """Load a race session via FastF1, using local cache.

    Args:
        year: Season year (e.g. 2025).
        event: Event name or round number accepted by FastF1 (e.g. "Bahrain").

    Returns:
        Loaded FastF1 Session object with laps data.
    """
    fastf1.Cache.enable_cache(str(CACHE_DIR))
    session = fastf1.get_session(year, event, "R")
    session.load(laps=True, telemetry=False, weather=True, messages=True)
    logger.info(
        "Loaded %s %s Race: %d drivers, %d laps",
        year,
        event,
        len(session.drivers),
        len(session.laps),
    )
    return session
