"use strict";
/**
 * Event application logic — pure functions, no mutation of the original state.
 *
 * Events are injected by the user (What-If scenarios) or by the simulation
 * itself (e.g. auto pit via AI).  All handlers return a new DriverState object.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SC_DURATION_LAPS = exports.PIT_STOP_TIME_SEC = exports.DEFAULT_PIT_STATIONARY_SEC = exports.PIT_LANE_OUT_SEC = exports.PIT_LANE_IN_SEC = void 0;
exports.eventAppliesTo = eventAppliesTo;
exports.applyPit = applyPit;
exports.applyPenalty = applyPenalty;
exports.applyErsMode = applyErsMode;
exports.applyEventsForLap = applyEventsForLap;
// ---------------------------------------------------------------------------
// Pit stop time schema constants.
// These are race-control / sporting-regulation constants, not physics fits.
// Typical F1 stationary time is ~2.2–2.8 s; we use 2.5 s as a round midpoint.
// Pit-lane delta (entry + exit) is track-specific; 18 s is Bahrain's
// published value and a reasonable cross-track default.
// ---------------------------------------------------------------------------
// A pit stop's lap-time cost = pit-in + stationary + pit-out.
//   pit-in / pit-out  : generic per-track estimates (entry/exit vs racing line)
//   stationary        : the tyre change itself — customisable (slow/botched stop)
// Schema constants (race-control / pit-lane geometry), not physics fits.
/** Generic pit-entry estimate (s): racing line → pit box. */
exports.PIT_LANE_IN_SEC = 9.5;
/** Generic pit-exit estimate (s): pit box → racing line. */
exports.PIT_LANE_OUT_SEC = 8.5;
/** Default stationary tyre-change time (s) — the customisable part. */
exports.DEFAULT_PIT_STATIONARY_SEC = 2.5;
/** Total default pit-stop time (s) = in + default stationary + out. */
exports.PIT_STOP_TIME_SEC = exports.PIT_LANE_IN_SEC + exports.DEFAULT_PIT_STATIONARY_SEC + exports.PIT_LANE_OUT_SEC;
// ---------------------------------------------------------------------------
// SC / VSC duration defaults — schema constants.
// Typical SC duration per F1 sporting regulations.
// ---------------------------------------------------------------------------
/** Default SC duration in laps if event.duration is not specified. */
exports.DEFAULT_SC_DURATION_LAPS = 3;
/** Default VSC duration in laps if event.duration is not specified. */
const DEFAULT_VSC_DURATION_LAPS = 2;
// ---------------------------------------------------------------------------
// Event resolution helpers
// ---------------------------------------------------------------------------
/**
 * Return true if the event affects the given driver on the given lap.
 */
function eventAppliesTo(event, driverId, lap) {
    if (event.lap !== lap)
        return false;
    if (event.driverId !== undefined && event.driverId !== driverId)
        return false;
    return true;
}
// ---------------------------------------------------------------------------
// Per-event application (returns updated copies — no mutation)
// ---------------------------------------------------------------------------
/**
 * Apply a pit stop to a driver.
 * Resets stintLap to 1, changes compound, increments pitCount.
 * The extra pit-stop time is returned separately so the caller can add it
 * to lapTimeSec; the state itself does not store per-lap time.
 */
function applyPit(driver, newCompound, stationarySec = exports.DEFAULT_PIT_STATIONARY_SEC) {
    // in + (customisable) stationary + out
    const extraTimeSec = exports.PIT_LANE_IN_SEC + stationarySec + exports.PIT_LANE_OUT_SEC;
    return {
        newState: {
            ...driver,
            compound: newCompound,
            stintLap: 1,
            pitCount: driver.pitCount + 1,
        },
        extraTimeSec,
    };
}
/**
 * Apply a time penalty (drive-through equivalent: add seconds to total time).
 */
function applyPenalty(driver, penaltySec) {
    return {
        ...driver,
        totalTimeSec: driver.totalTimeSec + penaltySec,
    };
}
/**
 * Apply an ERS mode change.
 */
function applyErsMode(driver, event) {
    if (!event.ersMode)
        return driver;
    return { ...driver, ersMode: event.ersMode };
}
/**
 * Process all events scheduled for `lap` and return updated state.
 *
 * Called once per lap, before lap-time computation, so that SC/VSC flags
 * are already in place when computeLapTime runs.
 */
function applyEventsForLap(raceState, events) {
    var _a;
    const lapEvents = events.filter((e) => e.lap === raceState.lap);
    const trackTempC = raceState.trackTempC;
    // Weather persists; a rain event on this lap toggles it (supports multiple
    // rain on/off changes across the race).
    let weatherIsWet = raceState.weatherIsWet;
    for (const event of lapEvents) {
        if (event.type === 'rain' && event.isWet !== undefined)
            weatherIsWet = event.isWet;
    }
    // SC/VSC active iff some period covers this lap. Recomputed from scratch each
    // lap (not carried forward), so multiple — even overlapping — SC/VSC periods
    // all work. A period of length d covers laps [lap, lap + d - 1].
    let safetyCarActive = false;
    let virtualSafetyCarActive = false;
    for (const event of events) {
        if (event.driverId !== undefined)
            continue;
        if (event.type !== 'safety_car' && event.type !== 'vsc')
            continue;
        const dur = (_a = event.duration) !== null && _a !== void 0 ? _a : (event.type === 'safety_car' ? exports.DEFAULT_SC_DURATION_LAPS : DEFAULT_VSC_DURATION_LAPS);
        if (raceState.lap >= event.lap && raceState.lap < event.lap + dur) {
            if (event.type === 'safety_car')
                safetyCarActive = true;
            else
                virtualSafetyCarActive = true;
        }
    }
    if (safetyCarActive)
        virtualSafetyCarActive = false; // full SC supersedes VSC
    // Process per-driver events
    const extraTimeBySec = {};
    const updatedDrivers = raceState.drivers.map((driver) => {
        var _a, _b;
        let d = driver;
        let pittedThisLap = false;
        for (const event of lapEvents) {
            if (!eventAppliesTo(event, d.driverId, raceState.lap))
                continue;
            if (event.type === 'pit') {
                // A driver can only stop once per lap — ignore duplicate pit events so a
                // malformed input can't double-charge the pit loss and pitCount.
                if (pittedThisLap)
                    continue;
                const compound = (_a = event.compound) !== null && _a !== void 0 ? _a : d.nextCompound;
                const { newState, extraTimeSec } = applyPit(d, compound, event.pitStationarySec);
                d = newState;
                pittedThisLap = true;
                extraTimeBySec[d.driverId] = ((_b = extraTimeBySec[d.driverId]) !== null && _b !== void 0 ? _b : 0) + extraTimeSec;
            }
            else if (event.type === 'penalty' && event.penaltySec !== undefined) {
                d = applyPenalty(d, event.penaltySec);
            }
            else if (event.type === 'ers_mode') {
                d = applyErsMode(d, event);
            }
        }
        return d;
    });
    return {
        updatedDrivers,
        extraTimeBySec,
        newRaceState: {
            lap: raceState.lap,
            totalLaps: raceState.totalLaps,
            safetyCarActive,
            virtualSafetyCarActive,
            weatherIsWet,
            trackTempC,
        },
    };
}
