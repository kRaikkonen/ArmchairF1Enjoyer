#!/usr/bin/env python
"""Generate the race manifest the frontend reads to list onboarded tracks.

Scans models/tracks/<year>/*.json → web/public/models/tracks/<year>/index.json
(sorted by round), so HomePage renders the available races from data instead of
a hardcoded list. Offline.

Run: conda run -n f1apt python pipeline/scripts/gen_manifest.py 2025
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
import fastf1
fastf1.Cache.enable_cache(str(ROOT / "pipeline" / "cache"))
from src.schedule import all_races  # noqa: E402


def main(year: int) -> None:
    rounds = {r["slug"]: r for r in all_races(year)}
    src_dir = ROOT / "models" / "tracks" / str(year)
    entries = []
    for f in sorted(src_dir.glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        slug = f.stem
        meta = rounds.get(slug, {})
        entries.append({
            "slug": slug,
            "name": d.get("event", slug),
            "round": meta.get("round", 999),
            "season": year,
            "totalLaps": d.get("totalLaps"),
            "circuitLengthKm": d.get("circuitLengthKm"),
            "dataQuality": d.get("dataQuality", "ok"),
            "modelVersion": d.get("modelVersion", ""),
        })
    entries.sort(key=lambda e: e["round"])
    dest = ROOT / "web" / "public" / "models" / "tracks" / str(year) / "index.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[manifest] {len(entries)} races → {dest}")
    for e in entries:
        print(f"  R{e['round']:>2} {e['slug']:<16} {e['dataQuality']}")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 2025)
