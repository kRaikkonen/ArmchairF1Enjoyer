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
    DIRTY_AIR_GAP_SEC,
)

logger = logging.getLogger(__name__)

# Position-model constants (mirror the engine: a follower within DIRTY_AIR_GAP_SEC
# of the car ahead eats the fitted dirty-air penalty, and order is by cumulative
# time, so a car can only clear the one ahead if its pace edge beats the penalty).
POS_START_GAP_SEC = 0.3  # grid-order seed: Pn starts (n-1)·this behind P1


@dataclass
class TrackModel:
    """Aggregated fit parameters for one race weekend."""
    season: int
    event: str                      # FastF1 event name, e.g. "Bahrain Grand Prix"
    track_base_pace: float          # median clean lap time (s) — diagnostic only
    stint_progress: StintProgressModel
    tyre_deg: dict                  # (team, compound) -> TyreDegEntry
    dirty_air: DirtyAirModel
    drs_boost: DrsBoostModel
    driver_offsets: dict            # driver_id -> DriverOffsetEntry
    fit_meta: dict = field(default_factory=dict)
    # Official race results, derived from FastF1 (single source of truth,
    # PLAN §8.1). Each entry is a canonical RaceResultEntry dict from results.py.
    results: list = field(default_factory=list)
    # Race metadata + real circuit outline (FastF1-derived). total_laps from the
    # session; track_outline from telemetry (extract_track_outline.py).
    total_laps: int = 0
    circuit_length_km: float | None = None
    track_outline: dict | None = None
    # Real race facts (FastF1-derived): per-driver start compound + pit strategy
    # and safety-car periods. Lets the UI open on the real race. extract_race_facts.py.
    race_facts: dict | None = None
    # Per-track pit-lane delta (s, in+out, excludes the stationary tyre change),
    # derived from data; the engine reads this instead of a global constant.
    pit_lane_sec: float | None = None
    # Stable version (slug-year-schema-confhash) for the share URL (PLAN §8.5).
    model_version: str = ""
    # 'ok' | 'limited' — whether the backtest met the acceptance gate; drives a
    # "数据不足/仅供参考" badge for tracks the model fits poorly (PLAN §10).
    data_quality: str = "ok"
    # URL/file slug (e.g. "saudi-arabian"). The JSON filename and share-URL
    # `track` param key off this, NOT the FastF1 event name.
    slug: str = ""


@dataclass
class BacktestReport:
    comparison: pd.DataFrame        # driver, actual_pos, predicted_pos, delta_pos, …
    top5_pos_errors: list           # abs position errors for actual top-5
    all_pos_errors: list            # abs position errors for all classified finishers
    top3_time_errors_sec: list      # abs total-time errors for actual top-3
    passes: bool
    # Grid-order null baseline ("predict finish = start order") on the same field.
    grid_max_top5: int = 0
    grid_max_all: int = 0

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


def _position_aware_totals(df: pd.DataFrame, model: "TrackModel") -> pd.Series:
    """Predicted race total time per driver via a lap-by-lap position sim.

    Mirrors the engine: each lap, cars are ordered by cumulative time; a car
    running within DIRTY_AIR_GAP_SEC of the one ahead eats the fitted dirty-air
    penalty (so on hard-to-pass tracks a faster-but-stuck car can't simply
    tele-pass on raw pace). Seeded in grid order. Uses each row's `PredLapTime`
    (model pace for clean laps, real time for pit/SC/out laps).

    This replaces the old "sum independent free pace" ranking, which ignored the
    held-up-behind-a-slower-car dynamic and so mispredicted the order on circuits
    where track position, not pace, decides finishing places.
    """
    da = max(0.0, model.dirty_air.penalty_sec)
    pace = df.pivot_table(index="LapNumber", columns="Driver", values="PredLapTime", aggfunc="first")
    drivers = list(pace.columns)
    start_pos = df.sort_values("LapNumber").groupby("Driver")["Position"].first()
    cum = {d: ((float(start_pos.get(d)) - 1) * POS_START_GAP_SEC if pd.notna(start_pos.get(d)) else 0.0)
           for d in drivers}
    for lap in sorted(pace.index):
        order = sorted([d for d in drivers if pd.notna(pace.at[lap, d])], key=lambda d: cum[d])
        nxt = dict(cum)
        for i, d in enumerate(order):
            t = pace.at[lap, d]
            if i > 0 and (cum[d] - cum[order[i - 1]]) < DIRTY_AIR_GAP_SEC:
                t += da  # held up in dirty air
            nxt[d] = cum[d] + t
        cum = nxt
    return pd.Series(cum, name="PredTotalTime")


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

    # Predicted finishing order from the position-aware sim (not a sum of free pace).
    pred_totals = _position_aware_totals(df, model)
    actual_totals = df.groupby("Driver")["LapTimeSec"].sum().rename("ActualTotalTime")
    lap_counts = df.groupby("Driver")["LapNumber"].count().rename("NLaps")

    # Determine classified finishers
    if classified_drivers is None:
        max_laps = lap_counts.max()
        classified_drivers = set(lap_counts[lap_counts >= max_laps * 0.95].index)

    # Actual finishing positions: last recorded Position per driver. dropna()
    # first — a DNF driver can have a NaN final Position which would crash the
    # int cast (only classified finishers survive into the comparison anyway).
    actual_pos = (
        df.sort_values("LapNumber")
        .groupby("Driver")["Position"]
        .last()
        .dropna()
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

    # Grid-order NULL baseline: "predict finish = starting order" (first-lap
    # Position). The honest sanity check — if just copying the grid beats the model
    # on a metric, the model adds no signal there, so a tier must not claim trust on
    # it (see build_track.grade). Front rows being sticky is not model skill.
    first_pos = df.sort_values("LapNumber").groupby("Driver")["Position"].first().dropna()
    grid = cmp.join(first_pos.rename("GridPos")).dropna(subset=["GridPos"])
    grid["GridRank"] = grid["GridPos"].rank(method="min").astype(int)
    grid["GridDelta"] = (grid["GridRank"] - grid["ActualPos"]).abs()
    grid_top5 = grid[grid["ActualPos"] <= 5]["GridDelta"]
    grid_max_top5 = int(grid_top5.max()) if len(grid_top5) else 0
    grid_max_all = int(grid["GridDelta"].max()) if len(grid) else 0

    passes = max_top5 <= 2 and max_all <= 4 and max_t3_time <= 5.0

    logger.info(
        "Backtest: top5_max_err=%d, all_max_err=%d, top3_time_max_err=%.1f s | "
        "GRID baseline top5=%d all=%d — %s",
        max_top5, max_all, max_t3_time, grid_max_top5, grid_max_all,
        "PASS" if passes else "FAIL",
    )

    return BacktestReport(
        comparison=cmp,
        top5_pos_errors=top5_errors,
        all_pos_errors=all_errors,
        top3_time_errors_sec=top3_time_errors,
        passes=passes,
        grid_max_top5=grid_max_top5,
        grid_max_all=grid_max_all,
    )
