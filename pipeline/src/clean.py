"""Clean and enrich raw lap data from a FastF1 Session."""

import logging
from typing import Union

import fastf1
import fastf1.core
import pandas as pd

logger = logging.getLogger(__name__)


def clean_laps(session: Union[fastf1.core.Session, pd.DataFrame]) -> pd.DataFrame:
    """Return cleaned lap DataFrame from a FastF1 Session or raw laps DataFrame.

    Cleaning steps:
    1. Extract laps (or accept pre-loaded DataFrame).
    2. Convert LapTime timedelta → float seconds.
    3. Drop laps with missing LapTime.
    4. Add LapTimeSec, StintLap, LapsSinceStart columns.
    5. Add IsClean flag: green flag, accurate, not pit-in/out, not deleted.

    Args:
        session: FastF1 Session object OR a pandas DataFrame with the same
                 schema (used in tests with fixture parquet).

    Returns:
        DataFrame with all original columns plus:
        - LapTimeSec (float, seconds)
        - StintLap (int, lap number within this stint, 1-indexed)
        - LapsSinceStart (float, global LapNumber)
        - IsClean (bool, True = usable for regression)
    """
    if isinstance(session, fastf1.core.Session):
        laps: pd.DataFrame = session.laps.copy()
    else:
        laps = session.copy()

    # Coerce LapTime to seconds; recover from Time - LapStartTime when NaN
    laps["LapTimeSec"] = laps["LapTime"].dt.total_seconds()
    recoverable = laps["LapTimeSec"].isna() & laps["Time"].notna() & laps["LapStartTime"].notna()
    laps.loc[recoverable, "LapTimeSec"] = (
        (laps.loc[recoverable, "Time"] - laps.loc[recoverable, "LapStartTime"])
        .dt.total_seconds()
    )
    n_recovered = int(recoverable.sum())
    if n_recovered:
        logger.info("Recovered %d NaN LapTime rows from Time - LapStartTime", n_recovered)

    # Drop rows without a lap time (e.g. first lap of first stint partial)
    before = len(laps)
    laps = laps.dropna(subset=["LapTimeSec"]).copy()
    logger.info("Dropped %d laps with unrecoverable LapTime", before - len(laps))

    # StintLap: position within current stint (1-indexed)
    laps["StintLap"] = (
        laps.groupby(["Driver", "Stint"])["LapNumber"].rank(method="first").astype(int)
    )

    # LapsSinceStart: global race lap counter (already in LapNumber, alias for clarity)
    laps["LapsSinceStart"] = laps["LapNumber"]

    # IsClean: green flag, not pit in/out, accurate, not deleted
    # TrackStatus "1" = All Clear; anything else contains SC/VSC/yellow flags.
    green = laps["TrackStatus"] == "1"
    not_pit_in = laps["PitInTime"].isna()
    not_pit_out = laps["PitOutTime"].isna()
    accurate = laps["IsAccurate"] == True  # noqa: E712
    not_deleted = laps["Deleted"] == False  # noqa: E712

    laps["IsClean"] = green & not_pit_in & not_pit_out & accurate & not_deleted

    n_clean = laps["IsClean"].sum()
    n_total = len(laps)
    logger.info("IsClean: %d / %d laps (%.1f%%)", n_clean, n_total, 100 * n_clean / n_total)

    return laps
