/**
 * Global race simulation store (Zustand).
 *
 * Manages:
 *   - Selected track model (loaded from JSON)
 *   - Initial driver configuration
 *   - User-injected What-If events
 *   - Simulation result (lazy — computed on demand)
 *   - Shared PRNG seed (encodes in URL for reproducibility)
 *
 * The simulation itself is pure (simulate.ts); this store only holds
 * inputs/outputs and UI state. No engine physics live here.
 */

import { create } from 'zustand';
import type { TrackModel, DriverState, EventEffect, SimulationResult } from '../engine/types';
import { simulate } from '../engine/simulate';

// ---------------------------------------------------------------------------
// URL seed extraction — schema constant for how seed appears in URL
// ---------------------------------------------------------------------------

function seedFromUrl(): number {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('seed');
  const parsed = raw ? parseInt(raw, 10) : NaN;
  // Default seed: 42 — schema constant, reproducible across sessions
  return Number.isFinite(parsed) ? parsed : 42;
}

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export type AppView = 'home' | 'driver-select' | 'whatif' | 'simulate' | 'result' | 'mfd';

export interface RaceStore {
  // --- UI state ---
  view: AppView;
  setView: (v: AppView) => void;

  // --- Track selection ---
  trackModel: TrackModel | null;
  setTrackModel: (model: TrackModel) => void;

  // --- Driver config ---
  drivers: DriverState[];
  setDrivers: (drivers: DriverState[]) => void;

  // --- Player driver (the one the user "controls") ---
  selectedPlayerId: string | null;
  setSelectedPlayerId: (id: string | null) => void;

  // --- What-If events ---
  events: EventEffect[];
  addEvent: (event: EventEffect) => void;
  removeEvent: (index: number) => void;
  clearEvents: () => void;

  // --- Seed ---
  seed: number;
  setSeed: (seed: number) => void;

  // --- Simulation result ---
  result: SimulationResult | null;
  isRunning: boolean;
  runSimulation: () => void;
  clearResult: () => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useRaceStore = create<RaceStore>((set, get) => ({
  view: 'home',
  setView: (view) => set({ view }),

  trackModel: null,
  setTrackModel: (trackModel) => set({ trackModel, result: null }),

  drivers: [],
  setDrivers: (drivers) => set({ drivers }),

  selectedPlayerId: null,
  setSelectedPlayerId: (selectedPlayerId) => set({ selectedPlayerId }),

  events: [],
  addEvent: (event) => set((s) => ({ events: [...s.events, event] })),
  removeEvent: (index) =>
    set((s) => ({ events: s.events.filter((_, i) => i !== index) })),
  clearEvents: () => set({ events: [] }),

  seed: seedFromUrl(),
  setSeed: (seed) => set({ seed }),

  result: null,
  isRunning: false,

  runSimulation: () => {
    const { trackModel, drivers, events, seed } = get();
    if (!trackModel || drivers.length === 0) return;

    set({ isRunning: true, result: null });

    // Run synchronously (57 laps × 20 drivers is fast enough for Phase 1)
    // Phase 2 can move this to a Web Worker if needed.
    try {
      const result = simulate({
        trackModel,
        initialDrivers: drivers,
        totalLaps: 57, // TODO: read from trackModel when multi-track is supported
        events,
        seed,
        trackTempC: 32,
        weatherIsWet: false,
      });
      set({ result, isRunning: false });
    } catch (err) {
      console.error('Simulation error:', err);
      set({ isRunning: false });
    }
  },

  clearResult: () => set({ result: null }),
}));
