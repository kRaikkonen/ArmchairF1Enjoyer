/**
 * Simplified pit-decision AI.
 *
 * The AI answers one question per driver per lap:
 *   "Is it worth pitting now?"
 *
 * Decision logic (full remaining-race cost comparison):
 *   Compare the total accumulated degradation cost of staying out
 *   vs. paying the one-time pit cost + fresh-tyre degradation for
 *   the rest of the race.
 *
 *   From the linear tyre model, the net benefit of pitting now simplifies to:
 *
 *     pitBenefit = degLinear × stintLap × lapsRemaining - PIT_STOP_TIME_SEC
 *
 *   If pitBenefit > 0, pitting now saves time overall.
 *   (Derivation in JSDoc below.)
 *
 * Hard rule: must pit at least once (F1 regulations require ≥1 compound change).
 * Soft rule: AI limits itself to 1 pit maximum (typical Bahrain strategy).
 *
 * All numeric thresholds here are schema constants (decision-rule parameters,
 * not physics fits) — each is annotated with a justification.
 */

import type { DriverState, TrackModel, Compound } from './types';
import { PIT_STOP_TIME_SEC } from './events';

// ---------------------------------------------------------------------------
// Decision constants — schema / rule constants, not fitted parameters.
// ---------------------------------------------------------------------------

/**
 * Minimum laps a driver must be on a stint before the AI will pit them.
 * Prevents the AI pitting on lap 1 due to numerical noise. Schema constant.
 */
const MIN_STINT_BEFORE_PIT = 5;

/**
 * With this many laps remaining the AI forces a mandatory pit if
 * the driver has not yet stopped (F1 minimum 2-compound rule).
 * 4 laps gives enough time to run to the end on the new compound.
 * Schema constant (sporting regulation inspired).
 */
const MANDATORY_PIT_LAP_BUFFER = 4;

/**
 * Remaining laps below which SOFT is preferred for the final sprint.
 * Schema constant: 18 laps ≈ typical SOFT durability at Bahrain.
 */
const SOFT_SPRINT_LAPS = 18;

// ---------------------------------------------------------------------------
// Compound selection heuristic
// ---------------------------------------------------------------------------

/**
 * Return the best compound to pit onto, given the team's tyre model data.
 *
 * Compound priority for long remaining stints (> SOFT_SPRINT_LAPS):
 *   HARD  (durable) → MEDIUM → SOFT
 * For short final stints (≤ SOFT_SPRINT_LAPS):
 *   SOFT (fast) → MEDIUM → HARD
 *
 * We skip a compound if its model data is insufficient (unreliable fit)
 * AND a sufficient alternative exists.  If the only candidates have
 * insufficient data or no data, we accept a fallback — lapTime.ts will
 * use trackBasePace as the intercept, which is a reasonable estimate.
 *
 * Wet compounds (INTER/WET) are returned unchanged — no dry tyre choice.
 */
export function choosePitCompound(
  driver: DriverState,
  model: TrackModel,
  lapsRemaining: number,
): Compound {
  const { compound: current, team } = driver;
  if (current === 'INTER' || current === 'WET') return current;

  const ordered: Compound[] =
    lapsRemaining <= SOFT_SPRINT_LAPS
      ? ['SOFT', 'MEDIUM', 'HARD']
      : ['HARD', 'MEDIUM', 'SOFT'];

  // Prefer compounds with sufficient data that differ from current
  for (const c of ordered) {
    if (c === current) continue;
    const entry = model.tyreDeg[`${team}|${c}`];
    if (!entry || !entry.insufficient) return c; // no entry → fallback intercept (trackBasePace), acceptable
  }

  // All alternatives have insufficient data — accept the best available
  for (const c of ordered) {
    if (c !== current) return c;
  }

  return current; // should not reach here
}

// ---------------------------------------------------------------------------
// Main decision function
// ---------------------------------------------------------------------------

export interface PitDecision {
  shouldPit: boolean;
  /** Only meaningful when shouldPit = true */
  targetCompound: Compound;
}

/**
 * Decide whether a driver should pit this lap.
 *
 * ### Derivation of pit-benefit formula
 *
 * Lap time at stintLap k: T(k) = intercept + degLinear × k + commonTerms
 * (commonTerms = spContrib + driverOffset + noise — identical whether we pit or not)
 *
 * Cost of staying out for L more laps, starting at stintLap s:
 *   ΣC_stay = Σ(k=s..s+L-1) degLinear×k
 *           = degLinear × (s×L + L×(L-1)/2)
 *
 * Cost of pitting (1 lap lost) + fresh tyres for L-1 more laps:
 *   ΣC_pit = PIT_STOP_TIME + Σ(k=1..L-1) degLinear×k
 *          = PIT_STOP_TIME + degLinear × (L-1)×L/2
 *
 * Net benefit of pitting = ΣC_stay − ΣC_pit
 *   = degLinear × s × L − PIT_STOP_TIME
 *
 * → Pit if: degLinear × stintLap × lapsRemaining > PIT_STOP_TIME
 *
 * @param driver       Current driver state
 * @param model        Track model (for tyre deg parameters)
 * @param lapsRemaining Laps left in the race (including current lap)
 */
export function decidePit(
  driver: DriverState,
  model: TrackModel,
  lapsRemaining: number,
): PitDecision {
  const noChange = { shouldPit: false, targetCompound: driver.compound };

  // Don't pit if retired, or too early in the stint
  if (driver.isRetired) return noChange;
  if (driver.stintLap < MIN_STINT_BEFORE_PIT) return noChange;

  // Maximum 1 pit stop: once already stopped, the AI does not trigger a second.
  // Real Bahrain strategies are predominantly 1-stop. Schema constant.
  if (driver.pitCount >= 1) return noChange;

  // Hard rule: force pit if deadline approaching and never stopped
  if (lapsRemaining <= MANDATORY_PIT_LAP_BUFFER) {
    return {
      shouldPit: true,
      targetCompound: choosePitCompound(driver, model, lapsRemaining),
    };
  }

  // Fetch tyre deg parameters
  const key = `${driver.team}|${driver.compound}`;
  const entry = model.tyreDeg[key];
  if (!entry) return noChange;

  // Apply pit-benefit formula (see derivation in JSDoc above)
  // Extra cliff cost: if we're past the cliff, include extra deg per remaining lap
  let effectiveDegLinear = entry.degLinear;
  if (driver.stintLap > entry.cliffStart) {
    effectiveDegLinear += entry.cliffSlope;
  }

  const pitBenefit = effectiveDegLinear * driver.stintLap * lapsRemaining - PIT_STOP_TIME_SEC;

  if (pitBenefit > 0) {
    return {
      shouldPit: true,
      targetCompound: choosePitCompound(driver, model, lapsRemaining),
    };
  }

  return noChange;
}
