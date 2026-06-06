#!/usr/bin/env python
"""Controlled engine-consistency diagnostic — Python side (MEASUREMENT ONLY).

Goal (PLAN §8.3 vs §8.4): decide whether the TS engine's race-level maxErr=8
comes from engine inconsistency (§8.3) or from forward-sim product logic
(noise + greedy AI strategy). To do that we need an apples-to-apples baseline:
the *same* replay the Python backtest does (real strategy, real pit/SC laps,
clean laps swapped for fitted predictions, no noise / no AI / neutral ERS).

This script:
  1. Rebuilds the Bahrain model from the offline lap fixture (no network — the
     same fits build_track.py runs; FastF1 session is only needed for results,
     which we already have as the FastF1-derived results in bahrain.json).
  2. Runs the canonical Python backtest -> reports Python maxErr.
  3. Dumps per-lap rows (incl. Python's predicted clean-lap time) + the actual
     classified finishing order to JSON, so the TS diagnostic can replay the
     identical structure with the TS computeLapTime core and compare.

Does NOT modify any engine/fitting logic. Run:
    conda run -n f1apt python pipeline/scripts/controlled_consistency_dump.py
"""

import json
import logging
from pathlib import Path

import pandas as pd

import sys
ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))

from src.backtest import TrackModel, backtest, _predict_lap_time
from src.clean import clean_laps
from src.fit import (
    fit_dirty_air,
    fit_driver_offsets,
    fit_drs_boost,
    fit_stint_progress,
    fit_tyre_deg,
)

logging.basicConfig(level=logging.WARNING)

FIXTURE = ROOT / "pipeline" / "tests" / "fixtures" / "bahrain-2025-laps.parquet"
MODEL_JSON = ROOT / "models" / "tracks" / "2025" / "bahrain.json"
OUT = ROOT / "pipeline" / "scripts" / "controlled_consistency_dump.json"


def build_model(laps: pd.DataFrame, year: int, event: str) -> TrackModel:
    """Rebuild the in-memory TrackModel from clean laps (same fits as build_track)."""
    return TrackModel(
        season=year,
        event=event,
        track_base_pace=float(laps.loc[laps["IsClean"], "LapTimeSec"].median()),
        stint_progress=fit_stint_progress(laps),
        tyre_deg=fit_tyre_deg(laps),
        dirty_air=fit_dirty_air(laps),
        drs_boost=fit_drs_boost(laps),
        driver_offsets=fit_driver_offsets(laps),
    )


def main() -> None:
    raw = pd.read_parquet(FIXTURE)
    laps = clean_laps(raw)
    model = build_model(laps, 2025, "Bahrain")

    # Actual classified finishing order from the FastF1-derived SSOT (bahrain.json).
    results = json.loads(MODEL_JSON.read_text(encoding="utf-8"))["results"]
    classified = [r for r in results if r["status"] == "finished"]
    classified_ids = {r["driverId"] for r in classified}
    actual_order = [r["driverId"] for r in sorted(classified, key=lambda r: r["position"])]

    # Canonical Python backtest (its own actual_pos = last recorded Position).
    report = backtest(model, laps, classified_drivers=classified_ids)
    print(f"[python] canonical backtest all_max_err = {report.max_all_error}")
    print(f"[python] canonical backtest top5_max_err = {report.max_top5_error}")

    # Per-lap dump: include Python's predicted clean-lap time so TS can compare.
    rows = []
    for _, r in laps.iterrows():
        is_clean = bool(r["IsClean"])
        py_pred = (
            _predict_lap_time(
                lap_number=r["LapsSinceStart"],
                stint_lap=int(r["StintLap"]),
                team=r["Team"],
                compound=r["Compound"],
                driver_id=r["Driver"],
                model=model,
            )
            if is_clean
            else None
        )
        rows.append(
            {
                "driver": r["Driver"],
                "team": r["Team"],
                "compound": r["Compound"],
                "stintLap": int(r["StintLap"]),
                "lapsSinceStart": float(r["LapsSinceStart"]),
                "lapNumber": int(r["LapNumber"]),
                "isClean": is_clean,
                "lapTimeSec": float(r["LapTimeSec"]),
                "pyPredLapTime": (None if py_pred is None or pd.isna(py_pred) else float(py_pred)),
            }
        )

    payload = {
        "classifiedIds": sorted(classified_ids),
        "actualOrder": actual_order,
        "pythonAllMaxErr": report.max_all_error,
        "rows": rows,
    }
    OUT.write_text(json.dumps(payload), encoding="utf-8")
    print(f"[python] dumped {len(rows)} lap rows -> {OUT}")


if __name__ == "__main__":
    main()
