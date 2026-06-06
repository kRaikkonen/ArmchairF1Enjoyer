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
// ERS battery model (armchair, grounded in the real 2025 rules)
//
// Real F1: the Energy Store holds ~4 MJ; the MGU-K can DEPLOY up to 4 MJ/lap but
// only HARVEST ~2 MJ/lap. So deploying at full power every lap drains the
// battery in ~2 laps, after which you can only deploy what you harvest — you
// physically cannot "attack" the whole race. We model that directly:
//
//   battery (MJ) ∈ [0, 4];  each lap: +harvest − deploy, clamped.
//   mode → target deploy:  attack = full 4, neutral = 2 (= harvest, steady),
//                          save = 1 (recovers the battery).
//   lap-time delta is proportional to deploy ABOVE neutral (gain) or BELOW it
//   (small loss while saving).
//
// These are schema constants (rule-derived architecture), not lap-data fits.
// ---------------------------------------------------------------------------

/** Energy Store capacity (MJ). Real 2025 limit. */
const ERS_BATTERY_MAX_MJ = 4.0;
/** Max recovery per lap (MJ). Real 2025 limit. */
const ERS_HARVEST_PER_LAP_MJ = 2.0;
/** Target deploy per lap per mode (MJ). attack = full 4 MJ; neutral = harvest. */
const ERS_DEPLOY_MJ = { attack: 4.0, neutral: 2.0, save: 1.0 } as const;
/** Lap-time gain (s) per MJ deployed ABOVE the neutral (steady) rate. */
const ERS_BENEFIT_SEC_PER_MJ = 0.2; // full attack from a charged battery ≈ −0.4 s
/** Lap-time loss (s) per MJ deployed BELOW neutral while saving/recovering. */
const ERS_SAVE_PENALTY_SEC_PER_MJ = 0.1;

// ---------------------------------------------------------------------------
// Weather/noise schema constants
// Not fitted because we only have one (dry) race in Phase 0.
// ---------------------------------------------------------------------------

// Wet-weather penalties — armchair PLACEHOLDERS, not fitted (Phase 0 has only a
// dry race). Differential by tyre so rain is strategically meaningful: a car on
// slicks in the wet is far slower than one on intermediates, so to go fast in
// the rain you must pit for inters. Schema constants with this justification.
/** Slick tyre (S/M/H) in the wet — big loss until you pit for wets. */
const WET_SLICK_PENALTY_SEC = 15.0;
/** Intermediate/Wet tyre in the wet — small loss (the right tool). */
const WET_INTER_PENALTY_SEC = 4.0;

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
  // Energy available this lap = battery + this lap's harvest; you can't deploy
  // more than that. Attack from a full battery deploys 4 MJ; once it runs dry
  // you can only deploy what you harvest (= the neutral rate), so the benefit
  // disappears until you recover.
  const want = ERS_DEPLOY_MJ[mode];
  const available = state.pool + ERS_HARVEST_PER_LAP_MJ;
  const deployed = Math.min(want, available);
  const newPool = Math.max(0, Math.min(ERS_BATTERY_MAX_MJ, available - deployed));

  const aboveNeutral = deployed - ERS_DEPLOY_MJ.neutral;
  const deltaSec =
    aboveNeutral > 0
      ? -ERS_BENEFIT_SEC_PER_MJ * aboveNeutral
      : aboveNeutral < 0
        ? ERS_SAVE_PENALTY_SEC_PER_MJ * -aboveNeutral
        : 0; // exactly neutral → no delta (avoid -0)
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

  // 7. Weather delta. Rain is differential by tyre (slicks ≫ inters); track
  //    temperature has no fitted effect (single dry race), so it is left at 0.
  const tempDelta = (input.trackTempC - REFERENCE_TEMP_C) * TEMP_SENSITIVITY_SEC_PER_C;
  const onWetTyre = input.compound === 'INTER' || input.compound === 'WET';
  const wetDelta = input.isWet ? (onWetTyre ? WET_INTER_PENALTY_SEC : WET_SLICK_PENALTY_SEC) : 0;
  const weatherDelta = tempDelta + wetDelta;

  // 8. Seeded noise: uniform in [-amplitude, +amplitude]
  const noise = (rng() - 0.5) * 2 * NOISE_AMPLITUDE_SEC;

  const lapTimeSec = spContrib + tyreContrib + driverOffset + dirty + drs + ersDelta + weatherDelta + noise;

  return { lapTimeSec, ersResult };
}
