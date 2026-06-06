/**
 * Event application logic — pure functions, no mutation of the original state.
 *
 * Events are injected by the user (What-If scenarios) or by the simulation
 * itself (e.g. auto pit via AI).  All handlers return a new DriverState object.
 */

import type { DriverState, RaceState, EventEffect, Compound } from './types';

// ---------------------------------------------------------------------------
// Pit stop time schema constants.
// These are race-control / sporting-regulation constants, not physics fits.
// Typical F1 stationary time is ~2.2–2.8 s; we use 2.5 s as a round midpoint.
// Pit-lane delta (entry + exit) is track-specific; 18 s is Bahrain's
// published value and a reasonable cross-track default.
// ---------------------------------------------------------------------------

/** Stationary tyre-change time (s). Schema constant. */
const PIT_STATIONARY_SEC = 2.5;

/** Pit-lane entry + exit delta vs racing line (s). Schema constant. */
const PIT_LANE_DELTA_SEC = 18.0;

/** Total pit-stop time penalty added to a lap time (s). */
export const PIT_STOP_TIME_SEC = PIT_STATIONARY_SEC + PIT_LANE_DELTA_SEC;

// ---------------------------------------------------------------------------
// SC / VSC duration defaults — schema constants.
// Typical SC duration per F1 sporting regulations.
// ---------------------------------------------------------------------------

/** Default SC duration in laps if event.duration is not specified. */
export const DEFAULT_SC_DURATION_LAPS = 3;

/** Default VSC duration in laps if event.duration is not specified. */
const DEFAULT_VSC_DURATION_LAPS = 2;

// ---------------------------------------------------------------------------
// Event resolution helpers
// ---------------------------------------------------------------------------

/**
 * Return true if the event affects the given driver on the given lap.
 */
export function eventAppliesTo(
  event: EventEffect,
  driverId: string,
  lap: number,
): boolean {
  if (event.lap !== lap) return false;
  if (event.driverId !== undefined && event.driverId !== driverId) return false;
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
export function applyPit(
  driver: DriverState,
  newCompound: Compound,
  pitTimeSec: number = PIT_STOP_TIME_SEC,
): { newState: DriverState; extraTimeSec: number } {
  return {
    newState: {
      ...driver,
      compound: newCompound,
      stintLap: 1,
      pitCount: driver.pitCount + 1,
    },
    extraTimeSec: pitTimeSec,
  };
}

/**
 * Apply a time penalty (drive-through equivalent: add seconds to total time).
 */
export function applyPenalty(driver: DriverState, penaltySec: number): DriverState {
  return {
    ...driver,
    totalTimeSec: driver.totalTimeSec + penaltySec,
  };
}

/**
 * Apply an ERS mode change.
 */
export function applyErsMode(driver: DriverState, event: EventEffect): DriverState {
  if (!event.ersMode) return driver;
  return { ...driver, ersMode: event.ersMode };
}

// ---------------------------------------------------------------------------
// Race-level event application
// ---------------------------------------------------------------------------

export interface EventApplicationResult {
  /** Driver states after applying all relevant events for this lap. */
  updatedDrivers: DriverState[];
  /** Map of driverId → extra time (s) added to their lap time this lap. */
  extraTimeBySec: Record<string, number>;
  /** Updated RaceState (SC/VSC flags, weather). */
  newRaceState: Omit<RaceState, 'drivers'>;
}

/**
 * Process all events scheduled for `lap` and return updated state.
 *
 * Called once per lap, before lap-time computation, so that SC/VSC flags
 * are already in place when computeLapTime runs.
 */
export function applyEventsForLap(
  raceState: RaceState,
  events: EventEffect[],
): EventApplicationResult {
  const lapEvents = events.filter((e) => e.lap === raceState.lap);

  const trackTempC = raceState.trackTempC;

  // Weather persists; a rain event on this lap toggles it (supports multiple
  // rain on/off changes across the race).
  let weatherIsWet = raceState.weatherIsWet;
  for (const event of lapEvents) {
    if (event.type === 'rain' && event.isWet !== undefined) weatherIsWet = event.isWet;
  }

  // SC/VSC active iff some period covers this lap. Recomputed from scratch each
  // lap (not carried forward), so multiple — even overlapping — SC/VSC periods
  // all work. A period of length d covers laps [lap, lap + d - 1].
  let safetyCarActive = false;
  let virtualSafetyCarActive = false;
  for (const event of events) {
    if (event.driverId !== undefined) continue;
    if (event.type !== 'safety_car' && event.type !== 'vsc') continue;
    const dur = event.duration ?? (event.type === 'safety_car' ? DEFAULT_SC_DURATION_LAPS : DEFAULT_VSC_DURATION_LAPS);
    if (raceState.lap >= event.lap && raceState.lap < event.lap + dur) {
      if (event.type === 'safety_car') safetyCarActive = true;
      else virtualSafetyCarActive = true;
    }
  }
  if (safetyCarActive) virtualSafetyCarActive = false; // full SC supersedes VSC

  // Process per-driver events
  const extraTimeBySec: Record<string, number> = {};
  const updatedDrivers = raceState.drivers.map((driver) => {
    let d = driver;
    for (const event of lapEvents) {
      if (!eventAppliesTo(event, d.driverId, raceState.lap)) continue;

      if (event.type === 'pit') {
        const compound = event.compound ?? d.nextCompound;
        const { newState, extraTimeSec } = applyPit(d, compound, event.pitTimeSec);
        d = newState;
        extraTimeBySec[d.driverId] = (extraTimeBySec[d.driverId] ?? 0) + extraTimeSec;
      } else if (event.type === 'penalty' && event.penaltySec !== undefined) {
        d = applyPenalty(d, event.penaltySec);
      } else if (event.type === 'ers_mode') {
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
