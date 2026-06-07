#!/usr/bin/env python
"""ONLINE (human-sanctioned) — pull a weekend's SUPPORT-session laps (practice +
qualifying) to supplement thin race tyre-deg cells. Laps only, no telemetry, so
it's far lighter than the race fetch.

Writes tests/fixtures/<slug>-<year>-support.parquet: clean-ish lap rows tagged
with a `Session` column (FP1/FP2/FP3/Q/SQ), columns aligned with the race laps
(LapTime, Driver, Compound, Stint, TyreLife, Team, ...).

Run: conda run -n f1apt python pipeline/scripts/fetch_support.py <slug> <year>
"""
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
import fastf1
import pandas as pd

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
fastf1.Cache.enable_cache(str(ROOT / "pipeline" / "cache"))
from src.schedule import resolve_event  # noqa: E402

FIXTURES = ROOT / "pipeline" / "tests" / "fixtures"
# Candidate non-race sessions; not all exist on every weekend (sprint weekends
# have FP1 + SQ + S instead of FP2/FP3). We try each and skip failures.
CANDIDATES = ["FP1", "FP2", "FP3", "Q", "SQ"]
KEEP = ["Time", "Driver", "DriverNumber", "LapTime", "LapNumber", "Stint",
        "PitOutTime", "PitInTime", "Compound", "TyreLife", "FreshTyre", "Team",
        "TrackStatus", "Position", "IsAccurate", "Deleted"]


def main(slug: str, year: int) -> None:
    event = resolve_event(slug, year)
    frames = []
    for code in CANDIDATES:
        try:
            s = fastf1.get_session(year, event, code)
            s.load(laps=True, telemetry=False, weather=False, messages=False)
            laps = s.laps
            if laps is None or not len(laps):
                continue
            df = laps[[c for c in KEEP if c in laps.columns]].copy()
            df["Session"] = code
            frames.append(df)
            print(f"[support] {slug} {code}: {len(df)} laps")
        except Exception as e:  # session absent / load failure → skip
            print(f"[support] {slug} {code}: skipped ({type(e).__name__})")
    if not frames:
        print(f"[support] {slug}: no support sessions found")
        return
    out = pd.concat(frames, ignore_index=True)
    path = FIXTURES / f"{slug}-{year}-support.parquet"
    out.to_parquet(path)
    print(f"[support] wrote {path.name}: {len(out)} laps across {out['Session'].nunique()} sessions")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <slug> <year>", file=sys.stderr)
        sys.exit(1)
    main(sys.argv[1], int(sys.argv[2]))
