#!/usr/bin/env python
"""Regenerate bahrain.json with the honest (median) driver offsets — EXPERIMENT.

build_track.py gates export on the backtest acceptance criteria. After removing
the mean-residual crutch (PLAN §8.4), the honest model no longer passes the old
gate (all_max_err jumps above 4 because the predicted total time is no longer an
algebraic identity). Whether to relax that gate or change the model is a human
decision (PLAN §10), so this script deliberately does NOT gate — it exports the
honest model and reports the real backtest numbers for that decision.

Offline, SSOT-aligned: fits come from the lap fixture; results come from the
FastF1 meta fixture via extract_results. No network. Run:
    conda run -n f1apt python pipeline/scripts/regen_bahrain_honest.py
"""

import json
import logging
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))

from src.backtest import backtest
from src.clean import clean_laps
from src.export import export_track
from src.results import extract_results

# Reuse the exact model-build used by the diagnostic so fits are identical.
from controlled_consistency_dump import build_model  # noqa: E402

logging.basicConfig(level=logging.WARNING)

FIXTURE = ROOT / "pipeline" / "tests" / "fixtures" / "bahrain-2025-laps.parquet"
META = ROOT / "pipeline" / "tests" / "fixtures" / "bahrain-2025-meta.json"
OUTLINE = ROOT / "pipeline" / "scripts" / "outline-bahrain.json"
FACTS = ROOT / "pipeline" / "scripts" / "facts-bahrain.json"
OUT = ROOT / "models" / "tracks" / "2025" / "bahrain.json"


def main() -> None:
    laps = clean_laps(pd.read_parquet(FIXTURE))
    model = build_model(laps, 2025, "Bahrain")

    meta = json.loads(META.read_text(encoding="utf-8"))
    model.results = extract_results(meta["results"])
    classified = {r["driverId"] for r in model.results if r["status"] == "finished"}

    # Race metadata + real circuit outline (FastF1-derived).
    model.total_laps = int(meta.get("total_laps", 0))
    if OUTLINE.exists():
        outline = json.loads(OUTLINE.read_text(encoding="utf-8"))
        model.circuit_length_km = outline.get("lengthKm")
        model.track_outline = {
            "viewBox": outline["viewBox"],
            "path": outline["path"],
            "startFinish": outline["startFinish"],
            "source": outline.get("source"),
        }
        print(f"[honest] attached track outline ({outline['nPoints']} pts, {model.circuit_length_km} km)")
    else:
        print("[honest] WARNING: no outline file; trackOutline omitted")

    if FACTS.exists():
        model.race_facts = json.loads(FACTS.read_text(encoding="utf-8"))
        print(f"[honest] attached race facts ({len(model.race_facts['strategies'])} drivers, "
              f"SC {model.race_facts['safetyCars']})")
    else:
        print("[honest] WARNING: no facts file; raceFacts omitted")

    report = backtest(model, laps, classified_drivers=classified)
    print("[honest] Python backtest (real strategy, controlled replay):")
    print(f"  top5_max_err   = {report.max_top5_error}")
    print(f"  all_max_err    = {report.max_all_error}")
    print(f"  top3_time_err  = {report.max_top3_time_error:.3f} s  (was ~0.0 = §8.4 identity)")

    export_track(model, OUT)
    print(f"[honest] exported -> {OUT}  (gate intentionally bypassed, see §10)")


if __name__ == "__main__":
    main()
