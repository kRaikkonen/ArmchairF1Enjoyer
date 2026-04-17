"""Tests for fit.py — uses fixture parquet, no network."""

from pathlib import Path

import pandas as pd
import pytest

from src.clean import clean_laps
from src.fit import (
    DirtyAirModel,
    DrsBoostModel,
    StintProgressModel,
    TyreDegEntry,
    fit_dirty_air,
    fit_driver_offsets,
    fit_drs_boost,
    fit_stint_progress,
    fit_tyre_deg,
)

FIXTURE = Path(__file__).parent / "fixtures" / "bahrain-2025-laps.parquet"


@pytest.fixture(scope="module")
def laps():
    raw = pd.read_parquet(FIXTURE)
    return clean_laps(raw)


# ---- fit_stint_progress ----

def test_stint_progress_returns_model(laps):
    m = fit_stint_progress(laps)
    assert isinstance(m, StintProgressModel)


def test_stint_progress_slope_negative(laps):
    """Fuel burn → car gets faster → slope should be negative."""
    m = fit_stint_progress(laps)
    assert m.slope < 0, f"Expected negative slope, got {m.slope}"


def test_stint_progress_reasonable_magnitude(laps):
    """Physics model says ~-0.05 to -0.15 s/lap."""
    m = fit_stint_progress(laps)
    assert -0.25 < m.slope < 0.0, f"Slope {m.slope} outside plausible range"


def test_stint_progress_n_samples(laps):
    m = fit_stint_progress(laps)
    assert m.n_samples > 100


# ---- fit_tyre_deg ----

def test_tyre_deg_returns_dict(laps):
    result = fit_tyre_deg(laps)
    assert isinstance(result, dict)
    assert len(result) > 0


def test_tyre_deg_keys_are_tuples(laps):
    result = fit_tyre_deg(laps)
    for key in result:
        assert isinstance(key, tuple) and len(key) == 2


def test_tyre_deg_entries_have_required_fields(laps):
    result = fit_tyre_deg(laps)
    for entry in result.values():
        assert isinstance(entry, TyreDegEntry)
        assert hasattr(entry, "intercept")
        assert hasattr(entry, "deg_linear")
        assert hasattr(entry, "cliff_start")
        assert hasattr(entry, "insufficient")


def test_tyre_deg_covers_all_compounds(laps):
    result = fit_tyre_deg(laps)
    compounds = {c for (_, c) in result}
    assert "SOFT" in compounds
    assert "MEDIUM" in compounds
    assert "HARD" in compounds


def test_tyre_deg_insufficient_flagged(laps):
    """Groups with <20 samples must be flagged (e.g. Kick Sauber/SOFT = 3 laps)."""
    result = fit_tyre_deg(laps)
    low_sample = result.get(("Kick Sauber", "SOFT"))
    assert low_sample is not None
    assert low_sample.insufficient is True


# ---- fit_dirty_air ----

def test_dirty_air_returns_model(laps):
    m = fit_dirty_air(laps)
    assert isinstance(m, DirtyAirModel)


def test_dirty_air_penalty_non_negative(laps):
    m = fit_dirty_air(laps)
    assert m.penalty_sec >= 0


def test_dirty_air_has_samples(laps):
    m = fit_dirty_air(laps)
    assert m.n_samples_dirty > 0
    assert m.n_samples_clean > 0


# ---- fit_drs_boost ----

def test_drs_boost_returns_model(laps):
    m = fit_drs_boost(laps)
    assert isinstance(m, DrsBoostModel)


def test_drs_boost_non_positive(laps):
    """DRS can only make you faster."""
    m = fit_drs_boost(laps)
    assert m.boost_sec <= 0


def test_drs_boost_has_samples(laps):
    m = fit_drs_boost(laps)
    assert m.n_samples_drs > 0
    assert m.n_samples_no_drs > 0


# ---- fit_driver_offsets ----

def test_driver_offsets_returns_dict(laps):
    result = fit_driver_offsets(laps)
    assert isinstance(result, dict)
    assert len(result) == 20  # 20 drivers in Bahrain 2025


def test_driver_offsets_team_sum_near_zero(laps):
    """Within a team, offsets should roughly cancel (by construction)."""
    result = fit_driver_offsets(laps)
    from collections import defaultdict
    teams: dict = defaultdict(list)
    for entry in result.values():
        teams[entry.team].append(entry.offset_sec)

    for team, offsets in teams.items():
        if len(offsets) == 2:
            # Two teammates: sum should be ~0 (median-based, not exact)
            assert abs(sum(offsets)) < 2.0, f"{team} offset sum {sum(offsets)}"


def test_driver_offsets_have_n_samples(laps):
    result = fit_driver_offsets(laps)
    for entry in result.values():
        assert entry.n_samples > 0
