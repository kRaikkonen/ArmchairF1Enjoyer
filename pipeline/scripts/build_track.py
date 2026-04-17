#!/usr/bin/env python
"""Build and validate a TrackModel JSON for one race weekend.

Usage:
    conda run -n f1apt python pipeline/scripts/build_track.py bahrain 2025

Exits with code 1 if backtest acceptance criteria are not met.
"""

import json
import logging
import sys
from pathlib import Path

# Allow running from project root or pipeline/scripts/
ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))

import pandas as pd

from src.backtest import TrackModel, backtest
from src.clean import clean_laps
from src.export import export_track
from src.fetch import fetch_race
from src.fit import (
    fit_dirty_air,
    fit_driver_offsets,
    fit_drs_boost,
    fit_stint_progress,
    fit_tyre_deg,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("build_track")

# Acceptance thresholds (from tasks/phase-0-bahrain.md)
MAX_TOP5_POS_ERROR = 2
MAX_ALL_POS_ERROR = 4
MAX_TOP3_TIME_ERROR_SEC = 5.0


def build(event_slug: str, year: int) -> None:
    event_map = {
        "bahrain": "Bahrain",
    }
    event_name = event_map.get(event_slug.lower(), event_slug)

    logger.info("=== build_track: %s %d ===", event_name, year)

    # 1. Fetch
    logger.info("Step 1/5: fetch")
    session = fetch_race(year, event_name)

    # 2. Clean
    logger.info("Step 2/5: clean")
    laps = clean_laps(session)

    # 3. Fit
    logger.info("Step 3/5: fit")
    sp_model = fit_stint_progress(laps)
    tyre_deg = fit_tyre_deg(laps)
    dirty_air = fit_dirty_air(laps)
    drs_boost = fit_drs_boost(laps)
    driver_offsets = fit_driver_offsets(laps)

    track_base_pace = float(laps.loc[laps["IsClean"], "LapTimeSec"].median())
    logger.info("Track base pace (median clean lap): %.3f s", track_base_pace)

    insufficient_groups = [
        f"{t}/{c}({e.n_samples})"
        for (t, c), e in tyre_deg.items()
        if e.insufficient
    ]
    logger.info(
        "Insufficient tyre groups: %s",
        ", ".join(insufficient_groups) if insufficient_groups else "none",
    )

    model = TrackModel(
        season=year,
        event=event_name,
        track_base_pace=track_base_pace,
        stint_progress=sp_model,
        tyre_deg=tyre_deg,
        dirty_air=dirty_air,
        drs_boost=drs_boost,
        driver_offsets=driver_offsets,
        fit_meta={
            "nCleanLaps": int(laps["IsClean"].sum()),
            "nTotalLaps": len(laps),
            "insufficientTyreGroups": insufficient_groups,
            "dirtyAirInsufficient": dirty_air.insufficient,
            "drsBoostInsufficient": drs_boost.insufficient,
        },
    )

    # 4. Backtest — derive classified finishers from session results
    logger.info("Step 4/5: backtest")
    classified_drivers = {
        r["Abbreviation"]
        for r in session.results.to_dict("records")
        if str(r.get("ClassifiedPosition", "")).isdigit()
    }
    logger.info("Classified finishers (%d): %s", len(classified_drivers), sorted(classified_drivers))
    report = backtest(model, laps, classified_drivers=classified_drivers)

    logger.info("--- Backtest results ---")
    logger.info("top5 pos errors:   %s  (max=%d)", report.top5_pos_errors, report.max_top5_error)
    logger.info("all  pos errors:   %s  (max=%d)", report.all_pos_errors, report.max_all_error)
    logger.info("top3 time errors:  %s s  (max=%.1f)", report.top3_time_errors_sec, report.max_top3_time_error)
    logger.info("Backtest: %s", "PASS" if report.passes else "FAIL")

    if not report.passes:
        logger.error(
            "Backtest FAILED. Criteria: top5≤%d, all≤%d, top3_time≤%.0fs",
            MAX_TOP5_POS_ERROR, MAX_ALL_POS_ERROR, MAX_TOP3_TIME_ERROR_SEC,
        )
        sys.exit(1)

    # 5. Export
    logger.info("Step 5/5: export")
    out_path = ROOT / "models" / "tracks" / str(year) / f"{event_slug.lower()}.json"
    export_track(model, out_path)
    logger.info("=== Done: %s ===", out_path)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <event_slug> <year>", file=sys.stderr)
        sys.exit(1)
    build(sys.argv[1], int(sys.argv[2]))
