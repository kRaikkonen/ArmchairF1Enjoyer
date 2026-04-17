"""Tests for clean.py — uses fixture parquet, no network."""

from pathlib import Path

import pandas as pd
import pytest

from src.clean import clean_laps

FIXTURE = Path(__file__).parent / "fixtures" / "bahrain-2025-laps.parquet"


@pytest.fixture(scope="module")
def raw_laps():
    return pd.read_parquet(FIXTURE)


@pytest.fixture(scope="module")
def cleaned(raw_laps):
    return clean_laps(raw_laps)


def test_output_columns(cleaned):
    for col in ("LapTimeSec", "StintLap", "LapsSinceStart", "IsClean"):
        assert col in cleaned.columns, f"Missing column: {col}"


def test_no_nan_lap_time(cleaned):
    assert cleaned["LapTimeSec"].notna().all()


def test_lap_time_range(cleaned):
    # Bahrain lap times should be roughly 90–150 s
    assert cleaned["LapTimeSec"].min() > 80
    assert cleaned["LapTimeSec"].max() < 200


def test_stint_lap_starts_at_one(cleaned):
    assert cleaned["StintLap"].min() == 1


def test_isclean_flag(cleaned):
    # At minimum, green-flag accurate laps with no pit should be clean
    assert cleaned["IsClean"].any()
    # Pit-in laps must not be clean
    pit_in = cleaned["PitInTime"].notna()
    assert (cleaned.loc[pit_in, "IsClean"] == False).all()  # noqa: E712


def test_clean_laps_compound_coverage(cleaned):
    # Bahrain 2025 used SOFT, MEDIUM, HARD
    compounds = set(cleaned.loc[cleaned["IsClean"], "Compound"].unique())
    assert len(compounds) >= 2
