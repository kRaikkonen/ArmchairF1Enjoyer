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
MAX_TOP5_POS_ERROR, MAX_ALL_POS_ERROR, MAX_TOP3_TIME_ERROR_SEC = 2, 6, 5.0  # 'ok' gate (§10)
PODIUM_TOP5_MAX = 3  # 'podium' tier: front/podium trustworthy even if midfield is event-driven


def grade(top5: int, all_err: int, t3_time: float) -> str:
    """Honest quality tier from the backtest (not a binary pass/fail).

    The midfield is event-driven (SC timing, pit luck, first-lap incidents) and
    not predictable from pace, so a flat 'limited/数据不足' badge over-punishes
    races whose podium the model nails. Three honest tiers instead:
      ok     — front AND midfield faithful (rare; e.g. Bahrain).
      podium — podium/front trustworthy, midfield is a dice roll (most races).
      rough  — even the front is shaky; for-fun only (chaotic/upset races).
    """
    if top5 <= MAX_TOP5_POS_ERROR and all_err <= MAX_ALL_POS_ERROR and t3_time <= MAX_TOP3_TIME_ERROR_SEC:
        return "ok"
    return "podium" if top5 <= PODIUM_TOP5_MAX else "rough"


def load_support(slug: str, year: int) -> pd.DataFrame | None:
    """Cleaned practice/quali laps (or None) for filling thin tyre cells.

    Green, accurate, non-pit laps with a compound + stint, tagged by Session and
    given a per-stint StintLap. Used only for the deg slope of under-sampled cells
    (see fit._supplement_thin_cell); never re-anchors race pace."""
    p = FIXTURES / f"{slug}-{year}-support.parquet"
    if not p.exists():
        return None
    df = pd.read_parquet(p)
    df["sec"] = pd.to_timedelta(df["LapTime"]).dt.total_seconds()
    df = df[(df["TrackStatus"].astype(str) == "1")
            & df["PitInTime"].isna() & df["PitOutTime"].isna()
            & df["sec"].notna() & df["Compound"].notna() & df["Stint"].notna()].copy()
    if "IsAccurate" in df.columns:
        df = df[df["IsAccurate"] != False]  # noqa: E712 — keep NaN/True, drop explicit False
    df["Compound"] = df["Compound"].replace({"INTERMEDIATE": "INTER"})
    df["StintLap"] = df.groupby(["Driver", "Session", "Stint"])["LapNumber"].rank(method="first")
    logger.info("Support laps for %s: %d clean laps across %d sessions",
                slug, len(df), df["Session"].nunique() if len(df) else 0)
    return df if len(df) else None


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
    support = load_support(slug, year)  # practice/quali laps to fill thin tyre cells (or None)
    tyre_deg = fit_tyre_deg(laps, support)
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

    # Backtest — record, DON'T hard-fail. Grade into an honest tier (ok/podium/rough).
    report = backtest(model, laps, classified_drivers=classified)
    tier = grade(report.max_top5_error, report.max_all_error, report.max_top3_time_error)
    model.data_quality = tier
    model.fit_meta["backtest"] = {
        "top5MaxErr": report.max_top5_error, "allMaxErr": report.max_all_error,
        "top3TimeMaxErr": round(report.max_top3_time_error, 2),
        "tier": tier, "passes": tier == "ok",
    }
    logger.info("Backtest: top5=%d all=%d time=%.2fs → %s",
                report.max_top5_error, report.max_all_error, report.max_top3_time_error, tier.upper())

    # Stable modelVersion from the fitted content (incl. dirty-air/DRS so the
    # version moves when those fits change).
    conf = json.dumps([model.track_base_pace, {f"{t}|{c}": e.deg_linear for (t, c), e in tyre_deg.items()},
                       {d: e.offset_sec for d, e in model.driver_offsets.items()},
                       round(model.dirty_air.penalty_sec, 4), round(model.drs_boost.boost_sec, 4)],
                      sort_keys=True, default=str)
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
