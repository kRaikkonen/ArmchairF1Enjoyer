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

import type {
  SimulationInput,
  SimulationResult,
  RaceState,
  DriverState,
  LapSnapshot,
} from './types';
import { computeLapTime } from './lapTime';
import { applyEventsForLap, applyPit } from './events';
import { decidePit } from './ai';
import { createRng, deriveSeed } from './rng';

// ---------------------------------------------------------------------------
// DRS zone heuristic
// Schema constant: in a simplified model we assume any driver within the DRS
// gap threshold and within the top-N (not leading) is in a DRS zone.
// Actual DRS zones vary by track; this is a per-lap approximation.
// ---------------------------------------------------------------------------

/** Assume all non-leading drivers are potentially in a DRS zone. Schema constant. */
function isInDrsZone(_position: number): boolean {
  // Simplified: the DRS zone heuristic defers the actual gap check to
  // computeLapTime (model.drsBoost.gapThresholdSec).  We always pass true
  // here (every driver except P1 might be in a DRS zone on some part of
  // the track), and let the gap threshold be the real gate.
  return _position > 1;
}

// ---------------------------------------------------------------------------
// Position re-sort
// ---------------------------------------------------------------------------

function recomputePositions(drivers: DriverState[]): DriverState[] {
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

function buildSnapshot(driver: DriverState, lap: number, lapTimeSec: number, isInPit: boolean): LapSnapshot {
  return {
    driverId: driver.driverId,
    lap,
    lapTimeSec,
    position: driver.position,
    compound: driver.compound,
    stintLap: driver.stintLap,
    gapToLeaderSec: driver.gapToLeaderSec,
    isInPit,
  };
}

// ---------------------------------------------------------------------------
// Main simulation entry point
// ---------------------------------------------------------------------------

export function simulate(input: SimulationInput): SimulationResult {
  const { trackModel, totalLaps, events, seed } = input;

  // Initialise race state
  let raceState: RaceState = {
    lap: 1,
    totalLaps,
    safetyCarActive: false,
    virtualSafetyCarActive: false,
    weatherIsWet: input.weatherIsWet ?? false,
    trackTempC: input.trackTempC ?? 32,
    drivers: input.initialDrivers.map((d) => ({ ...d })),
  };

  const lapHistory: LapSnapshot[][] = [];

  for (let lap = 1; lap <= totalLaps; lap++) {
    raceState = { ...raceState, lap };

    // 1. Apply user events for this lap (SC/VSC/rain/penalty/user-pit)
    const eventResult = applyEventsForLap(raceState, events);
    const userPittedIds = new Set(
      events
        .filter((e) => e.lap === lap && e.type === 'pit')
        .map((e) => e.driverId)
        .filter((id): id is string => id !== undefined),
    );

    let drivers: DriverState[] = eventResult.updatedDrivers;

    // Update race-level flags from event application
    raceState = {
      ...raceState,
      ...eventResult.newRaceState,
      drivers,
    };

    // 2. AI pit decisions (only for drivers NOT covered by user events)
    const aiExtraTime: Record<string, number> = {};
    drivers = drivers.map((driver) => {
      if (driver.isRetired) return driver;
      if (userPittedIds.has(driver.driverId)) return driver;

      const lapsRemaining = totalLaps - lap + 1;
      const decision = decidePit(driver, trackModel, lapsRemaining);
      if (decision.shouldPit) {
        const { newState, extraTimeSec } = applyPit(driver, decision.targetCompound);
        aiExtraTime[driver.driverId] = extraTimeSec;
        return newState;
      }
      return driver;
    });

    // 3. Compute lap times
    const lapSnapshots: LapSnapshot[] = [];

    drivers = drivers.map((driver) => {
      if (driver.isRetired) {
        lapSnapshots.push(buildSnapshot(driver, lap, 0, false));
        return driver;
      }

      const isPitting =
        userPittedIds.has(driver.driverId) || driver.driverId in aiExtraTime;

      // Per-driver seeded RNG
      const childSeed = deriveSeed(seed, driver.driverId, lap);
      const rng = createRng(childSeed);

      const result = computeLapTime(
        {
          driverId: driver.driverId,
          team: driver.team,
          compound: driver.compound,
          stintLap: driver.stintLap,
          lapsSinceStart: driver.lapsSinceStart + 1,
          gapToCarAheadSec: driver.gapToCarAheadSec,
          inDrsZone: isInDrsZone(driver.position),
          ersState: { pool: driver.ersPool },
          ersMode: driver.ersMode,
          trackTempC: raceState.trackTempC,
          isWet: raceState.weatherIsWet,
          isSafetyCarLap: raceState.safetyCarActive,
          isVscLap: raceState.virtualSafetyCarActive,
        },
        trackModel,
        rng,
      );

      const pitExtra =
        (eventResult.extraTimeBySec[driver.driverId] ?? 0) +
        (aiExtraTime[driver.driverId] ?? 0);

      const lapTimeSec = result.lapTimeSec + pitExtra;

      const updatedDriver: DriverState = {
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

    // 5. Store snapshots with updated positions
    const snapshotsWithPositions = lapSnapshots.map((s) => {
      const d = drivers.find((dr) => dr.driverId === s.driverId);
      return d ? { ...s, position: d.position } : s;
    });

    lapHistory.push(snapshotsWithPositions.sort((a, b) => a.position - b.position));

    raceState = { ...raceState, drivers };
  }

  return {
    lapHistory,
    finalOrder: recomputePositions(raceState.drivers),
  };
}
