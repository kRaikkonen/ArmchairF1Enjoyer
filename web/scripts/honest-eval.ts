/**
 * Honest-model forward-sim evaluation (MEASUREMENT ONLY).
 *
 * After replacing the mean-residual driver offsets with honest medians (§8.4),
 * measure the TS forward-sim maxErr vs the real FastF1 classified finish:
 *   (b) no-events, seed 42
 *   (c) a representative What-If: move LEC's pit to lap 15 (HARD), seed 42
 *
 * (c) is counterfactual — "maxErr vs the real finish" is not pure accuracy
 * there; the point is whether the picture stays coherent (similar magnitude)
 * or blows up when a strategy lever is pulled.
 *
 * Run: npx vitest run --config scripts/vitest.honest.config.ts --disable-console-intercept
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { test } from 'vitest';

import { simulate } from '../src/engine/simulate';
import type { TrackModel, DriverState, SimulationInput, EventEffect } from '../src/engine/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const model: TrackModel = JSON.parse(
  readFileSync(join(__dirname, '../../models/tracks/2025/bahrain.json'), 'utf-8'),
) as TrackModel;

const ACTUAL_CLASSIFIED_ORDER: string[] = (model.results ?? [])
  .filter((r) => r.status === 'finished')
  .sort((a, b) => a.position - b.position)
  .map((r) => r.driverId);

// Same Bahrain grid setup as simulate.test.ts.
const GAP_PER_GRID_SPOT = 0.3;
type DriverInit = [string, string, number, DriverState['compound']];
const DRIVER_INITS: DriverInit[] = [
  ['NOR', 'McLaren', 1, 'MEDIUM'], ['PIA', 'McLaren', 2, 'MEDIUM'],
  ['RUS', 'Mercedes', 3, 'SOFT'], ['ANT', 'Mercedes', 4, 'SOFT'],
  ['HAM', 'Ferrari', 5, 'MEDIUM'], ['VER', 'Red Bull Racing', 6, 'MEDIUM'],
  ['LEC', 'Ferrari', 7, 'MEDIUM'], ['TSU', 'Red Bull Racing', 8, 'MEDIUM'],
  ['OCO', 'Haas F1 Team', 9, 'SOFT'], ['BEA', 'Haas F1 Team', 10, 'SOFT'],
  ['STR', 'Aston Martin', 11, 'MEDIUM'], ['LAW', 'Racing Bulls', 12, 'HARD'],
  ['GAS', 'Alpine', 13, 'HARD'], ['ALO', 'Aston Martin', 14, 'MEDIUM'],
  ['HAD', 'Racing Bulls', 15, 'HARD'], ['DOO', 'Alpine', 16, 'HARD'],
  ['ALB', 'Williams', 17, 'MEDIUM'], ['BOR', 'Kick Sauber', 18, 'MEDIUM'],
];

function makeDrivers(): DriverState[] {
  return DRIVER_INITS.map(([driverId, team, grid, compound]) => ({
    driverId, team, gridPosition: grid, position: grid, compound,
    stintLap: 1, lapsSinceStart: 0,
    totalTimeSec: (grid - 1) * GAP_PER_GRID_SPOT,
    gapToLeaderSec: (grid - 1) * GAP_PER_GRID_SPOT,
    gapToCarAheadSec: grid === 1 ? Infinity : GAP_PER_GRID_SPOT,
    ersPool: 4, ersMode: 'neutral' as const, isRetired: false,
    pitCount: 0, nextCompound: 'HARD' as const,
  }));
}

function maxErr(events: EventEffect[]): number {
  const input: SimulationInput = {
    trackModel: model, initialDrivers: makeDrivers(), totalLaps: 57,
    events, seed: 42, trackTempC: 32, weatherIsWet: false,
  };
  const sim = simulate(input).finalOrder.filter((d) => !d.isRetired).map((d) => d.driverId);
  let m = 0;
  for (const driver of ACTUAL_CLASSIFIED_ORDER) {
    const actualPos = ACTUAL_CLASSIFIED_ORDER.indexOf(driver) + 1;
    const simIdx = sim.indexOf(driver);
    if (simIdx < 0) continue;
    const err = Math.abs(simIdx + 1 - actualPos);
    if (err > m) m = err;
  }
  return m;
}

test('honest forward-sim eval (b no-events / c What-If)', () => {
  const b = maxErr([]);
  const c = maxErr([{ type: 'pit', lap: 15, driverId: 'LEC', compound: 'HARD' }]);
  // eslint-disable-next-line no-console
  console.log(
    '\n=== Honest-model forward-sim maxErr (seed 42) ===\n' +
      `(b) no-events                  : ${b}\n` +
      `(c) What-If LEC pit lap 15 HARD: ${c}\n`,
  );
});
