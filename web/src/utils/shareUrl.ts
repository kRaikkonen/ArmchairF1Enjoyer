/**
 * Share-URL helpers — encode and decode simulation parameters as URL search params.
 *
 * Format:
 *   ?track=bahrain&season=2025&player=VER&events=[...]&seed=42&mv=...&rr=1&ov=VER,LEC
 *
 * `events` is a percent-encoded JSON array (URLSearchParams handles encoding).
 * `rr` (rivalsReact) + `ov` (overridden driver ids) let a MFD "对手博弈" scenario
 * reproduce exactly: on restore the reactive strategies are rebuilt from the
 * model's own race facts minus the overridden drivers (see App.tsx).
 * Opening the URL auto-restores and re-runs the simulation.
 */

import type { EventEffect } from '../engine/types';
import { PIT_LANE_IN_SEC, PIT_LANE_OUT_SEC } from '../engine/events';

export interface ShareParams {
  track:   string;
  season:  number;
  player:  string | null;
  events:  EventEffect[];
  seed:    number;
  /** Model version the link was built against (§8.5). Lets restore detect drift. */
  modelVersion?: string;
  /** "对手博弈" mode was on: rivals run the reactive AI, not their frozen real pits. */
  rivalsReact?: boolean;
  /** Driver ids the player explicitly overrode (excluded from reactive strategies). */
  overridden?: string[];
}

/**
 * Best-effort slug from a FastF1 event name, mirroring the pipeline's
 * schedule.slugify (lowercase, drop "grand prix", spaces→hyphens). Only used as
 * a fallback when a model predates the `slug` field; current models all carry one.
 */
export function slugifyTrack(event: string): string {
  return event
    .toLowerCase()
    .replace(/grand prix/g, '')
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-') // collapse spaces/accents/punctuation to hyphens
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Encoder
// ---------------------------------------------------------------------------

/**
 * Build a full share URL from simulation parameters.
 * `track` should already be the model slug (e.g. "saudi-arabian").
 */
export function buildShareUrl(params: ShareParams): string {
  const sp = new URLSearchParams();
  sp.set('track',  params.track.toLowerCase());
  sp.set('season', String(params.season));
  if (params.player) sp.set('player', params.player);
  if (params.events.length > 0) sp.set('events', JSON.stringify(params.events));
  sp.set('seed', String(params.seed));
  if (params.modelVersion) sp.set('mv', params.modelVersion);
  if (params.rivalsReact) sp.set('rr', '1');
  if (params.overridden && params.overridden.length > 0) sp.set('ov', params.overridden.join(','));
  return `${window.location.origin}${window.location.pathname}?${sp.toString()}`;
}

// ---------------------------------------------------------------------------
// Decoder
// ---------------------------------------------------------------------------

export interface ParsedUrlParams {
  track:   string | null;
  season:  number | null;
  player:  string | null;
  events:  EventEffect[] | null;
  seed:    number | null;
  modelVersion: string | null;
  rivalsReact: boolean;
  overridden: string[];
}

/** Parse simulation parameters from the current page URL. */
export function parseUrlParams(): ParsedUrlParams {
  const sp = new URLSearchParams(window.location.search);

  // Coerce numeric params and reject NaN (a malformed link must not inject a
  // NaN season/seed into the restore path).
  const num = (key: string): number | null => {
    if (!sp.has(key)) return null;
    const n = parseInt(sp.get(key)!, 10);
    return Number.isFinite(n) ? n : null;
  };
  const track  = sp.get('track');
  const season = num('season');
  const player = sp.get('player');
  const seed   = num('seed');

  let events: EventEffect[] | null = null;
  const eventsRaw = sp.get('events');
  if (eventsRaw) {
    try {
      const parsed = JSON.parse(eventsRaw);
      if (!Array.isArray(parsed)) throw new Error('events param is not an array');
      // Drop malformed elements (null/non-object/typeless) so a single bad entry
      // doesn't discard the whole scenario; keep only well-formed events.
      const raw = parsed.filter(
        (e): e is Record<string, unknown> => !!e && typeof e === 'object' && typeof (e as Record<string, unknown>).type === 'string',
      );
      // Migration: the pit-time field was once `pitTimeSec` (TOTAL stop time);
      // it is now `pitStationarySec` (stationary only; total = in + stationary +
      // out). Convert legacy links so they still reproduce their original stop.
      events = raw.map((e) => {
        if (e.type === 'pit' && typeof e.pitTimeSec === 'number' && e.pitStationarySec === undefined) {
          const { pitTimeSec, ...rest } = e;
          return { ...rest, pitStationarySec: Math.max(0, pitTimeSec - PIT_LANE_IN_SEC - PIT_LANE_OUT_SEC) };
        }
        return e;
      }) as unknown as EventEffect[];
    } catch {
      console.warn('[shareUrl] Failed to parse events param:', eventsRaw);
    }
  }

  return {
    track, season, player, events, seed,
    modelVersion: sp.get('mv'),
    rivalsReact: sp.get('rr') === '1',
    overridden: (sp.get('ov') ?? '').split(',').filter(Boolean),
  };
}

/** Return true if the current URL contains share params we should restore. */
export function hasShareParams(): boolean {
  const sp = new URLSearchParams(window.location.search);
  return sp.has('track') && sp.has('season');
}
