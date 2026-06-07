/**
 * Engine simulation tests — vitest, Node environment.
 *
 * Uses node:fs to load the Bahrain model JSON for integration tests.
 * This is a test file; the engine-purity rule against fs/path imports
 * applies only to production engine code, not test helpers.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { describe, it, expect } from 'vitest';

import { simulate } from './simulate';
import { stepErs } from './lapTime';
import { computeLapTime } from './lapTime';
import { createRng } from './rng';
import type { TrackModel, DriverState, SimulationInput, ErsMode } from './types';

// ---------------------------------------------------------------------------
// Load Bahrain 2025 model from disk (test helper — fs use allowed in tests)
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const bahrainModel: TrackModel = JSON.parse(
  readFileSync(join(__dirname, '../../../models/tracks/2025/bahrain.json'), 'utf-8'),
) as TrackModel;

// ---------------------------------------------------------------------------
// Bahrain 2025 actual classified finishing order — derived from the model's
// `results` field, which is itself a FastF1 derivative (single source of truth,
// PLAN §8.1). DNF/DSQ drivers (SAI=R, HUL=D) are excluded: the engine does not
// model mechanical/disqualification events, so comparing it against them is
// meaningless.
//
// NOTE: the previous hard-coded ACTUAL_ORDER_2025 array here was actually the
// *starting grid*, not the finishing order (it equalled DRIVER_INITS grid
// order exactly). Test 2's "within 4 positions" therefore measured "how little
// the sim moved cars from the grid", not real accuracy. This derivation fixes
// that — see backtest-log.md.
// ---------------------------------------------------------------------------
const ACTUAL_CLASSIFIED_ORDER: string[] = (bahrainModel.results ?? [])
  .filter((r) => r.status === 'finished')
  .sort((a, b) => a.position - b.position)
  .map((r) => r.driverId);

// ---------------------------------------------------------------------------
// Initial driver states for Bahrain 2025
//
// Starting compounds chosen from the actual race data (most-sampled compound
// per team in the model, which reflects their primary race strategy):
//   MEDIUM: McLaren, Ferrari, Red Bull, Aston Martin, Williams, Kick Sauber, Racing Bulls
//   SOFT:   Mercedes (45 samples >> 30 MEDIUM), Haas (38 samples >> 17 MEDIUM)
//   HARD:   Alpine (46 samples largest group)
//
// Initial totalTimeSec offset: 0.3 s per grid position to encode the
// realistic first-lap spread without needing to simulate lap 1 separately.
// This ensures the physics model only needs to move drivers ≤4 positions
// rather than reproduce the full race from scratch.
// ---------------------------------------------------------------------------
const GAP_PER_GRID_SPOT = 0.3; // s — schema constant for test initialisation

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
  ['LAW', 'Racing Bulls',     12, 'HARD'],   // 39 HARD samples, largest group
  ['GAS', 'Alpine',           13, 'HARD'],
  ['ALO', 'Aston Martin',     14, 'MEDIUM'],
  ['HAD', 'Racing Bulls',     15, 'HARD'],   // 39 HARD samples, largest group
  ['DOO', 'Alpine',           16, 'HARD'],
  ['ALB', 'Williams',         17, 'MEDIUM'],
  ['BOR', 'Kick Sauber',      18, 'MEDIUM'],
];

const BAHRAIN_DRIVERS: DriverState[] = DRIVER_INITS.map(([driverId, team, grid, compound]) => ({
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

const BAHRAIN_INPUT: SimulationInput = {
  trackModel: bahrainModel,
  initialDrivers: BAHRAIN_DRIVERS,
  totalLaps: 57,
  events: [],
  seed: 42,
  trackTempC: 32,
  weatherIsWet: false,
};

// ---------------------------------------------------------------------------
// Test 1: Determinism — same seed produces identical results
// ---------------------------------------------------------------------------
describe('simulate', () => {
  it('same seed produces identical results (determinism)', () => {
    const result1 = simulate(BAHRAIN_INPUT);
    const result2 = simulate(BAHRAIN_INPUT);

    // Compare final order
    const order1 = result1.finalOrder.map((d) => d.driverId);
    const order2 = result2.finalOrder.map((d) => d.driverId);
    expect(order1).toEqual(order2);

    // Compare lap times for first and last lap
    const snap1First = result1.lapHistory[0].map((s) => s.lapTimeSec);
    const snap2First = result2.lapHistory[0].map((s) => s.lapTimeSec);
    expect(snap1First).toEqual(snap2First);

    const snap1Last = result1.lapHistory[56].map((s) => s.lapTimeSec);
    const snap2Last = result2.lapHistory[56].map((s) => s.lapTimeSec);
    expect(snap1Last).toEqual(snap2Last);
  });

  // ---------------------------------------------------------------------------
  // Test 2: Bahrain backtest — TS engine final order vs REAL classified finish.
  //
  // This is a CHARACTERIZATION test, not an acceptance gate. It pins the TS
  // engine's *real* accuracy: simulated finishing order vs the actual FastF1
  // classified result (single source of truth, PLAN §8.1).
  //
  // The old assertion `maxErr <= 4` compared the sim to the *starting grid*
  // (the mislabeled ACTUAL_ORDER_2025), so it measured almost nothing. Against
  // the true finish order the error is larger and honest. We assert the exact
  // measured value so any future change that shifts accuracy is caught — we do
  // NOT loosen a tolerance to manufacture a pass (that would violate §8.4).
  //
  // Whether REAL_MAX_POS_ERR is acceptable for an armchair toy, and what a real
  // acceptance gate should be, is a pending human decision (PLAN §10: "回测不
  // 达标时改模型还是踢出赛道"). See docs/backtest-log.md.
  // ---------------------------------------------------------------------------
  // Re-measured 2026-06-07. Forward-sim worst-case dropped 8 → 4 after the
  // dirty-air fit fix (real on-track gaps revive following friction) + thin-cell
  // tyre-deg sanitization (no more garbage slopes the sim over-extrapolated).
  // See backtest-log.md.
  const REAL_MAX_POS_ERR = 4; // seed 42, honest offsets + optimal-lap pit AI + real dirty air

  it('Bahrain 2025 no-events — characterize TS engine accuracy vs real finish', () => {
    const result = simulate(BAHRAIN_INPUT);
    const simClassified = result.finalOrder
      .filter((d) => !d.isRetired)
      .map((d) => d.driverId);

    let maxErr = 0;
    const deltas: { driver: string; actual: number; sim: number; err: number }[] = [];
    for (const driverId of ACTUAL_CLASSIFIED_ORDER) {
      const actualPos = ACTUAL_CLASSIFIED_ORDER.indexOf(driverId) + 1;
      const simIdx = simClassified.indexOf(driverId);
      if (simIdx < 0) continue; // classified finisher absent from sim roster
      const simPos = simIdx + 1;
      const err = Math.abs(simPos - actualPos);
      deltas.push({ driver: driverId, actual: actualPos, sim: simPos, err });
      if (err > maxErr) maxErr = err;
    }

    // Honest reporting: dump the full comparison so the real accuracy is visible.
    const top5 = deltas.filter((d) => d.actual <= 5);
    // eslint-disable-next-line no-console
    console.log(
      `\n[Test 2] TS engine vs REAL classified finish (seed ${BAHRAIN_INPUT.seed}) — maxErr = ${maxErr}\n` +
        `top5 deltas: ${top5.map((d) => `${d.driver} P${d.actual}→sim P${d.sim} (Δ${d.err})`).join(', ')}\n` +
        deltas
          .map((d) => `  ${d.driver.padEnd(4)} actual P${String(d.actual).padStart(2)} → sim P${String(d.sim).padStart(2)}  Δ${d.err}`)
          .join('\n') +
        '\n',
    );

    // Characterization: pin the real number (NOT a relaxed gate).
    expect(maxErr).toBe(REAL_MAX_POS_ERR);
  });

  // ---------------------------------------------------------------------------
  // Test 3: DRS gain only applies when gap < threshold AND in zone
  // ---------------------------------------------------------------------------
  it('DRS gain only active when gap < threshold AND in DRS zone', () => {
    const rng = createRng(0);

    // Driver NOT in DRS zone (P1 / leading) — inDrsZone = false
    // Expect DRS delta = 0 regardless of gap
    const baseInput = {
      driverId: 'NOR',
      team: 'McLaren',
      compound: 'MEDIUM' as const,
      stintLap: 1,
      lapsSinceStart: 1,
      gapToCarAheadSec: 0.5, // within DRS threshold
      inDrsZone: false,       // NOT in zone
      isOutLap: false,
      ersState: { pool: 4 },
      ersMode: 'neutral' as ErsMode,
      trackTempC: 32,
      isWet: false,
      isSafetyCarLap: false,
      isVscLap: false,
    };

    const noDrsResult = computeLapTime(baseInput, bahrainModel, createRng(1));

    // Same driver WITH DRS zone and small gap
    const drsInput = { ...baseInput, inDrsZone: true, gapToCarAheadSec: 0.5 };
    const drsResult = computeLapTime(drsInput, bahrainModel, createRng(1));

    // DRS boost is negative (faster); if boost ≠ 0, drsResult < noDrsResult
    // Bahrain fitted drsBoost.boostSec may be 0.0 (fitted value), so we test the gate:
    const boost = bahrainModel.drsBoost.boostSec;
    if (boost !== 0) {
      // With DRS active and gap within threshold: should be faster
      expect(drsResult.lapTimeSec).toBeLessThan(noDrsResult.lapTimeSec);
    }

    // Gap ABOVE threshold — DRS should not activate even if in zone
    const bigGapInput = {
      ...baseInput,
      inDrsZone: true,
      gapToCarAheadSec: bahrainModel.drsBoost.gapThresholdSec + 0.1,
    };
    const bigGapResult = computeLapTime(bigGapInput, bahrainModel, createRng(1));
    // bigGapResult should equal noDrsResult (both have no DRS effect)
    expect(bigGapResult.lapTimeSec).toBeCloseTo(noDrsResult.lapTimeSec, 6);

    // Verify: inDrsZone=true + gap < threshold gives DRS
    // inDrsZone=false + gap < threshold → no DRS (gate is AND)
    void rng; // suppress unused warning
  });

  // ---------------------------------------------------------------------------
  // Test 4: ERS pool never goes negative
  // ---------------------------------------------------------------------------
  it('ERS pool never goes negative across a full race simulation', () => {
    const result = simulate(BAHRAIN_INPUT);

    // Check finalOrder ERS pools
    for (const driver of result.finalOrder) {
      expect(driver.ersPool).toBeGreaterThanOrEqual(0);
    }

    // Also directly test stepErs with attack mode when pool is empty
    const depleted = stepErs({ pool: 0 }, 'attack');
    expect(depleted.newPool).toBeGreaterThanOrEqual(0);
    // Empty battery + attack: available = 0 + harvest(2 MJ) = 2; deployed =
    // min(want 4, 2) = 2 = the neutral rate, so aboveNeutral = 0 → no benefit.
    // (You can only deploy what you harvest when the battery is flat.)
    expect(depleted.deltaSec).toBe(0);

    // Test that repeated attack mode can't drain below zero
    let pool = 0.5;
    for (let lap = 0; lap < 20; lap++) {
      const result2 = stepErs({ pool }, 'attack');
      expect(result2.newPool).toBeGreaterThanOrEqual(0);
      pool = result2.newPool;
    }
  });
});
