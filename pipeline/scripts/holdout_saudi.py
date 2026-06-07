#!/usr/bin/env python
"""Cross-track holdout (validation debt #3): does the model generalise?

Fit the model on Bahrain, then use Bahrain's parameters to predict SAUDI 2025
and measure the finishing-order error. Same-race fit-and-test (in-sample) is not
validation; this is the real test of whether the driver/tyre characterisation
transfers to a different track.

Reports two numbers: Bahrain-params-on-Saudi (out-of-sample holdout) vs a
Saudi-fitted model on Saudi (in-sample reference). Offline from the FastF1 cache.

Run: conda run -n f1apt python pipeline/scripts/holdout_saudi.py
"""

import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

import pandas as pd

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))

from src.backtest import backtest
from src.clean import clean_laps
from src.fetch import fetch_race
from controlled_consistency_dump import build_model  # reuse the exact fit chain


def classified(session) -> set:
    return {
        r["Abbreviation"]
        for r in session.results.to_dict("records")
        if str(r.get("ClassifiedPosition", "")).isdigit()
    }


def main() -> None:
    bahrain_laps = clean_laps(pd.read_parquet(ROOT / "pipeline/tests/fixtures/bahrain-2025-laps.parquet"))
    bahrain_model = build_model(bahrain_laps, 2025, "Bahrain")

    print("Loading Saudi 2025 from cache…")
    saudi = fetch_race(2025, "Saudi Arabia")
    saudi_laps = clean_laps(saudi)
    saudi_classified = classified(saudi)
    saudi_model = build_model(saudi_laps, 2025, "Saudi Arabia")

    # In-sample reference: Saudi model on Saudi.
    insample = backtest(saudi_model, saudi_laps, classified_drivers=saudi_classified)
    # Out-of-sample HOLDOUT: Bahrain parameters predicting Saudi.
    holdout = backtest(bahrain_model, saudi_laps, classified_drivers=saudi_classified)

    print("\n=== Cross-track holdout (Saudi 2025) ===")
    print(f"in-sample  (Saudi model → Saudi):   top5 max {insample.max_top5_error}, all max {insample.max_all_error}")
    print(f"HOLDOUT    (Bahrain model → Saudi): top5 max {holdout.max_top5_error}, all max {holdout.max_all_error}")
    print(f"classified finishers compared: {len(saudi_classified)}")


if __name__ == "__main__":
    main()
