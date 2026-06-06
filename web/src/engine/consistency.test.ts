/**
 * §8.3 Python ↔ TS engine consistency — permanent cross-language regression test.
 *
 * PLAN §8.3 mandates a numerical consistency test proving the Python pipeline
 * and the TS runtime engine produce the SAME lap time for the same input. The
 * golden file laptime-consistency.golden.json holds Python `_predict_lap_time`
 * outputs for a sample of real Bahrain clean laps; this test asserts the TS
 * `computeLapTime` core reproduces every value to <1e-9.
 *
 * "Controlled" inputs reduce computeLapTime to exactly Python's
 * sp + tyre + driverOffset formula: dry, no DRS (inDrsZone=false), no dirty air
 * (gap=Infinity), neutral ERS, and a constant RNG () => 0.5 that zeroes the
 * seeded noise term. No engine change is needed.
 *
 * If this test fails after a legitimate model rebuild, regenerate the golden:
 *   conda run -n f1apt python pipeline/scripts/controlled_consistency_dump.py
 * A failure with an unchanged golden means the TS lap-time core has drifted
 * away from the Python core — a real §8.3 violation.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { describe, it, expect } from 'vitest';

import { computeLapTime } from './lapTime';
import type { TrackModel, Compound } from './types';

const __dirname = dirname(fileURLToPath(import.meta.url));

const model: TrackModel = JSON.parse(
  readFileSync(join(__dirname, '../../../models/tracks/2025/bahrain.json'), 'utf-8'),
) as TrackModel;

interface GoldenCase {
  driverId: string;
  team: string;
  compound: string;
  stintLap: number;
  lapsSinceStart: number;
  expectedLapTimeSec: number;
}
const golden: { cases: GoldenCase[] } = JSON.parse(
  readFileSync(join(__dirname, 'laptime-consistency.golden.json'), 'utf-8'),
) as { cases: GoldenCase[] };

/** Zero-noise RNG: noise = (0.5 - 0.5) * 2 * amp = 0. */
const NO_NOISE = () => 0.5;

function tsControlledLapTime(c: GoldenCase): number {
  return computeLapTime(
    {
      driverId: c.driverId,
      team: c.team,
      compound: c.compound as Compound,
      stintLap: c.stintLap,
      lapsSinceStart: c.lapsSinceStart,
      gapToCarAheadSec: Infinity, // no dirty air
      inDrsZone: false,           // no DRS
      ersState: { pool: 0 },
      ersMode: 'neutral',         // no ERS delta
      trackTempC: 32,             // reference temp → 0 weather delta
      isWet: false,
      isSafetyCarLap: false,
      isVscLap: false,
    },
    model,
    NO_NOISE,
  ).lapTimeSec;
}

describe('engine consistency (§8.3)', () => {
  it('TS computeLapTime reproduces the Python core for every golden clean lap', () => {
    expect(golden.cases.length).toBeGreaterThan(50); // golden actually loaded

    let maxAbsDiff = 0;
    for (const c of golden.cases) {
      const diff = Math.abs(tsControlledLapTime(c) - c.expectedLapTimeSec);
      if (diff > maxAbsDiff) maxAbsDiff = diff;
    }
    expect(maxAbsDiff).toBeLessThan(1e-9);
  });
});
