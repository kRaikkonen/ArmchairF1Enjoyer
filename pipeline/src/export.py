"""Export fitted TrackModel to schema-v1 JSON for the web engine."""

import json
import logging
from pathlib import Path
from typing import Any

from .backtest import TrackModel
from .fit import TyreDegEntry, DriverOffsetEntry

logger = logging.getLogger(__name__)

SCHEMA_VERSION = "v1"


def _tyre_deg_to_dict(entry: TyreDegEntry) -> dict:
    return {
        "intercept": entry.intercept,   # absolute team/compound pace at stintLap=0
        "degLinear": entry.deg_linear,
        "cliffStart": entry.cliff_start,
        "cliffSlope": entry.cliff_slope,
        "nSamples": entry.n_samples,
        "insufficient": entry.insufficient,
    }


def _driver_offset_to_dict(entry: DriverOffsetEntry) -> dict:
    return {
        "driverId": entry.driver_id,
        "team": entry.team,
        "offsetSec": entry.offset_sec,
        "nSamples": entry.n_samples,
    }


def export_track(model: TrackModel, path: str | Path) -> None:
    """Serialize a TrackModel to schema-v1 JSON.

    The JSON is consumed by web/src/engine/ — all physics parameters must come
    from this file; hardcoding in engine code is forbidden (CLAUDE.md rule 1).
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    tyre_deg_export: dict = {}
    for (team, compound), entry in model.tyre_deg.items():
        key = f"{team}|{compound}"
        tyre_deg_export[key] = _tyre_deg_to_dict(entry)

    driver_offsets_export: dict = {}
    for driver_id, entry in model.driver_offsets.items():
        driver_offsets_export[driver_id] = _driver_offset_to_dict(entry)

    payload: dict[str, Any] = {
        "schemaVersion": SCHEMA_VERSION,
        "season": model.season,
        "event": model.event,
        "trackBasePace": model.track_base_pace,
        "stintProgress": {
            "slope": model.stint_progress.slope,
            "intercept": model.stint_progress.intercept,
            "rSquared": model.stint_progress.r_squared,
            "nSamples": model.stint_progress.n_samples,
        },
        "tyreDeg": tyre_deg_export,
        "dirtyAir": {
            "penaltySec": model.dirty_air.penalty_sec,
            "gapThresholdSec": 1.5,  # model architecture constant, not a fit parameter
            "nSamplesDirty": model.dirty_air.n_samples_dirty,
            "nSamplesClean": model.dirty_air.n_samples_clean,
            "insufficient": model.dirty_air.insufficient,
        },
        "drsBoost": {
            "boostSec": model.drs_boost.boost_sec,
            "gapThresholdSec": 1.0,  # model architecture constant, not a fit parameter
            "nSamplesDrs": model.drs_boost.n_samples_drs,
            "nSamplesNoDrs": model.drs_boost.n_samples_no_drs,
            "insufficient": model.drs_boost.insufficient,
        },
        "driverOffsets": driver_offsets_export,
        "fitMeta": model.fit_meta,
    }

    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    logger.info("Exported TrackModel to %s", path)
