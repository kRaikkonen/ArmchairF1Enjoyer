/**
 * Share-URL round-trip regression tests.
 *
 * Locks in the audit-fixed behaviors (2026-06-07):
 *   - rivalsReact ("对手博弈") + overridden drivers survive the round-trip, so a
 *     shared MFD scenario reconstructs the same reactive strategies on restore.
 *   - a single malformed events element no longer discards the whole scenario.
 *   - NaN season/seed are rejected (not injected into restore).
 *   - the legacy pitTimeSec → pitStationarySec migration still fires.
 *   - slugifyTrack mirrors the pipeline slug for the dormant fallback.
 *
 * Runs in the engine's node env via a minimal window stub (no jsdom needed):
 * buildShareUrl reads window.location.origin/pathname, parseUrlParams reads .search.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { buildShareUrl, parseUrlParams, slugifyTrack, type ShareParams } from './shareUrl';

function setUrl(search: string) {
  (globalThis as unknown as { window: unknown }).window = {
    location: { origin: 'http://x', pathname: '/', search },
  };
}

/** Encode then decode by feeding the built query string back to the parser. */
function roundTrip(params: ShareParams) {
  setUrl('');
  const url = buildShareUrl(params);
  setUrl(url.slice(url.indexOf('?')));
  return parseUrlParams();
}

const base: ShareParams = { track: 'bahrain', season: 2025, player: 'VER', events: [], seed: 42 };

describe('shareUrl round-trip', () => {
  beforeEach(() => setUrl(''));

  it('preserves rivalsReact + overridden drivers', () => {
    const p = roundTrip({ ...base, rivalsReact: true, overridden: ['VER', 'LEC'] });
    expect(p.rivalsReact).toBe(true);
    expect(p.overridden).toEqual(['VER', 'LEC']);
  });

  it('defaults rivalsReact off and overridden empty when absent', () => {
    const p = roundTrip(base);
    expect(p.rivalsReact).toBe(false);
    expect(p.overridden).toEqual([]);
  });

  it('round-trips events and the player/seed/track', () => {
    const events = [{ type: 'pit' as const, lap: 12, driverId: 'VER', compound: 'HARD' as const }];
    const p = roundTrip({ ...base, events });
    expect(p.events).toEqual(events);
    expect(p.player).toBe('VER');
    expect(p.seed).toBe(42);
    expect(p.track).toBe('bahrain');
  });

  it('keeps valid events when one element is malformed (no all-or-nothing discard)', () => {
    setUrl(`?track=bahrain&season=2025&events=${encodeURIComponent(JSON.stringify([null, { type: 'pit', lap: 5 }, 3]))}`);
    const p = parseUrlParams();
    expect(p.events).toEqual([{ type: 'pit', lap: 5 }]);
  });

  it('rejects NaN season and seed', () => {
    setUrl('?track=bahrain&season=abc&seed=xyz');
    const p = parseUrlParams();
    expect(p.season).toBeNull();
    expect(p.seed).toBeNull();
  });

  it('migrates legacy pitTimeSec to pitStationarySec', () => {
    setUrl(`?track=bahrain&season=2025&events=${encodeURIComponent(JSON.stringify([{ type: 'pit', lap: 10, pitTimeSec: 30 }]))}`);
    const p = parseUrlParams();
    // total 30 − laneIn(9.5) − laneOut(8.5) = 12 stationary
    expect(p.events?.[0]).toMatchObject({ type: 'pit', lap: 10, pitStationarySec: 12 });
    expect((p.events?.[0] as unknown as Record<string, unknown>).pitTimeSec).toBeUndefined();
  });
});

describe('slugifyTrack', () => {
  it('mirrors the pipeline slug for the dormant fallback', () => {
    expect(slugifyTrack('Bahrain Grand Prix')).toBe('bahrain');
    expect(slugifyTrack('Saudi Arabian Grand Prix')).toBe('saudi-arabian');
    expect(slugifyTrack('Emilia Romagna Grand Prix')).toBe('emilia-romagna');
  });
});
