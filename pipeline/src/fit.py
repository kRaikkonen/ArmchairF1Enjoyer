"""Fitting functions: extract physics parameters from cleaned lap data."""

import logging
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd
from scipy import stats
from scipy.optimize import minimize_scalar

logger = logging.getLogger(__name__)

# Minimum samples required before marking a fit as insufficient.
# Not a physics constant — a statistical quality threshold.
MIN_SAMPLES_TYRE = 20
MIN_SAMPLES_DRIVER = 5

# Gap thresholds from physics model (fixed by design, not fitted).
# These are model architecture choices, not empirical parameters.
DIRTY_AIR_GAP_SEC = 1.5
DRS_GAP_SEC = 1.0


# ---------------------------------------------------------------------------
# Return types
# ---------------------------------------------------------------------------

@dataclass
class StintProgressModel:
    slope: float        # s/lap; typically negative (car gets faster as fuel burns)
    intercept: float    # baseline lap time at lap 0
    r_squared: float
    n_samples: int


@dataclass
class TyreDegEntry:
    team: str
    compound: str
    intercept: float    # detrended lap time at stintLap=0; captures absolute team pace
    deg_linear: float   # extra s/lap per stint lap
    cliff_start: int    # stint lap where cliff begins; 999 = no cliff detected
    cliff_slope: float  # additional slope after cliff_start
    n_samples: int
    insufficient: bool  # True if n < MIN_SAMPLES_TYRE


@dataclass
class DirtyAirModel:
    penalty_sec: float          # positive: lap-time penalty in dirty air
    # gap_threshold is a design constant (DIRTY_AIR_GAP_SEC), not a fitted value
    n_samples_dirty: int
    n_samples_clean: int
    insufficient: bool


@dataclass
class DrsBoostModel:
    boost_sec: float            # negative: lap-time gain when DRS active
    # gap_threshold is a design constant (DRS_GAP_SEC), not a fitted value
    n_samples_drs: int
    n_samples_no_drs: int
    insufficient: bool


@dataclass
class DriverOffsetEntry:
    driver_id: str
    team: str
    offset_sec: float   # negative = faster than team median
    n_samples: int


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _compute_gap_ahead(laps: pd.DataFrame) -> pd.Series:
    """Return estimated gap-to-car-ahead (seconds) for each lap row.

    Approximation: cumulative lap-time difference between current driver and
    the driver one position ahead at that lap number.  Includes pit-stop time
    by construction (pit laps have longer LapTimeSec).

    Returns NaN for lap 1, position 1, or laps where the leading driver's
    cumulative time is unavailable.  Uses vectorised pivot operations.
    """
    df = laps.reset_index(drop=True).copy()
    df = df.sort_values(["Driver", "LapNumber"])
    df["CumTime"] = df.groupby("Driver")["LapTimeSec"].cumsum()

    # Wide: rows = LapNumber, columns = Driver
    cum_wide = df.pivot_table(
        index="LapNumber", columns="Driver", values="CumTime", aggfunc="first"
    )
    pos_wide = df.pivot_table(
        index="LapNumber", columns="Driver", values="Position", aggfunc="first"
    )

    # For each (LapNumber, Driver) find the driver at position = pos - 1
    # and return cum_time_self - cum_time_leader
    gap_series = pd.Series(np.nan, index=df.index)

    for driver in df["Driver"].unique():
        drv_rows = df[df["Driver"] == driver][["LapNumber", "Position", "CumTime"]]
        for _, row in drv_rows.iterrows():
            lap = row["LapNumber"]
            pos = row["Position"]
            if pd.isna(pos) or pos <= 1:
                continue
            if lap not in pos_wide.index:
                continue
            pos_row = pos_wide.loc[lap]
            leaders = pos_row[pos_row == pos - 1].index.tolist()
            if not leaders:
                continue
            leader = leaders[0]
            if leader not in cum_wide.columns or lap not in cum_wide.index:
                continue
            cum_leader = cum_wide.at[lap, leader]
            cum_self = row["CumTime"]
            if pd.isna(cum_leader):
                continue
            loc = df.index[(df["Driver"] == driver) & (df["LapNumber"] == lap)]
            if len(loc):
                gap_series.iloc[gap_series.index.get_loc(loc[0])] = cum_self - cum_leader

    return gap_series


def _detrend_stint_progress(laps: pd.DataFrame, model: StintProgressModel) -> pd.Series:
    """Remove global stint-progress trend from LapTimeSec."""
    return laps["LapTimeSec"] - model.slope * laps["LapsSinceStart"]


def _fit_piecewise_tyre(stintlap: np.ndarray, laptime: np.ndarray):
    """Fit linear + cliff piecewise model.

    Returns (intercept, deg_linear, cliff_start, cliff_slope).
    cliff_start=999 means no significant cliff was detected.
    intercept captures absolute team/compound pace at stintLap=0.
    """
    slope_base, intercept_base, *_ = stats.linregress(stintlap, laptime)

    if len(stintlap) < MIN_SAMPLES_TYRE:
        return float(intercept_base), float(slope_base), 999, 0.0

    resid_base = laptime - (slope_base * stintlap + intercept_base)
    rmse_base = np.sqrt(np.mean(resid_base ** 2))

    best_rmse = rmse_base
    best_cliff = 999
    best_intercept = float(intercept_base)
    best_slopes = (float(slope_base), 0.0)

    max_lap = int(stintlap.max())
    for cliff in range(8, max_lap - 2):
        mask_pre = stintlap <= cliff
        mask_post = stintlap > cliff
        if mask_pre.sum() < 5 or mask_post.sum() < 5:
            continue

        s1, i1, *_ = stats.linregress(stintlap[mask_pre], laptime[mask_pre])
        pred_post_baseline = s1 * stintlap[mask_post] + i1
        extra_post = laptime[mask_post] - pred_post_baseline
        if len(extra_post) < 3:
            continue
        s2, *_ = stats.linregress(stintlap[mask_post] - cliff, extra_post)

        pred = np.where(
            stintlap <= cliff,
            s1 * stintlap + i1,
            s1 * stintlap + i1 + s2 * (stintlap - cliff),
        )
        rmse_cand = np.sqrt(np.mean((laptime - pred) ** 2))

        if rmse_cand < best_rmse * 0.85:  # >15% RMSE improvement required
            best_rmse = rmse_cand
            best_cliff = cliff
            best_intercept = float(i1)
            best_slopes = (float(s1), float(s2))

    if best_cliff != 999:
        logger.info("  Cliff detected at stint lap %d", best_cliff)
        return best_intercept, best_slopes[0], best_cliff, best_slopes[1]

    return float(intercept_base), float(slope_base), 999, 0.0


# ---------------------------------------------------------------------------
# Public fit functions
# ---------------------------------------------------------------------------

def fit_stint_progress(laps: pd.DataFrame) -> StintProgressModel:
    """Fit global stint-progress coefficient from clean laps.

    Regresses LapsSinceStart → LapTimeSec across all drivers/compounds.
    Slope absorbs fuel burn, tyre warm-up, and rubber laid down — they
    cannot be separated without fuel-load telemetry.
    """
    clean = laps[laps["IsClean"]].copy()
    x = clean["LapsSinceStart"].values
    y = clean["LapTimeSec"].values

    slope, intercept, r, p, se = stats.linregress(x, y)

    model = StintProgressModel(
        slope=float(slope),
        intercept=float(intercept),
        r_squared=float(r ** 2),
        n_samples=len(clean),
    )
    logger.info(
        "StintProgress: slope=%.4f s/lap, R²=%.3f, n=%d",
        model.slope, model.r_squared, model.n_samples,
    )
    return model


def fit_tyre_deg(laps: pd.DataFrame) -> dict:
    """Fit per-(team, compound) tyre degradation from clean stints.

    Returns dict keyed by (team, compound) → TyreDegEntry.
    Groups with fewer than MIN_SAMPLES_TYRE laps are marked insufficient=True
    and logged; they are still included in the dict but must not drive
    simulation without a fallback decision from the human.
    """
    # First, remove global stint-progress trend so tyre deg is isolated
    sp_model = fit_stint_progress(laps)
    clean = laps[laps["IsClean"]].copy()
    clean["DetrLapTime"] = _detrend_stint_progress(clean, sp_model)

    result: dict = {}
    insufficient_log: list = []

    for (team, compound), grp in clean.groupby(["Team", "Compound"]):
        x = grp["StintLap"].values.astype(float)
        y = grp["DetrLapTime"].values.astype(float)
        n = len(grp)
        insufficient = n < MIN_SAMPLES_TYRE

        if insufficient:
            insufficient_log.append((team, compound, n))

        tyre_intercept, deg_linear, cliff_start, cliff_slope = _fit_piecewise_tyre(x, y)

        entry = TyreDegEntry(
            team=team,
            compound=compound,
            intercept=tyre_intercept,
            deg_linear=deg_linear,
            cliff_start=cliff_start,
            cliff_slope=cliff_slope,
            n_samples=n,
            insufficient=insufficient,
        )
        result[(team, compound)] = entry

        logger.info(
            "TyreDeg [%s/%s]: intercept=%.3f, deg_linear=%.4f s/lap, cliff_start=%d, n=%d%s",
            team, compound, tyre_intercept, deg_linear, cliff_start, n,
            " [INSUFFICIENT]" if insufficient else "",
        )

    if insufficient_log:
        logger.warning(
            "Insufficient tyre samples (<%d laps) for: %s",
            MIN_SAMPLES_TYRE,
            ", ".join(f"{t}/{c}({n})" for t, c, n in insufficient_log),
        )

    return result


def fit_dirty_air(laps: pd.DataFrame) -> DirtyAirModel:
    """Estimate lap-time penalty from running in dirty air (gap < 1.5s).

    Strategy: compute gap-ahead for each clean lap, split into dirty/clean
    groups, compare detrended lap times (stint-progress removed).
    Reports insufficient if either group has fewer than 20 samples.
    """
    sp_model = fit_stint_progress(laps)
    clean = laps[laps["IsClean"]].copy()
    clean["DetrLapTime"] = _detrend_stint_progress(clean, sp_model)

    logger.info("Computing gap-to-car-ahead for dirty-air fit...")
    clean["GapAhead"] = _compute_gap_ahead(clean)

    valid = clean.dropna(subset=["GapAhead"])
    dirty = valid[valid["GapAhead"] < DIRTY_AIR_GAP_SEC]
    clear = valid[valid["GapAhead"] >= DIRTY_AIR_GAP_SEC]

    n_dirty = len(dirty)
    n_clean = len(clear)
    insufficient = n_dirty < 20 or n_clean < 20

    if insufficient:
        logger.warning(
            "DirtyAir: insufficient samples — dirty=%d, clear=%d (need ≥20 each)",
            n_dirty, n_clean,
        )

    if n_dirty == 0 or n_clean == 0:
        logger.error("DirtyAir: cannot fit — one group is empty")
        raise ValueError("DirtyAir fit requires laps with and without dirty air")

    penalty = float(dirty["DetrLapTime"].median() - clear["DetrLapTime"].median())
    # Penalty must be non-negative (dirty air slows you down)
    penalty = max(0.0, penalty)

    model = DirtyAirModel(
        penalty_sec=penalty,
        n_samples_dirty=n_dirty,
        n_samples_clean=n_clean,
        insufficient=insufficient,
    )
    logger.info(
        "DirtyAir: penalty=%.3f s, n_dirty=%d, n_clean=%d%s",
        penalty, n_dirty, n_clean, " [INSUFFICIENT]" if insufficient else "",
    )
    return model


def fit_drs_boost(laps: pd.DataFrame) -> DrsBoostModel:
    """Estimate DRS lap-time gain from sector-time comparison.

    Uses Sector3Time as the primary DRS indicator (Bahrain S3 = main DRS
    straight). Compares S3 times when gap < 1.0s (DRS likely open) vs
    1.0s < gap < 3.0s (close but no DRS) on the same compound/stint context.
    Reports insufficient if either group has fewer than 10 samples.
    """
    sp_model = fit_stint_progress(laps)
    clean = laps[laps["IsClean"]].copy()
    clean["DetrLapTime"] = _detrend_stint_progress(clean, sp_model)

    clean["GapAhead"] = _compute_gap_ahead(clean)
    valid = clean.dropna(subset=["GapAhead"])

    # DRS active: gap < 1.0s; comparison: 1.0–3.0s (close but no DRS)
    drs_group = valid[valid["GapAhead"] < DRS_GAP_SEC]
    no_drs_group = valid[(valid["GapAhead"] >= DRS_GAP_SEC) & (valid["GapAhead"] < 3.0)]

    n_drs = len(drs_group)
    n_no_drs = len(no_drs_group)
    insufficient = n_drs < 10 or n_no_drs < 10

    if insufficient:
        logger.warning(
            "DrsBoost: low samples — drs=%d, no_drs=%d (need ≥10 each)",
            n_drs, n_no_drs,
        )

    if n_drs == 0 or n_no_drs == 0:
        logger.error("DrsBoost: cannot fit — one group is empty")
        raise ValueError("DrsBoost fit requires laps with and without DRS")

    # DRS boost = detrended lap time (DRS) - detrended lap time (no DRS)
    # Negative = DRS makes you faster
    # We also include dirty-air penalty in the DRS laps, so this is a net
    # effect; for armchair precision this conflation is acceptable.
    boost = float(drs_group["DetrLapTime"].median() - no_drs_group["DetrLapTime"].median())
    # Boost must be non-positive (DRS can only help, not hurt)
    boost = min(0.0, boost)

    model = DrsBoostModel(
        boost_sec=boost,
        n_samples_drs=n_drs,
        n_samples_no_drs=n_no_drs,
        insufficient=insufficient,
    )
    logger.info(
        "DrsBoost: boost=%.3f s, n_drs=%d, n_no_drs=%d%s",
        boost, n_drs, n_no_drs, " [INSUFFICIENT]" if insufficient else "",
    )
    return model


def fit_driver_offsets(laps: pd.DataFrame) -> dict:
    """Compute per-driver lap-time offset vs the full team/compound tyre model.

    Offset = median residual after removing global stint-progress trend AND
    the per-(team,compound) tyre model prediction.  Positive = slower than
    model, negative = faster.

    By construction, Σoffsets within a team ≈ 0 (median-based, not exact).
    Drivers with fewer than MIN_SAMPLES_DRIVER clean laps are flagged.
    """
    clean = laps[laps["IsClean"]].copy()
    sp_model = fit_stint_progress(laps)
    tyre_entries = fit_tyre_deg(laps)

    # Compute full model prediction for each clean lap
    def tyre_pred(row):
        key = (row["Team"], row["Compound"])
        entry = tyre_entries.get(key)
        if entry is None:
            return np.nan
        sl = row["StintLap"]
        pred = entry.intercept + entry.deg_linear * sl
        if sl > entry.cliff_start:
            pred += entry.cliff_slope * (sl - entry.cliff_start)
        return pred

    clean["TyrePred"] = clean.apply(tyre_pred, axis=1)
    # Full model = sp.slope * lapNum + tyre.intercept + tyre.slope * stintLap
    clean["FullModelPred"] = sp_model.slope * clean["LapsSinceStart"] + clean["TyrePred"]
    clean["Residual"] = clean["LapTimeSec"] - clean["FullModelPred"]

    result: dict = {}
    for driver, grp in clean.groupby("Driver"):
        valid = grp.dropna(subset=["Residual"])
        n = len(valid)
        team = grp["Team"].iloc[0]

        if n < MIN_SAMPLES_DRIVER:
            logger.warning(
                "DriverOffset [%s/%s]: insufficient samples n=%d (need ≥%d)",
                driver, team, n, MIN_SAMPLES_DRIVER,
            )

        # Mean (not median) so sum of residuals = 0, guaranteeing predicted
        # total time = actual total time for clean laps on the training race.
        offset = float(valid["Residual"].mean()) if n > 0 else 0.0

        result[driver] = DriverOffsetEntry(
            driver_id=driver,
            team=team,
            offset_sec=offset,
            n_samples=n,
        )
        logger.info(
            "DriverOffset [%s/%s]: %.4f s, n=%d",
            driver, team, offset, n,
        )

    return result
