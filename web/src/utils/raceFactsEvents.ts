/**
 * Turn the model's real race facts into engine events, so the MFD can open on
 * the real race and the player modifies one driver's strategy from there.
 */
import type { EventEffect, RaceFacts } from '../engine/types';

/** Real pit stops for every driver (optionally excluding the controlled one). */
export function realPitEvents(
  facts: RaceFacts | null | undefined,
  excludeDriverId?: string,
): EventEffect[] {
  if (!facts) return [];
  const ev: EventEffect[] = [];
  for (const [driverId, pits] of Object.entries(facts.strategies)) {
    if (driverId === excludeDriverId) continue;
    for (const p of pits) {
      // Carry the real stationary time so the baseline reproduces real slow stops
      // (e.g. a 14.7s botched stop), not a flat default.
      const e: EventEffect = { type: 'pit', lap: p.lap, driverId, compound: p.compound };
      if (typeof p.stationarySec === 'number') e.pitStationarySec = p.stationarySec;
      ev.push(e);
    }
  }
  return ev;
}

/** Real safety-car periods (full SC + virtual SC). */
export function realScEvents(facts: RaceFacts | null | undefined): EventEffect[] {
  if (!facts) return [];
  const sc: EventEffect[] = facts.safetyCars.map((s) => ({ type: 'safety_car', lap: s.lap, duration: s.duration }));
  const vsc: EventEffect[] = (facts.virtualSafetyCars ?? []).map((s) => ({ type: 'vsc', lap: s.lap, duration: s.duration }));
  return [...sc, ...vsc];
}

/** The full real race: every driver's real strategy + the real safety cars (incl. VSC). */
export function realRaceEvents(facts: RaceFacts | null | undefined): EventEffect[] {
  return [...realPitEvents(facts), ...realScEvents(facts)];
}
