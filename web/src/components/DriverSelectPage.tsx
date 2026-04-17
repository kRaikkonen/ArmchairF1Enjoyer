/**
 * Driver Select page — Step 2 of the three-step race setup flow.
 *
 * Displays all 20 drivers as a clickable grid.  The user taps one driver
 * to become the "player" (whose pit strategy they will influence in Step 3).
 * Team identity is conveyed through a left-border accent in the constructor
 * colour; clicking highlights the card in the same colour.
 */

import { useRaceStore } from '../store/raceStore';
import { teamColor } from '../engine/teamColors';

export function DriverSelectPage() {
  const setView           = useRaceStore((s) => s.setView);
  const trackModel        = useRaceStore((s) => s.trackModel);
  const drivers           = useRaceStore((s) => s.drivers);
  const selectedPlayerId  = useRaceStore((s) => s.selectedPlayerId);
  const setSelectedPlayer = useRaceStore((s) => s.setSelectedPlayerId);

  if (!trackModel) {
    return (
      <div className="p-8 text-center text-f1-muted">
        No track selected.{' '}
        <button className="text-f1-red underline" onClick={() => setView('home')}>
          Go back
        </button>
      </div>
    );
  }

  function handleContinue() {
    setView('whatif');
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      {/* Nav */}
      <button
        className="text-f1-muted text-sm mb-6 block"
        onClick={() => setView('home')}
      >
        ← Back
      </button>

      <h1 className="text-xl font-bold mb-1">Choose Your Driver</h1>
      <p className="text-f1-muted text-sm mb-6">
        {trackModel.event} {trackModel.season} · Select the driver whose strategy you will control
      </p>

      {/* Driver grid — 2 columns */}
      <ul className="grid grid-cols-2 gap-2 mb-8">
        {drivers.map((driver) => {
          const color     = teamColor(driver.team);
          const isSelected = driver.driverId === selectedPlayerId;

          return (
            <li key={driver.driverId}>
              <button
                onClick={() => setSelectedPlayer(driver.driverId)}
                style={
                  isSelected
                    ? { borderLeftColor: color, outline: `2px solid ${color}`, outlineOffset: '2px' }
                    : { borderLeftColor: color }
                }
                className={[
                  'w-full text-left rounded-lg px-3 py-3 border-l-4 transition-colors',
                  'bg-f1-mid border border-f1-border',
                  isSelected ? '' : 'hover:bg-f1-dark',
                ].join(' ')}
              >
                <div className="font-bold text-sm">{driver.driverId}</div>
                <div className="text-f1-muted text-xs mt-0.5">{driver.team}</div>
                <div className="text-f1-muted text-xs mt-0.5">P{driver.gridPosition}</div>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Action buttons */}
      <div className="space-y-2">
        <button
          onClick={handleContinue}
          disabled={!selectedPlayerId}
          className={[
            'w-full font-bold py-3 rounded-lg transition-opacity',
            selectedPlayerId
              ? 'bg-f1-red text-white hover:opacity-90'
              : 'bg-f1-mid text-f1-muted cursor-not-allowed',
          ].join(' ')}
        >
          {selectedPlayerId ? `Continue with ${selectedPlayerId} →` : 'Select a driver to continue'}
        </button>

        <button
          onClick={handleContinue}
          className="w-full text-f1-muted text-sm py-2 hover:text-f1-text transition-colors"
        >
          Skip — view base simulation
        </button>
      </div>
    </main>
  );
}
