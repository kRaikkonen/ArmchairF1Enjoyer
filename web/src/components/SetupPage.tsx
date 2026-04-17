/**
 * Setup page — What-If event configuration.
 *
 * Phase 1 scaffold: allows the user to optionally add events before
 * running the simulation.  Full event editor is Phase 2.
 */

import { useRaceStore } from '../store/raceStore';

export function SetupPage() {
  const setView = useRaceStore((s) => s.setView);
  const trackModel = useRaceStore((s) => s.trackModel);
  const events = useRaceStore((s) => s.events);
  const clearEvents = useRaceStore((s) => s.clearEvents);
  const runSimulation = useRaceStore((s) => s.runSimulation);

  function handleRun() {
    runSimulation();
    setView('result');
  }

  if (!trackModel) {
    return (
      <div className="p-8 text-center text-f1-muted">
        No track selected.{' '}
        <button
          className="text-f1-red underline"
          onClick={() => setView('home')}
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      {/* Nav */}
      <button
        className="text-f1-muted text-sm mb-6"
        onClick={() => setView('home')}
      >
        ← Back
      </button>

      <h1 className="text-xl font-bold mb-1">What-If Setup</h1>
      <p className="text-f1-muted text-sm mb-6">
        {trackModel.event} {trackModel.season} · {trackModel.schemaVersion}
      </p>

      {/* Events list */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs uppercase tracking-widest text-f1-muted">
            Events ({events.length})
          </h2>
          {events.length > 0 && (
            <button
              className="text-xs text-f1-muted hover:text-f1-red"
              onClick={clearEvents}
            >
              Clear all
            </button>
          )}
        </div>

        {events.length === 0 ? (
          <p className="text-f1-muted text-sm py-4 text-center border border-f1-border rounded-lg">
            No events — base simulation only
          </p>
        ) : (
          <ul className="space-y-2">
            {events.map((ev, i) => (
              <li
                key={i}
                className="flex items-center justify-between bg-f1-mid border border-f1-border rounded px-3 py-2 text-sm"
              >
                <span>
                  Lap {ev.lap} · {ev.type}
                  {ev.driverId ? ` · ${ev.driverId}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Phase 1: event editor placeholder */}
        <p className="text-f1-muted text-xs mt-3 text-center">
          Full event editor coming soon
        </p>
      </section>

      {/* Run button */}
      <button
        onClick={handleRun}
        className="w-full bg-f1-red text-white font-bold py-3 rounded-lg hover:opacity-90 transition-opacity"
      >
        Run Simulation →
      </button>
    </main>
  );
}
