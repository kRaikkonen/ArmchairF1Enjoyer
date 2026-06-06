#!/usr/bin/env python
"""Extract a real circuit outline from FastF1 telemetry → normalized SVG path.

Single source of truth for the track shape: the fastest race lap's X/Y position
trace from FastF1. Output is written to outline-<slug>.json for baking into the
TrackModel. If telemetry is unavailable offline this will fail loudly; the UI
then keeps its curated fallback path.

Run: conda run -n f1apt python pipeline/scripts/extract_track_outline.py bahrain 2025 Bahrain
"""

import json
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

import fastf1  # noqa: E402

ROOT = Path(__file__).parent.parent.parent
fastf1.Cache.enable_cache(str(ROOT / "pipeline" / "cache"))

VIEW = 1000.0  # normalized viewBox edge
PAD = 40.0


def main(slug: str, year: int, event: str) -> None:
    s = fastf1.get_session(year, event, "R")
    s.load(laps=True, telemetry=True, weather=False, messages=False)
    tel = s.laps.pick_fastest().get_telemetry()
    xs = tel["X"].to_numpy(dtype=float)
    ys = tel["Y"].to_numpy(dtype=float)

    minx, maxx = xs.min(), xs.max()
    miny, maxy = ys.min(), ys.max()
    span = max(maxx - minx, maxy - miny)
    scale = (VIEW - 2 * PAD) / span

    # Normalize into [PAD, VIEW-PAD]; flip Y (telemetry Y up → SVG Y down).
    px = [PAD + (x - minx) * scale for x in xs]
    py = [PAD + (maxy - y) * scale for y in ys]

    # Downsample to keep the path compact while preserving shape.
    step = max(1, len(px) // 400)
    pts = list(zip(px[::step], py[::step]))
    path = "M " + " L ".join(f"{x:.1f},{y:.1f}" for x, y in pts) + " Z"

    length_km = round(float(tel["Distance"].max()) / 1000.0, 3)
    out = {
        "viewBox": f"0 0 {int(VIEW)} {int(VIEW)}",
        "path": path,
        "startFinish": {"x": round(px[0], 1), "y": round(py[0], 1)},
        "lengthKm": length_km,
        "nPoints": len(pts),
        "source": f"FastF1 {year} {event} fastest-lap telemetry",
    }
    dest = ROOT / "pipeline" / "scripts" / f"outline-{slug}.json"
    dest.write_text(json.dumps(out), encoding="utf-8")
    print(f"OK wrote {len(pts)}-point outline -> {dest}")


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]), sys.argv[3])
