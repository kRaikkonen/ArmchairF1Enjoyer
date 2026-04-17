/**
 * Result page — side-by-side comparison view.
 *
 * Left column  : official race result (grey tones) from trackModel.results
 * Right column : simulated finishing order (bright, coloured)
 *
 * For each driver the position delta between actual and simulated is shown:
 *   ▲ green  = improved in simulation vs reality
 *   ▼ red    = dropped in simulation vs reality
 *   (blank)  = same position
 *
 * Top banner describes the What-If scenario that was applied.
 */

import { useState } from 'react';
import { useRaceStore } from '../store/raceStore';
import type { EventEffect, DriverState } from '../engine/types';
import { teamColor } from '../engine/teamColors';
import { buildShareUrl } from '../utils/shareUrl';

// ---------------------------------------------------------------------------
// Compound badge styling (self-contained — avoids Tailwind text-color conflict)
// ---------------------------------------------------------------------------
const COMPOUND_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  SOFT:   { bg: 'bg-red-600',    text: 'text-white',     label: 'S' },
  MEDIUM: { bg: 'bg-yellow-500', text: 'text-gray-900',  label: 'M' },
  HARD:   { bg: 'bg-gray-200',   text: 'text-gray-900',  label: 'H' },
  INTER:  { bg: 'bg-green-600',  text: 'text-white',     label: 'I' },
  WET:    { bg: 'bg-blue-600',   text: 'text-white',     label: 'W' },
};
const FALLBACK_STYLE = { bg: 'bg-f1-muted', text: 'text-white', label: '?' };

// ---------------------------------------------------------------------------
// Gap formatting
// ---------------------------------------------------------------------------
function formatGap(gapSec: number): string {
  if (gapSec < 60) return `+${gapSec.toFixed(1)}s`;
  const m = Math.floor(gapSec / 60);
  const s = (gapSec % 60).toFixed(1).padStart(4, '0');
  return `+${m}:${s}`;
}

// ---------------------------------------------------------------------------
// Scenario description — derived from events array
// ---------------------------------------------------------------------------
function describeScenario(events: EventEffect[]): string {
  if (events.length === 0) return 'Base simulation — no changes applied';
  const ev = events[0];
  switch (ev.type) {
    case 'penalty':
      return `If ${ev.driverId ?? 'a driver'} receives a ${ev.penaltySec ?? '?'}s time penalty`;
    case 'safety_car':
      return `If Safety Car deploys on lap ${ev.lap} for ${ev.duration ?? 5} laps`;
    case 'vsc':
      return `If VSC deploys on lap ${ev.lap} for ${ev.duration ?? 2} laps`;
    case 'pit':
      return `If ${ev.driverId ?? 'the driver'} pits on lap ${ev.lap} (${ev.compound ?? 'auto'})`;
    default:
      return 'Custom scenario';
  }
}

// ---------------------------------------------------------------------------
// Position delta badge
// ---------------------------------------------------------------------------
function DeltaBadge({ actual, simulated }: { actual: number; simulated: number }) {
  const delta = actual - simulated; // positive → improved (moved up in sim)
  if (delta === 0) return null;
  if (delta > 0) {
    return (
      <span className="text-green-400 text-xs font-bold ml-1">
        ▲{delta}
      </span>
    );
  }
  return (
    <span className="text-red-400 text-xs font-bold ml-1">
      ▼{Math.abs(delta)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ResultPage() {
  const setView            = useRaceStore((s) => s.setView);
  const result             = useRaceStore((s) => s.result);
  const trackModel         = useRaceStore((s) => s.trackModel);
  const seed               = useRaceStore((s) => s.seed);
  const events             = useRaceStore((s) => s.events);
  const selectedPlayerId   = useRaceStore((s) => s.selectedPlayerId);

  const [copied, setCopied] = useState(false);

  function handleCopyLink() {
    if (!trackModel) return;
    const url = buildShareUrl({
      track:  trackModel.event.toLowerCase(),
      season: trackModel.season,
      player: selectedPlayerId,
      events,
      seed,
    });
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      // Fallback: show url in prompt
      window.prompt('Copy this link:', url);
    });
  }

  if (!result || !trackModel) {
    return (
      <div className="p-8 text-center text-f1-muted">
        No result yet.{' '}
        <button className="text-f1-red underline" onClick={() => setView('home')}>
          Start over
        </button>
      </div>
    );
  }

  // Official results — may be absent for tracks without real-result data yet
  const actualResults = trackModel.results ?? [];
  const actualByDriver = new Map(actualResults.map((r) => [r.driverId, r]));

  // Simulated results
  const classified = result.finalOrder.filter((d) => !d.isRetired);
  const dnf        = result.finalOrder.filter((d) => d.isRetired);
  const leader     = classified[0] ?? result.finalOrder[0];

  // Build an ordered list for the actual column (match sim driver order where possible)
  const allSimDriverIds = result.finalOrder.map((d) => d.driverId);

  // Actual column: sort by actual position; append any sim-only drivers at end
  const actualOrdered = [
    ...actualResults.sort((a, b) => a.position - b.position),
  ];

  const scenario = describeScenario(events);
  const isBase   = events.length === 0;

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      {/* Nav */}
      <div className="flex items-center justify-between mb-4">
        <button className="text-f1-muted text-sm" onClick={() => setView('whatif')}>
          ← Edit scenario
        </button>
        <button className="text-f1-muted text-sm" onClick={() => setView('home')}>
          New race
        </button>
      </div>

      {/* Scenario banner */}
      <div
        className={[
          'rounded-lg px-4 py-3 mb-6 text-sm border',
          isBase
            ? 'bg-f1-mid border-f1-border text-f1-muted'
            : 'bg-f1-mid border-f1-red text-f1-text',
        ].join(' ')}
      >
        <span className="text-f1-muted mr-2 text-xs uppercase tracking-widest">
          {isBase ? 'Baseline' : 'What-If'}
        </span>
        {scenario}
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-2 gap-3 mb-2">
        <div className="text-xs uppercase tracking-widest text-f1-muted text-center">
          Actual Result
        </div>
        <div className="text-xs uppercase tracking-widest text-f1-red text-center">
          Simulated Result
        </div>
      </div>

      {/* Classified finishers — side by side */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* LEFT: actual results column */}
        <div className="space-y-1">
          {actualOrdered
            .filter((r) => !r.dnf)
            .map((actual) => (
              <ActualRow key={actual.driverId} position={actual.position} driverId={actual.driverId} team={actual.team} />
            ))}
        </div>

        {/* RIGHT: simulated results column */}
        <div className="space-y-1">
          {classified.map((driver, i) => {
            const gapSec = driver.totalTimeSec - leader.totalTimeSec;
            const gapStr = i === 0 ? 'WINNER' : formatGap(gapSec);
            const style  = COMPOUND_STYLE[driver.compound] ?? FALLBACK_STYLE;
            const actual = actualByDriver.get(driver.driverId);
            const color  = teamColor(driver.team);

            return (
              <SimRow
                key={driver.driverId}
                position={i + 1}
                driver={driver}
                gapStr={gapStr}
                compoundStyle={style}
                actualPosition={actual?.position}
                teamColor={color}
              />
            );
          })}
        </div>
      </div>

      {/* DNF section */}
      {(dnf.length > 0 || actualResults.some((r) => r.dnf)) && (
        <>
          <div className="text-xs uppercase tracking-widest text-f1-muted mb-2 mt-4">
            DNF / Not Classified
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              {actualResults
                .filter((r) => r.dnf)
                .map((r) => (
                  <ActualRow key={r.driverId} position={r.position} driverId={r.driverId} team={r.team} dnf />
                ))}
            </div>
            <div className="space-y-1">
              {dnf.map((driver) => {
                const style = COMPOUND_STYLE[driver.compound] ?? FALLBACK_STYLE;
                return (
                  <SimRow
                    key={driver.driverId}
                    position={0}
                    driver={driver}
                    gapStr="DNF"
                    compoundStyle={style}
                    teamColor={teamColor(driver.team)}
                    isDnf
                  />
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Share button */}
      <div className="mt-6 flex justify-center">
        <button
          onClick={handleCopyLink}
          className={[
            'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors',
            copied
              ? 'border-green-500 text-green-400 bg-f1-mid'
              : 'border-f1-border text-f1-muted bg-f1-mid hover:border-f1-red hover:text-f1-text',
          ].join(' ')}
        >
          {copied ? '✓ Copied!' : '🔗 Copy share link'}
        </button>
      </div>

      {/* Footer */}
      <p className="text-f1-muted text-xs mt-4 text-center">
        {trackModel.event} {trackModel.season} · {result.lapHistory.length} laps · seed {seed}
        {dnf.length > 0 && ` · ${dnf.length} DNF`}
      </p>

      {/* Drivers that appeared in sim but not in actual (edge case) */}
      {allSimDriverIds.filter((id) => !actualByDriver.has(id)).length > 0 && (
        <p className="text-f1-muted text-xs mt-1 text-center">
          * Some simulated drivers have no official result to compare against.
        </p>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ActualRow({
  position,
  driverId,
  team,
  dnf = false,
}: {
  position: number;
  driverId: string;
  team: string;
  dnf?: boolean;
}) {
  const color = teamColor(team);
  return (
    <div
      className={[
        'flex items-center gap-2 px-2 py-1.5 rounded text-xs border border-f1-border',
        dnf ? 'opacity-40' : 'opacity-70',
      ].join(' ')}
      style={{ borderLeftColor: color, borderLeftWidth: '3px' }}
    >
      <span className="text-f1-muted w-5 text-right font-mono">
        {dnf ? '—' : position}
      </span>
      <span className="font-bold text-f1-muted">{driverId}</span>
      {dnf && <span className="text-red-400 text-xs ml-auto">DNF</span>}
    </div>
  );
}

function SimRow({
  position,
  driver,
  gapStr,
  compoundStyle,
  actualPosition,
  teamColor: color,
  isDnf = false,
}: {
  position: number;
  driver: DriverState;
  gapStr: string;
  compoundStyle: { bg: string; text: string; label: string };
  actualPosition?: number;
  teamColor: string;
  isDnf?: boolean;
}) {
  return (
    <div
      className={[
        'flex items-center gap-1.5 px-2 py-1.5 rounded text-xs border',
        isDnf
          ? 'border-f1-border opacity-50'
          : 'border-f1-border bg-f1-mid',
      ].join(' ')}
      style={{ borderLeftColor: color, borderLeftWidth: '3px' }}
    >
      <span className="text-f1-text w-5 text-right font-mono font-bold">
        {isDnf ? '—' : position}
      </span>
      <span className="font-bold text-f1-text">{driver.driverId}</span>
      {actualPosition !== undefined && !isDnf && (
        <DeltaBadge actual={actualPosition} simulated={position} />
      )}
      <span className="ml-auto font-mono text-f1-muted text-xs">
        {gapStr}
      </span>
      <span
        className={`inline-block px-1 py-0.5 rounded font-bold ${compoundStyle.bg} ${compoundStyle.text}`}
      >
        {compoundStyle.label}
      </span>
    </div>
  );
}
