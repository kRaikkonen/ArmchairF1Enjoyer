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
  const runScenario        = useRaceStore((s) => s.runScenario);

  // Guard against React StrictMode double-invocation in dev
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current) return;
    if (!hasShareParams()) return;
    restoredRef.current = true;

    const { track, season, player, events, seed, modelVersion, rivalsReact, overridden } = parseUrlParams();
    if (!track || !season) return;

    const jsonPath = `/models/tracks/${season}/${track}.json`;

    fetch(jsonPath)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading ${jsonPath}`);
        return res.json() as Promise<TrackModel>;
      })
      .then((model) => {
        // §8.5 reproducibility: warn if the link was built against a different
        // model build (the fit changed since the link was shared, so the
        // recreated result may not match the original).
        if (modelVersion && model.modelVersion && modelVersion !== model.modelVersion) {
          console.warn(
            `[App] Share-link model drift: link=${modelVersion} current=${model.modelVersion}. ` +
            `Result may differ from the original.`,
          );
        }
        // Restore all parameters — order matters: model first so drivers can be built.
        setTrackModel(model);
        setDrivers(buildDriversFromModel(model));
        if (player) setSelectedPlayer(player);

        // Restore events: clear any stale state first
        clearEvents();
        if (events && events.length > 0) events.forEach(addEvent);

        // Restore seed (may differ from the default-42 set during store init)
        if (seed !== null) setSeed(seed);

        // "对手博弈" links carry only the player's overrides + race events; the
        // rivals' reactive strategies are rebuilt here from the model's own race
        // facts (real strategy minus overridden drivers), mirroring the MFD's
        // buildReactiveStrategies(), and the run goes through runScenario() so the
        // reactive AI fires. Without this the link would silently fall back to the
        // generic 1-stop AI and not reproduce. Plain (non-react) links inject every
        // rival's real pits into `events`, so runSimulation() reproduces them as-is.
        if (rivalsReact && model.raceFacts) {
          const overrideSet = new Set(overridden);
          const reactive: NonNullable<Parameters<typeof runScenario>[3]> = {};
          for (const [d, pits] of Object.entries(model.raceFacts.strategies)) {
            if (!overrideSet.has(d)) reactive[d] = pits;
          }
          // 32°C / dry — the baseline run params (match the store's runSimulation
          // defaults and the MFD's BASELINE_TEMP_C, so react vs plain reproduce alike).
          runScenario(events ?? [], 32, false, reactive);
        } else {
          runSimulation();
        }
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
