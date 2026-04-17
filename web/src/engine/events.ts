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
const DEFAULT_SC_DURATION_LAPS = 3;

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
): { newState: DriverState; extraTimeSec: number } {
  return {
    newState: {
      ...driver,
      compound: newCompound,
      stintLap: 1,
      pitCount: driver.pitCount + 1,
    },
    extraTimeSec: PIT_STOP_TIME_SEC,
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

  let safetyCarActive = raceState.safetyCarActive;
  let virtualSafetyCarActive = raceState.virtualSafetyCarActive;
  let weatherIsWet = raceState.weatherIsWet;
  let trackTempC = raceState.trackTempC;

  // Process race-level events first
  for (const event of lapEvents) {
    if (event.type === 'safety_car' && event.driverId === undefined) {
      safetyCarActive = true;
      virtualSafetyCarActive = false;
    }
    if (event.type === 'vsc' && event.driverId === undefined) {
      virtualSafetyCarActive = true;
      safetyCarActive = false;
    }
    if (event.type === 'rain' && event.isWet !== undefined) {
      weatherIsWet = event.isWet;
    }
  }

  // Determine SC/VSC end based on duration
  for (const event of events) {
    const endLap = event.lap + (event.duration ?? (event.type === 'safety_car' ? DEFAULT_SC_DURATION_LAPS : DEFAULT_VSC_DURATION_LAPS));
    if (event.type === 'safety_car' && raceState.lap >= endLap) {
      safetyCarActive = false;
    }
    if (event.type === 'vsc' && raceState.lap >= endLap) {
      virtualSafetyCarActive = false;
    }
  }

  // Process per-driver events
  const extraTimeBySec: Record<string, number> = {};
  const updatedDrivers = raceState.drivers.map((driver) => {
    let d = driver;
    for (const event of lapEvents) {
      if (!eventAppliesTo(event, d.driverId, raceState.lap)) continue;

      if (event.type === 'pit') {
        const compound = event.compound ?? d.nextCompound;
        const { newState, extraTimeSec } = applyPit(d, compound);
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
