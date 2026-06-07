"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.choosePitCompound = choosePitCompound;
exports.decidePit = decidePit;
exports.reactiveDecidePit = reactiveDecidePit;
const events_1 = require("./events");
// ---------------------------------------------------------------------------
// Decision constants — schema / rule constants, not fitted parameters.
// ---------------------------------------------------------------------------
/**
 * Minimum laps a driver must be on a stint before the AI will pit them.
 * Prevents the AI pitting on lap 1 due to numerical noise. Schema constant.
 */
const MIN_STINT_BEFORE_PIT = 5;
/**
 * Earliest pit as a fraction of race distance. Caps the optimal-lap result so a
 * big deg asymmetry can't push the only stop absurdly early (real Bahrain first
 * stops land ~lap 12-18). Strategy schema constant, not a physics fit.
 */
const MIN_PIT_WINDOW_FRAC = 0.25;
/** Floor for deg slope when computing the optimal lap, to avoid div-by-~0 and
 * to treat a non-degrading (≤0 slope) tyre as "barely degrading" → pit late.
 * Numerical guard, not a fitted parameter. */
const DEG_EPS = 0.001;
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
function choosePitCompound(driver, model, lapsRemaining) {
    const { compound: current, team } = driver;
    if (current === 'INTER' || current === 'WET')
        return current;
    const ordered = lapsRemaining <= SOFT_SPRINT_LAPS
        ? ['SOFT', 'MEDIUM', 'HARD']
        : ['HARD', 'MEDIUM', 'SOFT'];
    // Prefer compounds with sufficient data that differ from current
    for (const c of ordered) {
        if (c === current)
            continue;
        const entry = model.tyreDeg[`${team}|${c}`];
        if (!entry || !entry.insufficient)
            return c; // no entry → fallback intercept (trackBasePace), acceptable
    }
    // All alternatives have insufficient data — accept the best available
    for (const c of ordered) {
        if (c !== current)
            return c;
    }
    return current; // should not reach here
}
/**
 * Decide whether a driver should pit this lap (single mandatory stop).
 *
 * ### Why not "pit as soon as it's worth it"
 *
 * The earlier rule pitted when `degLinear × stintLap × lapsRemaining > pitCost`.
 * That is the benefit of pitting *vs never pitting*, and it turns positive very
 * early (lapsRemaining is large at the start), so the whole field pitted around
 * lap 5 and then ran a 50-lap stint into the tyre cliff — unrealistic, and it
 * blew the gaps out to +100s+. The flaw: it ignores that the *fresh* tyre also
 * degrades across the long remaining stint.
 *
 * ### Optimal single-stop lap
 *
 * F1 mandates ≥1 stop (two compounds), so the question is *when* to take the one
 * stop, i.e. which pit lap p minimises total tyre-time over N laps with linear
 * deg degA (current compound) then degB (next compound):
 *
 *   total(p) = degA·Σ_{1..p} k + PIT + degB·Σ_{1..N-p} k
 *   d/dp = degA·p − degB·(N−p) = 0  →  p* = degB·N / (degA + degB)
 *
 * Equal deg → p*≈N/2; a faster-degrading start tyre → earlier; a worse target
 * tyre → later. We pit when the race reaches p* (clamped to a realistic window),
 * or immediately if the current tyre has gone past its cliff.
 *
 * @param driver        Current driver state
 * @param model         Track model (for tyre deg parameters)
 * @param lapsRemaining Laps left in the race (including current lap)
 */
function decidePit(driver, model, lapsRemaining) {
    var _a;
    const noChange = { shouldPit: false, targetCompound: driver.compound };
    // Don't pit if retired, or too early in the stint
    if (driver.isRetired)
        return noChange;
    if (driver.stintLap < MIN_STINT_BEFORE_PIT)
        return noChange;
    // Maximum 1 pit stop: once already stopped, the AI does not trigger a second.
    // Real Bahrain strategies are predominantly 1-stop. Schema constant.
    if (driver.pitCount >= 1)
        return noChange;
    // Hard rule: force pit if deadline approaching and never stopped.
    if (lapsRemaining <= MANDATORY_PIT_LAP_BUFFER) {
        return { shouldPit: true, targetCompound: choosePitCompound(driver, model, lapsRemaining) };
    }
    const entryA = model.tyreDeg[`${driver.team}|${driver.compound}`];
    if (!entryA)
        return noChange; // can't reason about deg → wait for the deadline
    // Tyres past the cliff are falling off rapidly — take the stop now.
    if (driver.stintLap > entryA.cliffStart) {
        return { shouldPit: true, targetCompound: choosePitCompound(driver, model, lapsRemaining) };
    }
    // Optimal single-stop lap p* (see JSDoc). N reconstructed from progress.
    const target = choosePitCompound(driver, model, lapsRemaining);
    const entryB = model.tyreDeg[`${driver.team}|${target}`];
    const degA = Math.max(entryA.degLinear, DEG_EPS);
    const degB = Math.max((_a = entryB === null || entryB === void 0 ? void 0 : entryB.degLinear) !== null && _a !== void 0 ? _a : entryA.degLinear, DEG_EPS);
    const totalLaps = lapsRemaining + driver.lapsSinceStart;
    const pStarRaw = (degB * totalLaps) / (degA + degB);
    const pStar = Math.min(totalLaps - MANDATORY_PIT_LAP_BUFFER, Math.max(Math.round(totalLaps * MIN_PIT_WINDOW_FRAC), Math.round(pStarRaw)));
    // driver.lapsSinceStart laps are done; the lap about to run is +1.
    if (driver.lapsSinceStart + 1 >= pStar) {
        return { shouldPit: true, targetCompound: target };
    }
    return noChange;
}
// ---------------------------------------------------------------------------
// Reactive AI — rivals respond to the player's What-If instead of running a
// frozen replay. Each rival has a PLANNED strategy (their real pit stops) but
// will deviate to cover an undercut, take a cheap Safety-Car stop, or switch to
// wets. Only used in "对手博弈" mode; default off keeps exact reproduction.
// ---------------------------------------------------------------------------
/** A car within this gap (s) behind that just pitted onto fresher rubber is an
 * undercut threat the car ahead will cover. Strategy schema constant. */
const UNDERCUT_COVER_GAP_SEC = 3.0;
/** A driver will only cover (pit early to defend) within this many laps of their
 * own planned stop — stops a normal pit window from triggering a runaway wave
 * that pulls the whole field way too early. Strategy schema constant. */
const REACTIVE_COVER_MAX_EARLY_LAPS = 6;
function isSlick(c) {
    return c !== 'INTER' && c !== 'WET';
}
/**
 * Decide a rival's pit this lap given their planned (real) strategy + reactions.
 * plannedPits = the rival's real stops in order; driver.pitCount picks the next.
 */
function reactiveDecidePit(driver, model, lapsRemaining, plannedPits, ctx) {
    var _a;
    const noChange = { shouldPit: false, targetCompound: driver.compound };
    if (driver.isRetired)
        return noChange;
    // Rain: get off slicks onto intermediates (one-time switch).
    if (ctx.isWet && isSlick(driver.compound)) {
        return { shouldPit: true, targetCompound: 'INTER' };
    }
    if (driver.stintLap < MIN_STINT_BEFORE_PIT)
        return noChange;
    const nextPit = plannedPits[driver.pitCount]; // next planned stop (undefined = none left)
    const owesMandatory = driver.pitCount === 0; // must change compounds at least once
    const stopCompound = (_a = nextPit === null || nextPit === void 0 ? void 0 : nextPit.compound) !== null && _a !== void 0 ? _a : choosePitCompound(driver, model, lapsRemaining);
    // Safety Car / VSC opportunism: take a planned or mandatory stop now — it's cheap.
    if ((ctx.safetyCarActive || ctx.vscActive) && (nextPit || owesMandatory)) {
        return { shouldPit: true, targetCompound: stopCompound };
    }
    // Undercut cover: a car behind that pitted last lap is now on fresher tyres
    // and ~20s back from its own stop, but was within striking distance before —
    // so the window includes the pit-loss. Box to defend (only with a stop in hand,
    // and only when already near your own stop, so it doesn't cascade the field).
    if (nextPit && driver.lapsSinceStart + 1 >= nextPit.lap - REACTIVE_COVER_MAX_EARLY_LAPS) {
        const coverWindow = UNDERCUT_COVER_GAP_SEC + events_1.PIT_STOP_TIME_SEC; // ~23s incl. pit drop
        const threat = ctx.field.find((d) => d.position > driver.position && // behind me
            ctx.pittedLastLap.has(d.driverId) && // just pitted → fresh
            d.stintLap < driver.stintLap && // genuinely fresher than me
            d.totalTimeSec - driver.totalTimeSec < coverWindow);
        if (threat)
            return { shouldPit: true, targetCompound: nextPit.compound };
    }
    // Otherwise execute the planned stop at its lap.
    if (nextPit && driver.lapsSinceStart + 1 >= nextPit.lap) {
        return { shouldPit: true, targetCompound: nextPit.compound };
    }
    // Mandatory fallback near the end.
    if (lapsRemaining <= MANDATORY_PIT_LAP_BUFFER && owesMandatory) {
        return { shouldPit: true, targetCompound: stopCompound };
    }
    return noChange;
}
