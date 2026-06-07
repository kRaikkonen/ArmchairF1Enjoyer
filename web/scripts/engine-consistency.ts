/**
 * Controlled engine-consistency diagnostic — TS side (MEASUREMENT ONLY).
 *
 * Question (PLAN §8.3 vs §8.4): is the TS engine's race-level maxErr=8 caused by
 * engine inconsistency (TS lap-time core != Python core, §8.3), or by forward-sim
 * product logic (seeded noise + greedy AI strategy choosing different pit
 * laps/compounds than reality)?
 *
 * Method: replay the EXACT same structure the Python backtest uses (real strategy,
 * real pit/SC laps kept at their actual times; clean laps replaced by a fitted
 * prediction) — but compute the clean-lap prediction with the TS computeLapTime
 * core instead of Python's _predict_lap_time. Everything except the lap-time core
 * is held identical, so any divergence is the engine core (§8.3).
 *
 * "Controlled mode" needs NO engine change: Python's _predict_lap_time is
 * sp + tyre + driverOffset only, and computeLapTime reduces to exactly that when
 * fed dry / no-DRS (inDrsZone=false) / no-dirty-air (gap=Infinity) / neutral-ERS
 * inputs and a constant RNG () => 0.5 (which zeroes the ±0.05s noise term).
 *
 * Run: npx vitest run --config scripts/vitest.diag.config.ts --disable-console-intercept
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { test, expect } from 'vitest';

import { computeLapTime } from '../src/engine/lapTime';
import type { TrackModel, Compound } from '../src/engine/types';

const __dirname = dirname(fileURLToPath(import.meta.url));

const model: TrackModel = JSON.parse(
  readFileSync(join(__dirname, '../../models/tracks/2025/bahrain.json'), 'utf-8'),
) as TrackModel;

interface LapRow {
  driver: string;
  team: string;
  compound: string;
  stintLap: number;
  lapsSinceStart: number;
  lapNumber: number;
  isClean: boolean;
  lapTimeSec: number;
  pyPredLapTime: number | null;
}
interface Dump {
  classifiedIds: string[];
  actualOrder: string[];
  pythonAllMaxErr: number;
  rows: LapRow[];
}

const dump: Dump = JSON.parse(
  readFileSync(join(__dirname, '../../pipeline/scripts/controlled_consistency_dump.json'), 'utf-8'),
) as Dump;

/** Zero-noise RNG: noise term = (0.5 - 0.5) * 2 * amp = 0. */
const NO_NOISE = () => 0.5;

/** TS controlled-mode clean-lap time — mirrors Python _predict_lap_time. */
function tsControlledLapTime(row: LapRow): number {
  return computeLapTime(
    {
      driverId: row.driver,
      team: row.team,
      compound: row.compound as Compound,
      stintLap: row.stintLap,
      lapsSinceStart: row.lapsSinceStart,
      gapToCarAheadSec: Infinity, // no dirty air
      inDrsZone: false,           // no DRS
      isOutLap: false,
      ersState: { pool: 0 },
      ersMode: 'neutral',         // no ERS delta
      trackTempC: 32,             // reference temp -> 0 weather delta
      isWet: false,
      isSafetyCarLap: false,
      isVscLap: false,
    },
    model,
    NO_NOISE,
  ).lapTimeSec;
}

function replayMaxErr(perLapTime: (row: LapRow) => number): number {
  const totals = new Map<string, number>();
  for (const row of dump.rows) {
    if (!dump.classifiedIds.includes(row.driver)) continue;
    const t = row.isClean ? perLapTime(row) : row.lapTimeSec;
    totals.set(row.driver, (totals.get(row.driver) ?? 0) + t);
  }
  const ranked = [...totals.entries()].sort((a, b) => a[1] - b[1]).map(([d]) => d);
  let maxErr = 0;
  for (const driver of dump.actualOrder) {
    const actualPos = dump.actualOrder.indexOf(driver) + 1;
    const predIdx = ranked.indexOf(driver);
    if (predIdx < 0) continue;
    const err = Math.abs(predIdx + 1 - actualPos);
    if (err > maxErr) maxErr = err;
  }
  return maxErr;
}

test('engine-consistency: TS core vs Python core under identical replay', () => {
  // Level 1 — per-clean-lap numerical equivalence of the two cores.
  let maxAbsDiff = 0;
  let worst = '';
  let nClean = 0;
  for (const row of dump.rows) {
    if (!row.isClean || row.pyPredLapTime == null) continue;
    nClean++;
    const ts = tsControlledLapTime(row);
    const diff = Math.abs(ts - row.pyPredLapTime);
    if (diff > maxAbsDiff) {
      maxAbsDiff = diff;
      worst = `${row.driver} L${row.lapNumber} ${row.team}|${row.compound} stint${row.stintLap}: ts=${ts.toFixed(6)} py=${row.pyPredLapTime.toFixed(6)}`;
    }
  }

  // Level 2 — race-level maxErr under identical replay methodology.
  const pyReplay = replayMaxErr((r) => r.pyPredLapTime as number);
  const tsReplay = replayMaxErr(tsControlledLapTime);

  // eslint-disable-next-line no-console
  console.log(
    '\n=== Controlled engine-consistency diagnostic ===\n' +
      `clean laps compared            : ${nClean}\n` +
      `Level 1 max |TS - Python| /lap : ${maxAbsDiff.toExponential(3)} s\n` +
      `   worst lap                   : ${worst}\n` +
      `Level 2 Python-replay maxErr   : ${pyReplay}\n` +
      `Level 2 TS-replay   maxErr     : ${tsReplay}\n` +
      `(ref) Python canonical maxErr  : ${dump.pythonAllMaxErr}\n` +
      `(ref) TS forward-sim maxErr    : 8  (full product logic: noise+AI+ERS)\n`,
  );

  // Pin the consistency result so future drift is caught (characterization).
  expect(maxAbsDiff).toBeLessThan(1e-6);
  expect(tsReplay).toBe(pyReplay);
});
