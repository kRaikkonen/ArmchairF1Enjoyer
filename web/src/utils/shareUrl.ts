/**
 * Share-URL helpers — encode and decode simulation parameters as URL search params.
 *
 * Format:
 *   ?track=bahrain&season=2025&player=VER&events=[...]&seed=42
 *
 * `events` is a percent-encoded JSON array (URLSearchParams handles encoding).
 * Opening the URL auto-restores and re-runs the simulation.
 */

import type { EventEffect } from '../engine/types';

export interface ShareParams {
  track:   string;
  season:  number;
  player:  string | null;
  events:  EventEffect[];
  seed:    number;
}

// ---------------------------------------------------------------------------
// Encoder
// ---------------------------------------------------------------------------

/**
 * Build a full share URL from simulation parameters.
 * `track` should be the model's event name lowercased (e.g. "bahrain").
 */
export function buildShareUrl(params: ShareParams): string {
  const sp = new URLSearchParams();
  sp.set('track',  params.track.toLowerCase());
  sp.set('season', String(params.season));
  if (params.player) sp.set('player', params.player);
  if (params.events.length > 0) sp.set('events', JSON.stringify(params.events));
  sp.set('seed', String(params.seed));
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
}

/** Parse simulation parameters from the current page URL. */
export function parseUrlParams(): ParsedUrlParams {
  const sp = new URLSearchParams(window.location.search);

  const track  = sp.get('track');
  const season = sp.has('season') ? parseInt(sp.get('season')!, 10) : null;
  const player = sp.get('player');
  const seed   = sp.has('seed')   ? parseInt(sp.get('seed')!,   10) : null;

  let events: EventEffect[] | null = null;
  const eventsRaw = sp.get('events');
  if (eventsRaw) {
    try {
      events = JSON.parse(eventsRaw) as EventEffect[];
    } catch {
      console.warn('[shareUrl] Failed to parse events param:', eventsRaw);
    }
  }

  return { track, season, player, events, seed };
}

/** Return true if the current URL contains share params we should restore. */
export function hasShareParams(): boolean {
  const sp = new URLSearchParams(window.location.search);
  return sp.has('track') && sp.has('season');
}
