"use strict";
/**
 * Full race simulation — lap-by-lap loop.
 *
 * Architecture:
 *   1. Apply user-injected events for this lap (SC/VSC flags, pits, penalties).
 *   2. Run AI pit decisions for any driver without a user event this lap.
 *   3. Compute each driver's lap time via computeLapTime.
 *   4. Update positions (sort by totalTimeSec).
 *   5. Record LapSnapshot for UI.
 *   Repeat until totalLaps reached or all drivers retired.
 *
 * Engine-purity rules enforced:
 *   - No Math.random() — all randomness via seeded Rng
 *   - No Date.now() / performance.now()
 *   - No DOM / React imports
 *   - All physics from TrackModel
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.simulate = simulate;
const lapTime_1 = require("./lapTime");
const events_1 = require("./events");
const ai_1 = require("./ai");
const rng_1 = require("./rng");
// ---------------------------------------------------------------------------
// Safety-car field dynamics — race-control schema constants, not physics fits.
// ---------------------------------------------------------------------------
/**
 * Bunched spacing between consecutive cars when the field lines up behind the
 * Safety Car (s). At the restart we collapse all gaps to this value, modelling
 * the field closing right up — a car that was 20 s back is now nose-to-tail.
 * Schema constant (race-control behaviour), not a fitted parameter.
 */
const SC_BUNCH_GAP_SEC = 1.0;
/**
 * Pit-loss multiplier while the Safety Car is out. The pit-lane delta costs far
 * less relative to a field running at SC pace, so stopping under SC is "cheap".
 * Schema constant, not a fitted parameter.
 */
const SC_PIT_LOSS_FACTOR = 0.5;
/**
 * Re-space the field behind the Safety Car: cars on the SAME lap bunch up to
 * SC_BUNCH_GAP_SEC, but lapped cars stay a lap (or more) down — they do NOT get
 * gifted onto the lead lap. Retired cars stay at the back.
 */
function bunchFieldBehindSC(drivers, lapRefSec) {
    var _a, _b;
    const active = drivers.filter((d) => !d.isRetired).sort((a, b) => a.totalTimeSec - b.totalTimeSec);
    const retired = drivers.filter((d) => d.isRetired);
    const leaderTime = (_b = (_a = active[0]) === null || _a === void 0 ? void 0 : _a.totalTimeSec) !== null && _b !== void 0 ? _b : 0;
    const groupCount = {};
    const bunched = active.map((d) => {
        var _a;
        const lapsDown = Math.max(0, Math.floor((d.totalTimeSec - leaderTime) / lapRefSec));
        const idx = (_a = groupCount[lapsDown]) !== null && _a !== void 0 ? _a : 0;
        groupCount[lapsDown] = idx + 1;
        return { ...d, totalTimeSec: leaderTime + lapsDown * lapRefSec + idx * SC_BUNCH_GAP_SEC };
    });
    return [...bunched, ...retired];
}
// ---------------------------------------------------------------------------
// DRS zone heuristic
// Schema constant: in a simplified model we assume any driver within the DRS
// gap threshold and within the top-N (not leading) is in a DRS zone.
// Actual DRS zones vary by track; this is a per-lap approximation.
// ---------------------------------------------------------------------------
/** Assume all non-leading drivers are potentially in a DRS zone. Schema constant. */
function isInDrsZone(_position) {
    // Simplified: the DRS zone heuristic defers the actual gap check to
    // computeLapTime (model.drsBoost.gapThresholdSec).  We always pass true
    // here (every driver except P1 might be in a DRS zone on some part of
    // the track), and let the gap threshold be the real gate.
    return _position > 1;
}
// ---------------------------------------------------------------------------
// Position re-sort
// ---------------------------------------------------------------------------
function recomputePositions(drivers) {
    const active = drivers.filter((d) => !d.isRetired);
    const retired = drivers.filter((d) => d.isRetired);
    // Sort by total accumulated time (lower = ahead)
    const sorted = [...active].sort((a, b) => a.totalTimeSec - b.totalTimeSec);
    const withPositions = sorted.map((d, i) => ({ ...d, position: i + 1 }));
    // Update gap fields
    const withGaps = withPositions.map((d, i) => {
        const leader = withPositions[0];
        const ahead = i > 0 ? withPositions[i - 1] : null;
        return {
            ...d,
            gapToLeaderSec: d.totalTimeSec - leader.totalTimeSec,
            gapToCarAheadSec: ahead ? d.totalTimeSec - ahead.totalTimeSec : Infinity,
        };
    });
    // Retired drivers go to the back
    const retiredWithPos = retired.map((d, i) => ({
        ...d,
        position: withGaps.length + 1 + i,
    }));
    return [...withGaps, ...retiredWithPos];
}
// ---------------------------------------------------------------------------
// Snapshot builder
// ---------------------------------------------------------------------------
function buildSnapshot(driver, lap, lapTimeSec, isInPit) {
    return {
        driverId: driver.driverId,
        lap,
        lapTimeSec,
        position: driver.position,
        compound: driver.compound,
        stintLap: driver.stintLap,
        gapToLeaderSec: driver.gapToLeaderSec,
        isInPit,
        ersPool: driver.ersPool,
    };
}
// ---------------------------------------------------------------------------
// Main simulation entry point
// ---------------------------------------------------------------------------
function simulate(input) {
    var _a, _b, _c;
    const { trackModel, totalLaps, events, seed } = input;
    // Initialise race state
    let raceState = {
        lap: 1,
        totalLaps,
        safetyCarActive: false,
        virtualSafetyCarActive: false,
        weatherIsWet: (_a = input.weatherIsWet) !== null && _a !== void 0 ? _a : false,
        trackTempC: (_b = input.trackTempC) !== null && _b !== void 0 ? _b : 32,
        drivers: input.initialDrivers.map((d) => ({ ...d })),
    };
    const lapHistory = [];
    // Drivers whose pit strategy the user has dictated (any 'pit' event). The AI
    // must not auto-pit these — the user controls their stops, so an AI stop on
    // top would be an unwanted second pit.
    const userControlledPitIds = new Set(events
        .filter((e) => e.type === 'pit' && e.driverId !== undefined)
        .map((e) => e.driverId));
    // Laps on which the field bunches up behind the SC (the last lap of each SC
    // period — the restart). Computed from the SC events' duration.
    const scRestartLaps = new Set();
    for (const e of events) {
        if (e.type === 'safety_car') {
            scRestartLaps.add(e.lap + ((_c = e.duration) !== null && _c !== void 0 ? _c : events_1.DEFAULT_SC_DURATION_LAPS) - 1);
        }
    }
    const reactiveStrategies = input.reactiveStrategies;
    let pittedLastLap = new Set(); // for the reactive undercut-cover trigger
    for (let lap = 1; lap <= totalLaps; lap++) {
        raceState = { ...raceState, lap };
        // 1. Apply user events for this lap (SC/VSC/rain/penalty/user-pit)
        const eventResult = (0, events_1.applyEventsForLap)(raceState, events);
        const userPittedIds = new Set(events
            .filter((e) => e.lap === lap && e.type === 'pit')
            .map((e) => e.driverId)
            .filter((id) => id !== undefined));
        let drivers = eventResult.updatedDrivers;
        // Update race-level flags from event application
        raceState = {
            ...raceState,
            ...eventResult.newRaceState,
            drivers,
        };
        // 2. AI pit decisions (only for drivers NOT covered by user events)
        const aiExtraTime = {};
        const fieldSnapshot = drivers; // positions from last lap — for reactive context
        const ctx = {
            field: fieldSnapshot,
            pittedLastLap,
            safetyCarActive: raceState.safetyCarActive,
            vscActive: raceState.virtualSafetyCarActive,
            isWet: raceState.weatherIsWet,
        };
        drivers = drivers.map((driver) => {
            if (driver.isRetired)
                return driver;
            if (userPittedIds.has(driver.driverId))
                return driver;
            if (userControlledPitIds.has(driver.driverId))
                return driver; // user dictates this driver's pits
            const lapsRemaining = totalLaps - lap + 1;
            // "对手博弈" mode: drivers with a planned strategy run the reactive AI.
            const planned = reactiveStrategies === null || reactiveStrategies === void 0 ? void 0 : reactiveStrategies[driver.driverId];
            const decision = planned
                ? (0, ai_1.reactiveDecidePit)(driver, trackModel, lapsRemaining, planned, ctx)
                : (0, ai_1.decidePit)(driver, trackModel, lapsRemaining);
            if (decision.shouldPit) {
                const { newState, extraTimeSec } = (0, events_1.applyPit)(driver, decision.targetCompound);
                aiExtraTime[driver.driverId] = extraTimeSec;
                return newState;
            }
            return driver;
        });
        // 3. Compute lap times
        const lapSnapshots = [];
        drivers = drivers.map((driver) => {
            var _a, _b;
            if (driver.isRetired) {
                lapSnapshots.push(buildSnapshot(driver, lap, 0, false));
                return driver;
            }
            const isPitting = userPittedIds.has(driver.driverId) || driver.driverId in aiExtraTime;
            // Per-driver seeded RNG
            const childSeed = (0, rng_1.deriveSeed)(seed, driver.driverId, lap);
            const rng = (0, rng_1.createRng)(childSeed);
            const result = (0, lapTime_1.computeLapTime)({
                driverId: driver.driverId,
                team: driver.team,
                compound: driver.compound,
                stintLap: driver.stintLap,
                lapsSinceStart: driver.lapsSinceStart + 1,
                gapToCarAheadSec: driver.gapToCarAheadSec,
                inDrsZone: isInDrsZone(driver.position),
                isOutLap: driver.stintLap === 1, // first lap of a stint = cold tyres
                ersState: { pool: driver.ersPool },
                ersMode: driver.ersMode,
                trackTempC: raceState.trackTempC,
                isWet: raceState.weatherIsWet,
                isSafetyCarLap: raceState.safetyCarActive,
                isVscLap: raceState.virtualSafetyCarActive,
            }, trackModel, rng);
            // Pitting under the Safety Car is cheap (field is slow → pit-lane delta
            // costs less).
            const scActive = raceState.safetyCarActive;
            const pitExtra = (((_a = eventResult.extraTimeBySec[driver.driverId]) !== null && _a !== void 0 ? _a : 0) +
                ((_b = aiExtraTime[driver.driverId]) !== null && _b !== void 0 ? _b : 0)) *
                (scActive ? SC_PIT_LOSS_FACTOR : 1);
            const lapTimeSec = result.lapTimeSec + pitExtra;
            const updatedDriver = {
                ...driver,
                lapsSinceStart: driver.lapsSinceStart + 1,
                stintLap: driver.stintLap + 1,
                totalTimeSec: driver.totalTimeSec + lapTimeSec,
                ersPool: result.ersResult.newPool,
            };
            lapSnapshots.push(buildSnapshot(updatedDriver, lap, lapTimeSec, isPitting));
            return updatedDriver;
        });
        // 4. Re-sort positions
        drivers = recomputePositions(drivers);
        // 4b. On the SC restart lap, bunch the field up behind the Safety Car.
        if (scRestartLaps.has(lap)) {
            drivers = recomputePositions(bunchFieldBehindSC(drivers, trackModel.trackBasePace || 96));
        }
        // 5. Store snapshots with updated positions + gaps (reflect this lap's
        //    re-sort and any SC bunching).
        const snapshotsWithPositions = lapSnapshots.map((s) => {
            const d = drivers.find((dr) => dr.driverId === s.driverId);
            return d ? { ...s, position: d.position, gapToLeaderSec: d.gapToLeaderSec } : s;
        });
        lapHistory.push(snapshotsWithPositions.sort((a, b) => a.position - b.position));
        raceState = { ...raceState, drivers };
        // Who pitted this lap (user + AI/reactive) → fresh tyres for the reactive
        // undercut-cover trigger next lap.
        pittedLastLap = new Set([...userPittedIds, ...Object.keys(aiExtraTime)]);
    }
    return {
        lapHistory,
        finalOrder: recomputePositions(raceState.drivers),
    };
}
