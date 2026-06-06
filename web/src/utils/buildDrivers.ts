/**
 * Build the initial DriverState array from a TrackModel.
 *
 * Shared by HomePage (normal flow) and App (URL-restore flow) so the
 * starting grid is always constructed identically.
 *
 * Starting compound is the driver's REAL grid compound when race facts are
 * available (model.raceFacts.startCompounds), else MEDIUM. Starting gap is
 * 0.3 s per grid position to encode a realistic first-lap spread (schema
 * constant — not a physics fit, just initial conditions to prevent all drivers
 * having identical total time on lap 1).
 */

import type { TrackModel, DriverState, Compound } from '../engine/types';

/** 0.3 s stagger per grid slot — schema constant, not a physics fit. */
const GRID_GAP_SEC = 0.3;

export function buildDriversFromModel(model: TrackModel): DriverState[] {
  const startCompounds = model.raceFacts?.startCompounds ?? {};
  // Exclude drivers who did NOT finish — retired (DNF) or disqualified (DSQ).
  // The engine doesn't model failures/penalties, so if they raced they would
  // linger in the order and even gain places under the Safety Car bunching
  // (README debt #7 / §8.6). Only classified finishers race in the What-If.
  const excluded = new Set(
    (model.results ?? []).filter((r) => r.status !== 'finished').map((r) => r.driverId),
  );
  return Object.values(model.driverOffsets)
    .filter((entry) => !excluded.has(entry.driverId))
    .map((entry, i) => ({
    driverId:          entry.driverId,
    team:              entry.team,
    gridPosition:      i + 1,
    position:          i + 1,
    compound:          (startCompounds[entry.driverId] ?? 'MEDIUM') as Compound,
    stintLap:          1,
    lapsSinceStart:    0,
    totalTimeSec:      i * GRID_GAP_SEC,
    gapToLeaderSec:    i * GRID_GAP_SEC,
    gapToCarAheadSec:  i === 0 ? Infinity : GRID_GAP_SEC,
    ersPool:           4,
    ersMode:           'neutral' as const,
    isRetired:         false,
    pitCount:          0,
    nextCompound:      'HARD' as const,
  }));
}
