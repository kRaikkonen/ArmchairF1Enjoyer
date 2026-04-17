"""Sanity-check a produced TrackModel JSON against basic schema and value constraints.

Usage (from pipeline/):
    python -m src.backtest_sanity bahrain 2025
"""

import json
import sys
from pathlib import Path


ROOT = Path(__file__).parent.parent.parent


def check(event_slug: str, year: int) -> bool:
    path = ROOT / "models" / "tracks" / str(year) / f"{event_slug.lower()}.json"
    if not path.exists():
        print(f"FAIL: {path} does not exist")
        return False

    with open(path) as f:
        data = json.load(f)

    errors = []

    # Schema version
    if data.get("schemaVersion") != "v1":
        errors.append(f"schemaVersion mismatch: {data.get('schemaVersion')}")

    # fitMeta present
    if "fitMeta" not in data:
        errors.append("fitMeta missing")

    # Stint progress slope should be negative
    sp = data.get("stintProgress", {})
    if sp.get("slope", 0) >= 0:
        errors.append(f"stintProgress.slope should be negative, got {sp.get('slope')}")

    # tyreDeg should be non-empty
    tyre_deg = data.get("tyreDeg", {})
    if len(tyre_deg) < 5:
        errors.append(f"tyreDeg too few entries: {len(tyre_deg)}")

    # All tyre entries have required keys
    for key, entry in tyre_deg.items():
        for field in ("intercept", "degLinear", "cliffStart", "cliffSlope", "nSamples", "insufficient"):
            if field not in entry:
                errors.append(f"tyreDeg[{key}] missing {field}")

    # drsBoost should be non-positive
    drs = data.get("drsBoost", {})
    if drs.get("boostSec", -1) > 0:
        errors.append(f"drsBoost.boostSec should be ≤0, got {drs.get('boostSec')}")

    # dirtyAir penalty should be non-negative
    da = data.get("dirtyAir", {})
    if da.get("penaltySec", 0) < 0:
        errors.append(f"dirtyAir.penaltySec should be ≥0, got {da.get('penaltySec')}")

    # driverOffsets present for at least 10 drivers
    if len(data.get("driverOffsets", {})) < 10:
        errors.append(f"driverOffsets too few: {len(data.get('driverOffsets', {}))}")

    if errors:
        for e in errors:
            print(f"FAIL: {e}")
        return False

    print(f"OK: {path} passes sanity check ({len(tyre_deg)} tyre entries, {len(data['driverOffsets'])} drivers)")
    return True


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <event_slug> <year>", file=sys.stderr)
        sys.exit(1)
    ok = check(sys.argv[1], int(sys.argv[2]))
    sys.exit(0 if ok else 1)
