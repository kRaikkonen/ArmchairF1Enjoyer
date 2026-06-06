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
    for (const p of pits) ev.push({ type: 'pit', lap: p.lap, driverId, compound: p.compound });
  }
  return ev;
}

/** Real safety-car periods. */
export function realScEvents(facts: RaceFacts | null | undefined): EventEffect[] {
  if (!facts) return [];
  return facts.safetyCars.map((sc) => ({ type: 'safety_car', lap: sc.lap, duration: sc.duration }));
}

/** The full real race: every driver's real strategy + the real safety cars. */
export function realRaceEvents(facts: RaceFacts | null | undefined): EventEffect[] {
  return [...realPitEvents(facts), ...realScEvents(facts)];
}
