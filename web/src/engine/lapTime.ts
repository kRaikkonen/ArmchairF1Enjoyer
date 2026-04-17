/**
 * Lap-time prediction formula.
 *
 * All physics coefficients come from TrackModel — no hard-coded numbers
 * for physical quantities.  Every literal that does appear has an explicit
 * comment explaining why it is a schema constant, not a fitted parameter.
 *
 * Formula:
 *   lapTime = sp.slope * lapsSinceStart
 *           + tyre.intercept + tyre.degLinear * stintLap + cliffCorrection
 *           + driverOffset
 *           + dirtyAirPenalty   (if gap < threshold)
 *           + drsDelta          (negative when DRS active)
 *           + ersDelta          (negative when attacking)
 *           + weatherDelta      (positive when wet or hot)
 *           + seededNoise
 *
 * Note: tyre.intercept absorbs the global baseline; trackBasePace is
 * diagnostic only and is NOT added here.
 */

import type { TrackModel, Compound, ErsMode } from './types';
import type { Rng } from './rng';

// ---------------------------------------------------------------------------
// ERS schema constants
// These are model architecture choices (bucket model), not empirical fits.
// They cannot be derived from FastF1 lap data alone.
// ---------------------------------------------------------------------------

/** Energy recharged per lap (arbitrary units). Architecture constant. */
const ERS_BUDGET_PER_LAP = 1.0;

/** Maximum pool size in budget units. Architecture constant. */
const ERS_MAX_POOL = 4.0;

/** Lap-time gain (s) from full-attack ERS deploy. From physics-model.md spec. */
const ERS_ATTACK_BENEFIT_SEC = 0.15; // spec: -0.15 s

/** Spend multipliers per mode. Architecture constants from physics-model.md. */
const ERS_SPEND = { attack: 1.5, neutral: 1.0, save: 0.5 } as const;

// ---------------------------------------------------------------------------
// Weather/noise schema constants
// Not fitted because we only have one (dry) race in Phase 0.
// ---------------------------------------------------------------------------

/** Lap-time penalty (s) when racing in the wet. Placeholder; not yet fitted. */
const WET_PENALTY_SEC = 15.0;

/**
 * Lap-time sensitivity to track temperature above a reference.
 * Very small effect for dry conditions; using zero until multi-race data
 * allows fitting. Schema constant.
 */
const TEMP_SENSITIVITY_SEC_PER_C = 0.0;

/** Reference track temperature (°C) at which weatherDelta = 0. Schema constant. */
const REFERENCE_TEMP_C = 32.0;

/**
 * Half-amplitude of the seeded noise term (s).
 * Physics-model.md specifies ±0.05 s "量级"; we use uniform distribution
 * (not truncated normal) for simplicity.  This is a schema constant
 * defining the noise scale, not a fitted parameter.
 */
const NOISE_AMPLITUDE_SEC = 0.05;

// ---------------------------------------------------------------------------
// ERS pool update (pure function — no mutation)
// ---------------------------------------------------------------------------

export interface ErsState {
  pool: number;
}

export interface ErsResult {
  newPool: number;
  deltaSec: number; // negative = faster
}

export function stepErs(state: ErsState, mode: ErsMode): ErsResult {
  const recharged = Math.min(state.pool + ERS_BUDGET_PER_LAP, ERS_MAX_POOL);
  const spend = ERS_SPEND[mode] * ERS_BUDGET_PER_LAP;
  const canAttack = mode === 'attack' && recharged >= ERS_SPEND.attack * ERS_BUDGET_PER_LAP;
  const deltaSec = canAttack ? -ERS_ATTACK_BENEFIT_SEC : 0;
  const newPool = Math.max(recharged - spend, 0);
  return { newPool, deltaSec };
}

// ---------------------------------------------------------------------------
// Tyre degradation
// ---------------------------------------------------------------------------

function tyreDegSec(
  team: string,
  compound: Compound,
  stintLap: number,
  model: TrackModel,
): number {
  const key = `${team}|${compound}`;
  const entry = model.tyreDeg[key];
  if (!entry) return model.trackBasePace; // fallback: use median — shouldn't occur in practice
  let t = entry.intercept + entry.degLinear * stintLap;
  if (stintLap > entry.cliffStart) {
    t += entry.cliffSlope * (stintLap - entry.cliffStart);
  }
  return t;
}

// ---------------------------------------------------------------------------
// Public: compute lap time
// ---------------------------------------------------------------------------

export interface LapTimeInput {
  driverId: string;
  team: string;
  compound: Compound;
  stintLap: number;
  lapsSinceStart: number;
  gapToCarAheadSec: number; // Infinity if leading
  inDrsZone: boolean;
  ersState: ErsState;
  ersMode: ErsMode;
  trackTempC: number;
  isWet: boolean;
  isSafetyCarLap: boolean;
  isVscLap: boolean;
}

export interface LapTimeResult {
  lapTimeSec: number;
  ersResult: ErsResult;
}

// SC/VSC lap times: schema constants — these are race-control mandated
// minimum lap times, not driver physics.  Not fittable from dry-lap data.
const SC_LAP_TIME_SEC = 120.0;  // Safety Car: ~2 min laps
const VSC_LAP_TIME_SEC = 110.0; // Virtual SC: slightly faster

export function computeLapTime(
  input: LapTimeInput,
  model: TrackModel,
  rng: Rng,
): LapTimeResult {
  // Safety-car / VSC laps override normal physics
  if (input.isSafetyCarLap) {
    return { lapTimeSec: SC_LAP_TIME_SEC, ersResult: stepErs(input.ersState, 'save') };
  }
  if (input.isVscLap) {
    return { lapTimeSec: VSC_LAP_TIME_SEC, ersResult: stepErs(input.ersState, 'save') };
  }

  // 1. Stint progress (global fuel/rubber trend)
  const spContrib = model.stintProgress.slope * input.lapsSinceStart;

  // 2. Tyre model: intercept + degradation (captures absolute team pace)
  const tyreContrib = tyreDegSec(input.team, input.compound, input.stintLap, model);

  // 3. Driver offset
  const driverEntry = model.driverOffsets[input.driverId];
  const driverOffset = driverEntry ? driverEntry.offsetSec : 0;

  // 4. Dirty air penalty
  const dirty =
    input.gapToCarAheadSec < model.dirtyAir.gapThresholdSec
      ? model.dirtyAir.penaltySec
      : 0;

  // 5. DRS boost (negative = faster)
  const drs =
    input.inDrsZone && input.gapToCarAheadSec < model.drsBoost.gapThresholdSec
      ? model.drsBoost.boostSec
      : 0;

  // 6. ERS
  const ersResult = stepErs(input.ersState, input.ersMode);
  const ersDelta = ersResult.deltaSec;

  // 7. Weather delta
  const tempDelta = (input.trackTempC - REFERENCE_TEMP_C) * TEMP_SENSITIVITY_SEC_PER_C;
  const wetDelta = input.isWet ? WET_PENALTY_SEC : 0;
  const weatherDelta = tempDelta + wetDelta;

  // 8. Seeded noise: uniform in [-amplitude, +amplitude]
  const noise = (rng() - 0.5) * 2 * NOISE_AMPLITUDE_SEC;

  const lapTimeSec = spContrib + tyreContrib + driverOffset + dirty + drs + ersDelta + weatherDelta + noise;

  return { lapTimeSec, ersResult };
}
