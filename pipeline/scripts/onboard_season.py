#!/usr/bin/env python
"""Onboard every non-sprint race of a season: fetch fixtures (online) + build.

Idempotent: re-fetches only when a race's fixtures are missing, always rebuilds.
Run: conda run -n f1apt python pipeline/scripts/onboard_season.py 2025
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
import fastf1
fastf1.Cache.enable_cache(str(ROOT / "pipeline" / "cache"))
from src.schedule import all_races  # noqa: E402

SCRIPTS = ROOT / "pipeline" / "scripts"
FIXTURES = ROOT / "pipeline" / "tests" / "fixtures"


def main(year: int) -> None:
    races = all_races(year)
    print(f"[onboard] {len(races)} races in {year} (incl. sprint weekends): {[r['slug'] for r in races]}", flush=True)
    for i, r in enumerate(races, 1):
        slug = r["slug"]
        print(f"\n[onboard {i}/{len(races)}] {slug} (round {r['round']})", flush=True)
        if not (FIXTURES / f"{slug}-{year}-laps.parquet").exists():
            rc = subprocess.run([sys.executable, str(SCRIPTS / "fetch_fixture.py"), slug, str(year)])
            if rc.returncode != 0:
                print(f"[onboard] FETCH FAILED for {slug}; skipping", flush=True)
                continue
        rc = subprocess.run([sys.executable, str(SCRIPTS / "build_track.py"), slug, str(year)])
        if rc.returncode != 0:
            print(f"[onboard] BUILD FAILED for {slug}", flush=True)
    print("\n[onboard] done", flush=True)


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 2025)
