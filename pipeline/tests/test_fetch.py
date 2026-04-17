"""Tests for fetch.py — use cached data only, no network."""

import fastf1
import pytest

from src.fetch import fetch_race


def test_fetch_race_returns_session():
    """fetch_race returns a loaded Session with laps."""
    session = fetch_race(2025, "Bahrain")
    assert isinstance(session, fastf1.core.Session)
    assert len(session.laps) > 0


def test_fetch_race_has_weather():
    """Session contains weather data needed for weatherDelta."""
    session = fetch_race(2025, "Bahrain")
    assert session.weather_data is not None
    assert len(session.weather_data) > 0


def test_fetch_race_has_results():
    """Session results are present for backtest comparison."""
    session = fetch_race(2025, "Bahrain")
    assert session.results is not None
    assert len(session.results) > 0
