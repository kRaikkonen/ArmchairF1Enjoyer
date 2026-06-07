#!/usr/bin/env python
"""ONLINE data-pull (human-sanctioned) — fetch one race's fixtures from FastF1.

Per the pipeline conventions Claude does not normally pull from the network;
this script is the explicit, sanctioned online step. It writes the two committed
fixtures the offline build needs:
  tests/fixtures/<slug>-<year>-laps.parquet   (session.laps)
  tests/fixtures/<slug>-<year>-meta.json      (results + total_laps + weather)
and the circuit outline (outline-<slug>.json) from fastest-lap telemetry.

Run: conda run -n f1apt python pipeline/scripts/fetch_fixture.py <slug> <year>
"""

import json
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

import fastf1

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
fastf1.Cache.enable_cache(str(ROOT / "pipeline" / "cache"))

from src.schedule import resolve_event  # noqa: E402

FIXTURES = ROOT / "pipeline" / "tests" / "fixtures"


def main(slug: str, year: int) -> None:
    event = resolve_event(slug, year)
    print(f"[fetch] {slug} {year} → {event}")
    session = fastf1.get_session(year, event, "R")
    session.load(laps=True, telemetry=True, weather=True, messages=True)

    laps = session.laps
    laps_path = FIXTURES / f"{slug}-{year}-laps.parquet"
    laps.to_parquet(laps_path)

    weather = session.weather_data
    meta = {
        "season": year,
        "event": event,
        "total_laps": int(laps["LapNumber"].max()),
        "weather_avg_track_temp": float(weather["TrackTemp"].mean()) if weather is not None and len(weather) else None,
        "weather_avg_air_temp": float(weather["AirTemp"].mean()) if weather is not None and len(weather) else None,
        "results": session.results[["DriverNumber", "Abbreviation", "TeamName", "Position", "ClassifiedPosition"]].to_dict("records"),
    }
    meta_path = FIXTURES / f"{slug}-{year}-meta.json"
    meta_path.write_text(json.dumps(meta, default=str, indent=0, ensure_ascii=False), encoding="utf-8")

    # Circuit outline from the fastest lap's telemetry.
    import subprocess
    subprocess.run([sys.executable, str(ROOT / "pipeline" / "scripts" / "extract_track_outline.py"), slug, str(year), event], check=False)

    print(f"[fetch] wrote {laps_path.name}, {meta_path.name} ({len(meta['results'])} results, {meta['total_laps']} laps)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <slug> <year>", file=sys.stderr)
        sys.exit(1)
    main(sys.argv[1], int(sys.argv[2]))
