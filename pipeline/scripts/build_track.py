#!/usr/bin/env python
"""Build and validate a TrackModel JSON for one race — OFFLINE from fixtures.

The online pull (fetch_fixture.py) is a separate, human-sanctioned step that
writes the committed fixtures. This build is fully offline + reproducible:
  laps    ← tests/fixtures/<slug>-<year>-laps.parquet
  results ← tests/fixtures/<slug>-<year>-meta.json   (single source of truth)
  outline ← scripts/outline-<slug>.json               (from fetch_fixture)
  facts   ← extracted from the lap parquet

Acceptance gate (PLAN §10 decision): the honest model can miss the strict gate,
so we DON'T hard-fail. We record the real numbers, badge the track 'limited' if
it misses, always export, and sync to web/public. Poor-accuracy tracks ship
with a "数据不足/仅供参考" flag rather than being silently dropped.

Run: conda run -n f1apt python pipeline/scripts/build_track.py <slug> <year>
"""

import hashlib
import json
import logging
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))

import numpy as np
import pandas as pd

from src.backtest import TrackModel, backtest
from src.clean import clean_laps
from src.export import SCHEMA_VERSION, export_track
from src.results import extract_results
from src.fit import (
    fit_dirty_air, fit_driver_offsets, fit_drs_boost, fit_stint_progress, fit_tyre_deg,
)
import importlib.util

# load extract_race_facts.extract without making scripts a package
_spec = importlib.util.spec_from_file_location("erf", ROOT / "pipeline" / "scripts" / "extract_race_facts.py")
_erf = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_erf)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("build_track")

FIXTURES = ROOT / "pipeline" / "tests" / "fixtures"
MAX_TOP5_POS_ERROR, MAX_ALL_POS_ERROR, MAX_TOP3_TIME_ERROR_SEC = 2, 6, 5.0  # relaxed gate (§10)


def derive_pit_lane_sec(raw: pd.DataFrame) -> float | None:
    """Rough per-track pit-lane delta (s, in+out, excl. stationary) from the
    in-/out-lap time loss vs each driver's clean median. Clamped to a sane range."""
    df = raw.copy()
    df["sec"] = pd.to_timedelta(df["LapTime"]).dt.total_seconds()
    losses: list[float] = []
    for _, d in df.groupby("Driver"):
        clean = d[d["PitInTime"].isna() & d["PitOutTime"].isna()]["sec"].dropna()
        if len(clean) < 5:
            continue
        base = float(clean.median())
        inl = d[d["PitInTime"].notna()]["sec"].dropna().tolist()
        outl = d[d["PitOutTime"].notna()]["sec"].dropna().tolist()
        for a, b in zip(inl, outl):
            losses.append((a - base) + (b - base))
    if not losses:
        return None
    total = float(np.median(losses))   # full pit-time loss incl. stationary
    return round(max(10.0, min(30.0, total - 2.5)), 1)  # subtract default stationary


def build(slug: str, year: int) -> None:
    laps_path = FIXTURES / f"{slug}-{year}-laps.parquet"
    meta_path = FIXTURES / f"{slug}-{year}-meta.json"
    if not laps_path.exists() or not meta_path.exists():
        logger.error("Missing fixtures for %s %d — run fetch_fixture.py first.", slug, year)
        sys.exit(1)

    raw = pd.read_parquet(laps_path)
    # FastF1 spells the intermediate tyre 'INTERMEDIATE'; the TS engine's Compound
    # union and every UI badge map use 'INTER'. Normalize once at the source so the
    # fitted tyreDeg keys, race facts, and start compounds all match the engine
    # contract. Dry races never hit this; wet races (AUS/GBR 2025) do — without it
    # the engine applies the slick-in-rain penalty to inter-shod cars (PLAN §8.1).
    raw["Compound"] = raw["Compound"].replace({"INTERMEDIATE": "INTER"})
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    event = meta["event"]
    logger.info("=== build_track: %s %d (%s) ===", slug, year, event)

    laps = clean_laps(raw)
    tyre_deg = fit_tyre_deg(laps)
    track_base_pace = float(laps.loc[laps["IsClean"], "LapTimeSec"].median())
    insufficient = [f"{t}/{c}({e.n_samples})" for (t, c), e in tyre_deg.items() if e.insufficient]

    model = TrackModel(
        season=year, event=event, slug=slug, track_base_pace=track_base_pace,
        stint_progress=fit_stint_progress(laps), tyre_deg=tyre_deg,
        dirty_air=fit_dirty_air(laps), drs_boost=fit_drs_boost(laps),
        driver_offsets=fit_driver_offsets(laps),
        fit_meta={
            "nCleanLaps": int(laps["IsClean"].sum()), "nTotalLaps": len(laps),
            "insufficientTyreGroups": insufficient,
        },
    )

    # SSOT results + race facts + metadata
    model.results = extract_results(meta["results"])
    classified = {r["driverId"] for r in model.results if r["status"] == "finished"}
    model.total_laps = int(meta.get("total_laps", int(raw["LapNumber"].max())))
    model.race_facts = _erf.extract(raw)
    model.pit_lane_sec = derive_pit_lane_sec(raw)

    outline_path = ROOT / "pipeline" / "scripts" / f"outline-{slug}.json"
    if outline_path.exists():
        o = json.loads(outline_path.read_text(encoding="utf-8"))
        model.circuit_length_km = o.get("lengthKm")
        model.track_outline = {"viewBox": o["viewBox"], "path": o["path"], "startFinish": o["startFinish"], "source": o.get("source")}

    # Backtest — record, DON'T hard-fail. Badge 'limited' if it misses the gate.
    report = backtest(model, laps, classified_drivers=classified)
    passes = (report.max_top5_error <= MAX_TOP5_POS_ERROR and report.max_all_error <= MAX_ALL_POS_ERROR
              and report.max_top3_time_error <= MAX_TOP3_TIME_ERROR_SEC)
    model.data_quality = "ok" if passes else "limited"
    model.fit_meta["backtest"] = {
        "top5MaxErr": report.max_top5_error, "allMaxErr": report.max_all_error,
        "top3TimeMaxErr": round(report.max_top3_time_error, 2), "passes": passes,
    }
    logger.info("Backtest: top5=%d all=%d time=%.2fs → %s",
                report.max_top5_error, report.max_all_error, report.max_top3_time_error,
                "OK" if passes else "LIMITED (shipped with 数据不足 badge)")

    # Stable modelVersion from the fitted content.
    conf = json.dumps([model.track_base_pace, {f"{t}|{c}": e.deg_linear for (t, c), e in tyre_deg.items()},
                       {d: e.offset_sec for d, e in model.driver_offsets.items()}], sort_keys=True, default=str)
    model.model_version = f"{slug}-{year}-{SCHEMA_VERSION}-{hashlib.sha1(conf.encode()).hexdigest()[:8]}"

    out_path = ROOT / "models" / "tracks" / str(year) / f"{slug}.json"
    export_track(model, out_path)
    public = ROOT / "web" / "public" / "models" / "tracks" / str(year) / f"{slug}.json"
    public.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(out_path, public)
    logger.info("=== Done: %s (v %s, %s) → synced to web/public ===", out_path.name, model.model_version, model.data_quality)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <slug> <year>", file=sys.stderr)
        sys.exit(1)
    build(sys.argv[1], int(sys.argv[2]))
