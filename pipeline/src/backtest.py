"""Backtest: validate fitted model against actual Bahrain 2025 race results."""

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np
import pandas as pd

from .fit import (
    DirtyAirModel,
    DrsBoostModel,
    DriverOffsetEntry,
    StintProgressModel,
    TyreDegEntry,
)

logger = logging.getLogger(__name__)


@dataclass
class TrackModel:
    """Aggregated fit parameters for one race weekend."""
    season: int
    event: str
    track_base_pace: float          # median clean lap time (s) — diagnostic only
    stint_progress: StintProgressModel
    tyre_deg: dict                  # (team, compound) -> TyreDegEntry
    dirty_air: DirtyAirModel
    drs_boost: DrsBoostModel
    driver_offsets: dict            # driver_id -> DriverOffsetEntry
    fit_meta: dict = field(default_factory=dict)


@dataclass
class BacktestReport:
    comparison: pd.DataFrame        # driver, actual_pos, predicted_pos, delta_pos, …
    top5_pos_errors: list           # abs position errors for actual top-5
    all_pos_errors: list            # abs position errors for all classified finishers
    top3_time_errors_sec: list      # abs total-time errors for actual top-3
    passes: bool

    @property
    def max_top5_error(self) -> int:
        return int(max(self.top5_pos_errors)) if self.top5_pos_errors else 0

    @property
    def max_all_error(self) -> int:
        return int(max(self.all_pos_errors)) if self.all_pos_errors else 0

    @property
    def max_top3_time_error(self) -> float:
        return float(max(self.top3_time_errors_sec)) if self.top3_time_errors_sec else 0.0


def _tyre_contribution(stint_lap: int, entry: TyreDegEntry) -> float:
    """Evaluate per-(team,compound) tyre model at a given stint lap."""
    pred = entry.intercept + entry.deg_linear * stint_lap
    if stint_lap > entry.cliff_start:
        pred += entry.cliff_slope * (stint_lap - entry.cliff_start)
    return pred


def _predict_lap_time(
    lap_number: float,
    stint_lap: int,
    team: str,
    compound: str,
    driver_id: str,
    model: "TrackModel",
) -> float:
    """Compute model-predicted lap time for a single clean lap.

    Formula:
        lapTime = sp.slope * lapNum + tyre.intercept + tyre.deg * stintLap + driver.offset

    Note: sp.intercept is NOT added separately — it is embedded inside each
    tyre.intercept (the tyre regression was run on detrended times, so its
    intercept absorbs the global baseline).
    """
    sp_contrib = model.stint_progress.slope * lap_number

    tyre_key = (team, compound)
    entry: Optional[TyreDegEntry] = model.tyre_deg.get(tyre_key)
    if entry is None:
        logger.warning("No tyre deg entry for %s; skipping tyre contribution", tyre_key)
        return np.nan
    tyre_contrib = _tyre_contribution(stint_lap, entry)

    driver_entry: Optional[DriverOffsetEntry] = model.driver_offsets.get(driver_id)
    driver_contrib = driver_entry.offset_sec if driver_entry else 0.0

    return sp_contrib + tyre_contrib + driver_contrib


def backtest(
    model: "TrackModel",
    laps: pd.DataFrame,
    classified_drivers: Optional[set] = None,
) -> "BacktestReport":
    """Simulate race using model parameters; compare to actual results.

    For clean laps: replace recorded lap time with model prediction.
    For pit-in/out, SC/VSC, and out-laps: keep actual recorded time.

    Args:
        model: Fitted TrackModel.
        laps: Cleaned lap DataFrame (output of clean_laps).
        classified_drivers: Set of driver abbreviations that are classified
            finishers (excludes DNF/DSQ).  If None, drivers completing ≥95%
            of the race winner's laps are considered classified.
    """
    df = laps.copy()

    def predict_row(row):
        if not row["IsClean"]:
            return row["LapTimeSec"]
        val = _predict_lap_time(
            lap_number=row["LapsSinceStart"],
            stint_lap=int(row["StintLap"]),
            team=row["Team"],
            compound=row["Compound"],
            driver_id=row["Driver"],
            model=model,
        )
        return val if not np.isnan(val) else row["LapTimeSec"]

    df["PredLapTime"] = df.apply(predict_row, axis=1)

    pred_totals = df.groupby("Driver")["PredLapTime"].sum().rename("PredTotalTime")
    actual_totals = df.groupby("Driver")["LapTimeSec"].sum().rename("ActualTotalTime")
    lap_counts = df.groupby("Driver")["LapNumber"].count().rename("NLaps")

    # Determine classified finishers
    if classified_drivers is None:
        max_laps = lap_counts.max()
        classified_drivers = set(lap_counts[lap_counts >= max_laps * 0.95].index)

    # Actual finishing positions: last recorded Position per driver
    actual_pos = (
        df.sort_values("LapNumber")
        .groupby("Driver")["Position"]
        .last()
        .rename("ActualPos")
        .astype(int)
    )

    # Build comparison table for classified finishers only
    cmp = pd.concat([actual_pos, pred_totals, actual_totals, lap_counts], axis=1)
    cmp = cmp[cmp.index.isin(classified_drivers)].copy()

    # Predicted rank among classified finishers only
    cmp["PredPos"] = cmp["PredTotalTime"].rank(method="min").astype(int)
    cmp["DeltaPos"] = (cmp["PredPos"] - cmp["ActualPos"]).abs()
    cmp = cmp.sort_values("ActualPos")

    logger.info("\nBacktest comparison (classified finishers):\n%s", cmp.to_string())

    top5 = cmp[cmp["ActualPos"] <= 5]
    top3 = cmp[cmp["ActualPos"] <= 3]
    all_cls = cmp

    top5_errors = top5["DeltaPos"].tolist()
    all_errors = all_cls["DeltaPos"].tolist()
    top3_time_errors = (top3["PredTotalTime"] - top3["ActualTotalTime"]).abs().tolist()

    max_top5 = max(top5_errors) if top5_errors else 0
    max_all = max(all_errors) if all_errors else 0
    max_t3_time = max(top3_time_errors) if top3_time_errors else 0.0

    passes = max_top5 <= 2 and max_all <= 4 and max_t3_time <= 5.0

    logger.info(
        "Backtest: top5_max_err=%d, all_max_err=%d, top3_time_max_err=%.1f s — %s",
        max_top5, max_all, max_t3_time, "PASS" if passes else "FAIL",
    )

    return BacktestReport(
        comparison=cmp,
        top5_pos_errors=top5_errors,
        all_pos_errors=all_errors,
        top3_time_errors_sec=top3_time_errors,
        passes=passes,
    )
