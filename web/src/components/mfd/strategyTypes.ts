/**
 * Shared strategy/scenario types + event builders for the MFD.
 *
 * The scenario state lives in MfdPage (not the panel) so it persists and
 * ACCUMULATES across driver switches: each edited driver keeps their strategy,
 * race events are global, and the feed shows them all.
 */
import type { Compound, ErsMode, EventEffect } from '../../engine/types';
import { DEFAULT_PIT_STATIONARY_SEC } from '../../engine/events';

export interface Pit { lap: number; compound: Compound; stationary: number; }
export interface ErsChange { lap: number; mode: ErsMode; }
export type EvtKind = 'safety_car' | 'vsc' | 'rain' | 'penalty';
export interface RaceEvt { kind: EvtKind; lap: number; duration: number; isWet: boolean; driverId: string; penaltySec: number; }
/** One driver's overridden strategy (pit stops + engine-mode changes). */
export interface DriverStrat { pits: Pit[]; ers: ErsChange[]; }

const clampLap = (l: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(l) ? Math.round(l) : lo));

/** A driver's REAL strategy as an editable DriverStrat (real pits, no ers changes). */
export function defaultStrat(realPits: { lap: number; compound: Compound }[] | undefined): DriverStrat {
  return {
    pits: (realPits ?? []).map((p) => ({ lap: p.lap, compound: p.compound, stationary: DEFAULT_PIT_STATIONARY_SEC })),
    ers: [],
  };
}

/** Build pit + ers_mode events for one driver, clamped and de-duped by pit lap. */
export function stratToEvents(driverId: string, strat: DriverStrat, totalLaps: number): EventEffect[] {
  const ev: EventEffect[] = [];
  const byLap = new Map<number, Pit>();
  for (const p of strat.pits) byLap.set(clampLap(p.lap, 2, totalLaps - 1), p);
  for (const [lap, p] of [...byLap.entries()].sort((a, b) => a[0] - b[0])) {
    const stat = Math.min(40, Math.max(0, Number.isFinite(p.stationary) ? p.stationary : DEFAULT_PIT_STATIONARY_SEC));
    ev.push({ type: 'pit', lap, driverId, compound: p.compound, pitStationarySec: stat });
  }
  for (const e of strat.ers) ev.push({ type: 'ers_mode', lap: clampLap(e.lap, 1, totalLaps), driverId, ersMode: e.mode });
  return ev;
}

/** Build SC / VSC / rain / penalty events from the global race-event list. */
export function raceEvtsToEvents(raceEvts: RaceEvt[], totalLaps: number): EventEffect[] {
  const ev: EventEffect[] = [];
  for (const e of raceEvts) {
    const lap = clampLap(e.lap, 1, totalLaps);
    if (e.kind === 'rain') ev.push({ type: 'rain', lap, isWet: e.isWet });
    else if (e.kind === 'penalty') ev.push({ type: 'penalty', lap, driverId: e.driverId, penaltySec: Math.max(0, Number.isFinite(e.penaltySec) ? e.penaltySec : 5) });
    else ev.push({ type: e.kind, lap, duration: Math.max(1, Number.isFinite(e.duration) ? e.duration : 3) });
  }
  return ev;
}

/** Initial global race events = the real race's safety cars. */
export function realRaceEvts(safetyCars: { lap: number; duration: number }[] | undefined): RaceEvt[] {
  return (safetyCars ?? []).map((sc) => ({ kind: 'safety_car' as EvtKind, lap: sc.lap, duration: sc.duration, isWet: true, driverId: '', penaltySec: 5 }));
}
