#!/usr/bin/env python
"""Extract the real race facts (strategy + safety cars) from the lap fixture.

So the MFD can open on the REAL race and let the player modify the parallel
world from there: per-driver start compound + pit laps/compounds, and the real
Safety Car periods. All FastF1-derived (single source of truth, PLAN §8.1),
offline from the committed lap fixture.

Run: conda run -n f1apt python pipeline/scripts/extract_race_facts.py bahrain
"""

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).parent.parent.parent
FIXTURE = ROOT / "pipeline" / "tests" / "fixtures" / "bahrain-2025-laps.parquet"


def extract(df: pd.DataFrame) -> dict:
    start_compounds: dict[str, str] = {}
    strategies: dict[str, list] = {}

    for drv, d in df.groupby("Driver"):
        d = d.sort_values("LapNumber")
        stints = (
            d.dropna(subset=["Stint", "Compound"])
            .groupby("Stint")
            .agg(startLap=("LapNumber", "min"), compound=("Compound", "first"))
            .reset_index()
            .sort_values("Stint")
        )
        if stints.empty:
            continue
        start_compounds[drv] = str(stints.iloc[0]["compound"])
        # Pits = the start of every stint after the first.
        pits = [
            {"lap": int(r["startLap"]), "compound": str(r["compound"])}
            for _, r in stints.iloc[1:].iterrows()
        ]
        strategies[drv] = pits

    # Safety-car periods: consecutive laps whose TrackStatus contains '4'.
    sc_laps = sorted(
        df.loc[df["TrackStatus"].astype(str).str.contains("4"), "LapNumber"]
        .dropna().astype(int).unique().tolist()
    )
    safety_cars = []
    if sc_laps:
        start = prev = sc_laps[0]
        for lap in sc_laps[1:] + [None]:
            if lap is None or lap != prev + 1:
                safety_cars.append({"lap": int(start), "duration": int(prev - start + 1)})
                if lap is not None:
                    start = lap
            if lap is not None:
                prev = lap

    return {
        "startCompounds": start_compounds,
        "strategies": strategies,
        "safetyCars": safety_cars,
    }


def main(slug: str) -> None:
    df = pd.read_parquet(FIXTURE)
    facts = extract(df)
    dest = ROOT / "pipeline" / "scripts" / f"facts-{slug}.json"
    dest.write_text(json.dumps(facts), encoding="utf-8")
    print(f"startCompounds: {len(facts['startCompounds'])} drivers")
    print(f"safetyCars: {facts['safetyCars']}")
    print(f"sample VER strategy: {facts['strategies'].get('VER')}")
    print(f"wrote {dest}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "bahrain")
