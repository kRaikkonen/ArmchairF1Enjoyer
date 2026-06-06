"""Tests for results.py — uses the committed FastF1 meta fixture, no network.

The meta fixture stores the exact rows FastF1 returns from
``session.results.to_dict("records")``, so feeding its ``results`` list to
extract_results reproduces what build_track.py does at pipeline time.
"""

import json
from pathlib import Path

import pytest

from src.results import extract_results, _classify

FIXTURE = Path(__file__).parent / "fixtures" / "bahrain-2025-meta.json"


@pytest.fixture(scope="module")
def meta_records():
    meta = json.loads(FIXTURE.read_text(encoding="utf-8"))
    return meta["results"]


@pytest.fixture(scope="module")
def results(meta_records):
    return extract_results(meta_records)


def test_classify_codes():
    assert _classify("1") == "finished"
    assert _classify("18") == "finished"
    assert _classify("R") == "dnf"
    assert _classify("D") == "dsq"
    assert _classify(" 5 ") == "finished"  # tolerant of whitespace


def test_sorted_by_position(results):
    positions = [r["position"] for r in results]
    assert positions == sorted(positions)


def test_schema_keys(results):
    for r in results:
        assert set(r.keys()) == {
            "position", "driverId", "driverNumber", "team", "classifiedPosition", "status", "dnf",
        }
        assert r["dnf"] == (r["status"] != "finished")


# ---- ground-truth facts the old hand-typed block got wrong ----

def test_ham_is_p5_finisher_not_dnf(results):
    ham = next(r for r in results if r["driverId"] == "HAM")
    assert ham["position"] == 5
    assert ham["status"] == "finished"
    assert ham["dnf"] is False


def test_hul_is_disqualified(results):
    hul = next(r for r in results if r["driverId"] == "HUL")
    assert hul["status"] == "dsq"
    assert hul["classifiedPosition"] == "D"
    assert hul["dnf"] is True


def test_roster_has_law_not_col(results):
    driver_ids = {r["driverId"] for r in results}
    assert "LAW" in driver_ids
    assert "COL" not in driver_ids  # COL did not race in 2025 Bahrain


def test_classified_finish_order_top5(results):
    classified = [r["driverId"] for r in results if r["status"] == "finished"]
    assert classified[:5] == ["PIA", "RUS", "NOR", "LEC", "HAM"]
