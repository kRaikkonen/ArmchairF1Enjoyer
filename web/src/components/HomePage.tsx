/**
 * Home page — race selector.
 *
 * Phase 1: shows available race cards (Bahrain only for now).
 * User taps a card to go to the setup flow.
 */

import { useRaceStore } from '../store/raceStore';
import type { TrackModel } from '../engine/types';
import { buildDriversFromModel } from '../utils/buildDrivers';

// Available tracks in Phase 1 (Bahrain only)
const TRACKS = [
  {
    id: 'bahrain',
    name: 'Bahrain Grand Prix',
    year: 2025,
    jsonPath: '/models/tracks/2025/bahrain.json',
    subtitle: '2025 · Round 1 · Sakhir',
    totalLaps: 57,
  },
] as const;

export function HomePage() {
  const setView = useRaceStore((s) => s.setView);
  const setTrackModel = useRaceStore((s) => s.setTrackModel);
  const setDrivers = useRaceStore((s) => s.setDrivers);

  async function selectTrack(track: (typeof TRACKS)[number]) {
    try {
      const res = await fetch(track.jsonPath);
      if (!res.ok) throw new Error(`Failed to load ${track.jsonPath}`);
      const model = (await res.json()) as TrackModel;
      setTrackModel(model);
      setDrivers(buildDriversFromModel(model));
      setView('driver-select');
    } catch (err) {
      console.error('Failed to load track model:', err);
    }
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-f1-red tracking-wide uppercase">
          Armchair Pitwall
        </h1>
        <p className="text-f1-muted text-sm mt-1">
          What if you called the strategy?
        </p>
      </header>

      {/* Race cards */}
      <section aria-label="Select a race">
        <h2 className="text-xs uppercase tracking-widest text-f1-muted mb-3">
          Choose a race
        </h2>
        <ul className="space-y-3">
          {TRACKS.map((track) => (
            <li key={track.id}>
              <button
                onClick={() => void selectTrack(track)}
                className="w-full text-left bg-f1-mid border border-f1-border rounded-lg px-4 py-4 hover:border-f1-red transition-colors"
              >
                <div className="font-semibold text-f1-text">{track.name}</div>
                <div className="text-f1-muted text-sm mt-0.5">{track.subtitle}</div>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Footer */}
      <footer className="mt-12 text-center text-xs text-f1-muted">
        <p>Model v1 · Based on 2025 Bahrain GP data</p>
        <p className="mt-1">
          Data courtesy of FastF1. Not affiliated with F1, FIA, or any team.
        </p>
      </footer>
    </main>
  );
}
