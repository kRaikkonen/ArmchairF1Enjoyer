/**
 * Validation debt #9 — multi-seed stability test.
 *
 * MEASUREMENT ONLY. Does not touch engine logic. Reuses the exact Bahrain 2025
 * no-events setup from simulate.test.ts, then runs the simulation for seeds
 * 1..20 and reports per-driver finishing-position statistics.
 *
 * Goal: find out whether the headline "▲N" position swings (e.g. ANT ▲3) are
 * physical predictions or just seed-dependent noise drift. High std-dev across
 * seeds = the result is noise-driven; low std-dev = stable.
 *
 * Run with:  npx vitest run --config scripts/vitest.seed.config.ts
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { test } from 'vitest';

import { simulate } from '../src/engine/simulate';
import type { TrackModel, DriverState, SimulationInput } from '../src/engine/types';

// ---------------------------------------------------------------------------
// Load Bahrain 2025 model (same path the engine test uses)
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const bahrainModel: TrackModel = JSON.parse(
  readFileSync(join(__dirname, '../../models/tracks/2025/bahrain.json'), 'utf-8'),
) as TrackModel;

// ---------------------------------------------------------------------------
// Bahrain 2025 setup — copied verbatim from simulate.test.ts so we measure the
// SAME scenario the product ships, with no What-If events.
// ---------------------------------------------------------------------------
// Real classified finishing order, derived from the model's FastF1-sourced
// results (single source of truth, PLAN §8.1). NOT the starting grid — the
// `actual` column in the old version of this script was the grid by mistake.
const ACTUAL_CLASSIFIED_ORDER: string[] = (bahrainModel.results ?? [])
  .filter((r) => r.status === 'finished')
  .sort((a, b) => a.position - b.position)
  .map((r) => r.driverId);

const GAP_PER_GRID_SPOT = 0.3; // s — schema constant for init (mirrors the test)

type DriverInit = [
  driverId: string, team: string, grid: number, compound: DriverState['compound'],
];
const DRIVER_INITS: DriverInit[] = [
  ['NOR', 'McLaren',          1,  'MEDIUM'],
  ['PIA', 'McLaren',          2,  'MEDIUM'],
  ['RUS', 'Mercedes',         3,  'SOFT'],
  ['ANT', 'Mercedes',         4,  'SOFT'],
  ['HAM', 'Ferrari',          5,  'MEDIUM'],
  ['VER', 'Red Bull Racing',  6,  'MEDIUM'],
  ['LEC', 'Ferrari',          7,  'MEDIUM'],
  ['TSU', 'Red Bull Racing',  8,  'MEDIUM'],
  ['OCO', 'Haas F1 Team',     9,  'SOFT'],
  ['BEA', 'Haas F1 Team',     10, 'SOFT'],
  ['STR', 'Aston Martin',     11, 'MEDIUM'],
  ['LAW', 'Racing Bulls',     12, 'HARD'],
  ['GAS', 'Alpine',           13, 'HARD'],
  ['ALO', 'Aston Martin',     14, 'MEDIUM'],
  ['HAD', 'Racing Bulls',     15, 'HARD'],
  ['DOO', 'Alpine',           16, 'HARD'],
  ['ALB', 'Williams',         17, 'MEDIUM'],
  ['BOR', 'Kick Sauber',      18, 'MEDIUM'],
];

function makeDrivers(): DriverState[] {
  return DRIVER_INITS.map(([driverId, team, grid, compound]) => ({
    driverId,
    team,
    gridPosition: grid,
    position: grid,
    compound,
    stintLap: 1,
    lapsSinceStart: 0,
    totalTimeSec: (grid - 1) * GAP_PER_GRID_SPOT,
    gapToLeaderSec: (grid - 1) * GAP_PER_GRID_SPOT,
    gapToCarAheadSec: grid === 1 ? Infinity : GAP_PER_GRID_SPOT,
    ersPool: 4,
    ersMode: 'neutral' as const,
    isRetired: false,
    pitCount: 0,
    nextCompound: 'HARD' as const,
  }));
}

// ---------------------------------------------------------------------------
// Run seeds 1..20, collect each driver's finishing position per seed
// ---------------------------------------------------------------------------
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

const positionsByDriver = new Map<string, number[]>();

for (const seed of SEEDS) {
  const input: SimulationInput = {
    trackModel: bahrainModel,
    initialDrivers: makeDrivers(), // fresh state per run
    totalLaps: 57,
    events: [],                    // no What-If injection
    seed,
    trackTempC: 32,
    weatherIsWet: false,
  };

  const result = simulate(input);
  result.finalOrder.forEach((d, idx) => {
    const pos = idx + 1; // finalOrder is already sorted ascending by position
    if (!positionsByDriver.has(d.driverId)) positionsByDriver.set(d.driverId, []);
    positionsByDriver.get(d.driverId)!.push(pos);
  });
}

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function stdDev(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

interface Row {
  driver: string;
  actual: number;
  median: number;
  best: number;
  worst: number;
  range: number;
  std: number;
}

const rows: Row[] = [...positionsByDriver.entries()].map(([driver, ps]) => {
  const actualIdx = ACTUAL_CLASSIFIED_ORDER.indexOf(driver);
  return {
    driver,
    actual: actualIdx >= 0 ? actualIdx + 1 : NaN,
    median: median(ps),
    best: Math.min(...ps),
    worst: Math.max(...ps),
    range: Math.max(...ps) - Math.min(...ps),
    std: stdDev(ps),
  };
});

// Sort by std-dev descending (most noise-sensitive first)
rows.sort((a, b) => b.std - a.std);

// ---------------------------------------------------------------------------
// Print table
// ---------------------------------------------------------------------------
function pad(s: string | number, w: number): string {
  return String(s).padStart(w);
}

test('seed-stability: Bahrain 2025, no events, seeds 1..20', () => {
  const lines: string[] = [];
  lines.push('');
  lines.push('Bahrain 2025 · no What-If · seeds 1..20 · sorted by std-dev desc');
  lines.push('─'.repeat(64));
  lines.push(
    `${pad('DRV', 4)} ${pad('actual', 7)} ${pad('median', 7)} ${pad('best', 5)} ${pad('worst', 6)} ${pad('range', 6)} ${pad('std', 6)}`,
  );
  lines.push('─'.repeat(64));
  for (const r of rows) {
    lines.push(
      `${pad(r.driver, 4)} ${pad(Number.isNaN(r.actual) ? '—' : r.actual, 7)} ${pad(r.median, 7)} ${pad(r.best, 5)} ${pad(r.worst, 6)} ${pad(r.range, 6)} ${pad(r.std.toFixed(2), 6)}`,
    );
  }
  lines.push('─'.repeat(64));
  const avgStd = mean(rows.map((r) => r.std));
  const maxRange = Math.max(...rows.map((r) => r.range));
  lines.push(`mean std-dev across grid: ${avgStd.toFixed(2)} positions`);
  lines.push(`max position range (best→worst) for any driver: ${maxRange}`);
  lines.push('');

  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
});
