/**
 * Engine types — pure data, no DOM/React imports.
 * All physics parameters flow in from TrackModel; nothing is hard-coded here.
 */

// ---------------------------------------------------------------------------
// TrackModel — mirrors schema-v1 JSON from models/tracks/<year>/<name>.json
// ---------------------------------------------------------------------------

export interface StintProgressFit {
  slope: number;      // s/lap (negative = car gets faster)
  intercept: number;  // baseline at lap 0
  rSquared: number;
  nSamples: number;
}

export interface TyreDegEntry {
  intercept: number;  // absolute team/compound pace at stintLap = 0 (s)
  degLinear: number;  // s/lap per stint lap
  cliffStart: number; // stint lap where cliff begins; 999 = no cliff
  cliffSlope: number; // extra slope after cliffStart
  nSamples: number;
  insufficient: boolean;
}

export interface DirtyAirFit {
  penaltySec: number;     // positive: lap-time cost when in dirty air
  gapThresholdSec: number; // gap below which dirty air applies
  nSamplesDirty: number;
  nSamplesClean: number;
  insufficient: boolean;
}

export interface DrsBoostFit {
  boostSec: number;        // negative: lap-time gain when DRS active
  gapThresholdSec: number; // gap below which DRS can be used
  nSamplesDrs: number;
  nSamplesNoDrs: number;
  insufficient: boolean;
}

export interface DriverOffsetEntry {
  driverId: string;
  team: string;
  offsetSec: number; // positive = slower than team/compound model
  nSamples: number;
}

export interface RaceResultEntry {
  position: number;
  driverId: string;
  team: string;
  dnf: boolean;
}

export interface TrackModel {
  schemaVersion: string;
  season: number;
  event: string;
  trackBasePace: number; // median clean lap (diagnostic only)
  stintProgress: StintProgressFit;
  /** Key format: "Team|Compound", e.g. "McLaren|SOFT" */
  tyreDeg: Record<string, TyreDegEntry>;
  dirtyAir: DirtyAirFit;
  drsBoost: DrsBoostFit;
  /** Key: driver abbreviation, e.g. "PIA" */
  driverOffsets: Record<string, DriverOffsetEntry>;
  fitMeta: Record<string, unknown>;
  /** Official race classification for this event (comparison view). */
  results?: RaceResultEntry[];
}

// ---------------------------------------------------------------------------
// Simulation state
// ---------------------------------------------------------------------------

export type Compound = 'SOFT' | 'MEDIUM' | 'HARD' | 'INTER' | 'WET';
export type ErsMode = 'attack' | 'neutral' | 'save';

export interface DriverState {
  driverId: string;    // e.g. "PIA"
  team: string;        // e.g. "McLaren"
  gridPosition: number;
  position: number;    // current race position (1-based)
  compound: Compound;
  stintLap: number;    // laps completed on current tyre (1 = first lap of stint)
  lapsSinceStart: number;
  totalTimeSec: number;
  gapToLeaderSec: number;
  gapToCarAheadSec: number;
  ersPool: number;     // current ERS energy (arbitrary units)
  ersMode: ErsMode;
  isRetired: boolean;
  pitCount: number;
  nextCompound: Compound; // planned compound after next pit
}

export interface RaceState {
  lap: number;
  totalLaps: number;
  safetyCarActive: boolean;
  virtualSafetyCarActive: boolean;
  weatherIsWet: boolean;
  trackTempC: number;
  drivers: DriverState[];
}

// ---------------------------------------------------------------------------
// What-If events (user-injected)
// ---------------------------------------------------------------------------

export type EventType =
  | 'pit'
  | 'penalty'
  | 'safety_car'
  | 'vsc'
  | 'rain'
  | 'ers_mode';

export interface EventEffect {
  type: EventType;
  lap: number;
  /** undefined = affects all drivers */
  driverId?: string;
  compound?: Compound;     // pit: which tyre to fit
  penaltySec?: number;     // penalty: seconds to add
  duration?: number;       // sc/vsc: laps it stays out
  ersMode?: ErsMode;       // ers_mode: switch mode
  isWet?: boolean;         // rain: enable wet conditions
}

// ---------------------------------------------------------------------------
// Simulation input / output
// ---------------------------------------------------------------------------

export interface SimulationInput {
  trackModel: TrackModel;
  initialDrivers: DriverState[];
  totalLaps: number;
  events: EventEffect[];
  seed: number;
  trackTempC?: number;
  weatherIsWet?: boolean;
}

export interface LapSnapshot {
  driverId: string;
  lap: number;
  lapTimeSec: number;
  position: number;
  compound: Compound;
  stintLap: number;
  gapToLeaderSec: number;
  isInPit: boolean;
}

export interface SimulationResult {
  /** lapHistory[lap - 1] = array of snapshots for that lap, sorted by position */
  lapHistory: LapSnapshot[][];
  finalOrder: DriverState[];
}
