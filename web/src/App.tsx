/**
 * App root — view router + URL-share restore.
 *
 * On mount: if the URL contains share params (?track=&season=&player=&events=&seed=),
 * the track model is fetched, state is restored, and simulate() is called
 * immediately so the result page is shown directly.
 *
 * Normal flow: Home → DriverSelect → WhatIf → (Simulate) → Result
 */

import './App.css';
import { useEffect, useRef } from 'react';
import { useRaceStore } from './store/raceStore';
import { HomePage }         from './components/HomePage';
import { DriverSelectPage } from './components/DriverSelectPage';
import { WhatIfPage }       from './components/WhatIfPage';
import { SimulatePage }     from './components/SimulatePage';
import { ResultPage }       from './components/ResultPage';
import { MfdPage }          from './components/MfdPage';
import { buildDriversFromModel } from './utils/buildDrivers';
import { hasShareParams, parseUrlParams } from './utils/shareUrl';
import type { TrackModel } from './engine/types';

export default function App() {
  const view               = useRaceStore((s) => s.view);
  const setView            = useRaceStore((s) => s.setView);
  const setTrackModel      = useRaceStore((s) => s.setTrackModel);
  const setDrivers         = useRaceStore((s) => s.setDrivers);
  const setSelectedPlayer  = useRaceStore((s) => s.setSelectedPlayerId);
  const clearEvents        = useRaceStore((s) => s.clearEvents);
  const addEvent           = useRaceStore((s) => s.addEvent);
  const setSeed            = useRaceStore((s) => s.setSeed);
  const runSimulation      = useRaceStore((s) => s.runSimulation);

  // Guard against React StrictMode double-invocation in dev
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current) return;
    if (!hasShareParams()) return;
    restoredRef.current = true;

    const { track, season, player, events, seed } = parseUrlParams();
    if (!track || !season) return;

    const jsonPath = `/models/tracks/${season}/${track}.json`;

    fetch(jsonPath)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading ${jsonPath}`);
        return res.json() as Promise<TrackModel>;
      })
      .then((model) => {
        // Restore all parameters — order matters: model first so drivers can be built.
        setTrackModel(model);
        setDrivers(buildDriversFromModel(model));
        if (player) setSelectedPlayer(player);

        // Restore events: clear any stale state first
        clearEvents();
        if (events && events.length > 0) events.forEach(addEvent);

        // Restore seed (may differ from the default-42 set during store init)
        if (seed !== null) setSeed(seed);

        // All Zustand set() calls above are synchronous; runSimulation's get()
        // will see the fully-updated state.
        runSimulation();
        setView('result');
      })
      .catch((err) => {
        console.error('[App] Failed to restore from share URL:', err);
        // Leave user on home page — they can start fresh
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-f1-dark text-f1-text">
      {view === 'home'          && <HomePage />}
      {view === 'driver-select' && <DriverSelectPage />}
      {view === 'whatif'        && <WhatIfPage />}
      {view === 'simulate'      && <SimulatePage />}
      {view === 'result'        && <ResultPage />}
      {view === 'mfd'           && <MfdPage />}
    </div>
  );
}
