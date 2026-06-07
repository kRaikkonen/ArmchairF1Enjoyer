#!/usr/bin/env python
"""Extract the real race facts (strategy + neutralisations) from a lap fixture.

Per-driver start compound + pit laps/compounds, and the real Safety Car / VSC /
red-flag periods — so the MFD opens on the real race. All FastF1-derived (single
source of truth, PLAN §8.1), offline from the committed lap fixture.

FastF1 TrackStatus is a per-lap string of single-char codes:
  1=green 2=yellow 4=SC 5=red 6=VSC-deployed 7=VSC-ending
We parse it per-character (a substring match on '4' would wrongly fire on '14').

Run: conda run -n f1apt python pipeline/scripts/extract_race_facts.py <slug> <year>
"""

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).parent.parent.parent
FIXTURES = ROOT / "pipeline" / "tests" / "fixtures"


def _periods(df: pd.DataFrame, codes: set[str]) -> list[dict]:
    """Consecutive lap ranges whose TrackStatus contains any of `codes`."""
    mask = df["TrackStatus"].astype(str).apply(lambda s: any(c in set(s) for c in codes))
    laps = sorted(df.loc[mask, "LapNumber"].dropna().astype(int).unique().tolist())
    out: list[dict] = []
    if not laps:
        return out
    start = prev = laps[0]
    for lap in laps[1:] + [None]:
        if lap is None or lap != prev + 1:
            out.append({"lap": int(start), "duration": int(prev - start + 1)})
            if lap is not None:
                start = lap
        if lap is not None:
            prev = lap
    return out


def extract(df: pd.DataFrame) -> dict:
    start_compounds: dict[str, str] = {}
    strategies: dict[str, list] = {}
    for drv, d in df.groupby("Driver"):
        d = d.sort_values("LapNumber")
        stints = (
            d.dropna(subset=["Stint", "Compound"]).groupby("Stint")
            .agg(startLap=("LapNumber", "min"), compound=("Compound", "first"))
            .reset_index().sort_values("Stint")
        )
        if stints.empty:
            continue
        start_compounds[drv] = str(stints.iloc[0]["compound"])
        strategies[drv] = [
            {"lap": int(r["startLap"]), "compound": str(r["compound"])}
            for _, r in stints.iloc[1:].iterrows()
        ]
    return {
        "startCompounds": start_compounds,
        "strategies": strategies,
        "safetyCars": _periods(df, {"4"}),
        "virtualSafetyCars": _periods(df, {"6", "7"}),
        "redFlags": _periods(df, {"5"}),
    }


def main(slug: str, year: int) -> None:
    df = pd.read_parquet(FIXTURES / f"{slug}-{year}-laps.parquet")
    facts = extract(df)
    dest = ROOT / "pipeline" / "scripts" / f"facts-{slug}.json"
    dest.write_text(json.dumps(facts), encoding="utf-8")
    print(f"[facts] {slug}: {len(facts['startCompounds'])} drivers · "
          f"SC {facts['safetyCars']} · VSC {facts['virtualSafetyCars']} · red {facts['redFlags']}")


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 2025)
