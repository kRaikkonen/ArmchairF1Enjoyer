/**
 * What-If page — Step 3 of the three-step race setup flow.
 *
 * Shows four preset scenario cards.  Selecting a card reveals a small
 * configuration form (driver, lap, seconds, etc.).  "Run Simulation"
 * commits the chosen events to the store and kicks off the sim.
 *
 * Preset cards:
 *   1. Base            — no events, pure simulation
 *   2. Add Penalty     — add time penalty to a driver
 *   3. Safety Car      — deploy SC from a chosen lap for 5 laps
 *   4. Change Pit Lap  — force the player's pit on a specific lap
 */

import { useState } from 'react';
import { useRaceStore } from '../store/raceStore';
import type { EventEffect, Compound } from '../engine/types';

// ---------------------------------------------------------------------------
// Preset IDs
// ---------------------------------------------------------------------------
type PresetId = 'base' | 'penalty' | 'sc' | 'pit-change';

interface Preset {
  id: PresetId;
  icon: string;
  label: string;
  description: string;
}

const PRESETS: Preset[] = [
  {
    id: 'base',
    icon: '🏁',
    label: 'Base Scenario',
    description: 'No changes — simulate the race as-is.',
  },
  {
    id: 'penalty',
    icon: '⏱',
    label: 'Add Penalty',
    description: 'Apply a time penalty to any driver.',
  },
  {
    id: 'sc',
    icon: '🚗',
    label: 'Safety Car',
    description: 'Deploy the safety car from a chosen lap for 5 laps.',
  },
  {
    id: 'pit-change',
    icon: '🔧',
    label: 'Change Pit Lap',
    description: "Override your driver's pit stop lap.",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function WhatIfPage() {
  const setView          = useRaceStore((s) => s.setView);
  const trackModel       = useRaceStore((s) => s.trackModel);
  const drivers          = useRaceStore((s) => s.drivers);
  const selectedPlayerId = useRaceStore((s) => s.selectedPlayerId);
  const clearEvents      = useRaceStore((s) => s.clearEvents);
  const addEvent         = useRaceStore((s) => s.addEvent);
  const runSimulation    = useRaceStore((s) => s.runSimulation);

  const [selectedPreset, setSelectedPreset] = useState<PresetId>('base');

  // --- Penalty form state ---
  const [penaltyDriver, setPenaltyDriver] = useState<string>(
    selectedPlayerId ?? (drivers[0]?.driverId ?? ''),
  );
  const [penaltySec, setPenaltySec] = useState<number>(5);
  const [penaltyLap, setPenaltyLap] = useState<number>(10);

  // --- SC form state ---
  const [scLap, setScLap] = useState<number>(15);

  // --- Pit-change form state ---
  const [pitDriver, setPitDriver] = useState<string>(
    selectedPlayerId ?? (drivers[0]?.driverId ?? ''),
  );
  const [pitLap, setPitLap] = useState<number>(20);
  const [pitCompound, setPitCompound] = useState<Compound>('HARD');

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

  const totalLaps = 57; // Phase 1: Bahrain only

  function buildEvents(): EventEffect[] {
    switch (selectedPreset) {
      case 'base':
        return [];

      case 'penalty':
        return [
          {
            type: 'penalty',
            lap: Math.max(1, Math.min(penaltyLap, totalLaps)),
            driverId: penaltyDriver,
            penaltySec: Math.max(1, penaltySec),
          },
        ];

      case 'sc':
        return [
          {
            type: 'safety_car',
            lap: Math.max(1, Math.min(scLap, totalLaps - 1)),
            duration: 5,
          },
        ];

      case 'pit-change':
        return [
          {
            type: 'pit',
            lap: Math.max(1, Math.min(pitLap, totalLaps - 1)),
            driverId: pitDriver,
            compound: pitCompound,
          },
        ];
    }
  }

  function handleRun() {
    clearEvents();
    const events = buildEvents();
    events.forEach(addEvent);
    runSimulation();
    setView('result');
  }

  // Driver options for dropdowns
  const driverOptions = drivers.map((d) => d.driverId);

  return (
    <main className="max-w-lg mx-auto px-4 py-8">
      {/* Nav */}
      <button
        className="text-f1-muted text-sm mb-6 block"
        onClick={() => setView('driver-select')}
      >
        ← Back
      </button>

      <h1 className="text-xl font-bold mb-1">What-If Scenario</h1>
      <p className="text-f1-muted text-sm mb-6">
        {trackModel.event} {trackModel.season}
        {selectedPlayerId ? ` · ${selectedPlayerId}` : ''}
      </p>

      {/* Preset cards */}
      <ul className="space-y-2 mb-6">
        {PRESETS.map((preset) => {
          const isSelected = preset.id === selectedPreset;
          return (
            <li key={preset.id}>
              <button
                onClick={() => setSelectedPreset(preset.id)}
                className={[
                  'w-full text-left rounded-lg px-4 py-3 border transition-colors',
                  isSelected
                    ? 'border-f1-red bg-f1-mid'
                    : 'border-f1-border bg-f1-mid hover:border-f1-muted',
                ].join(' ')}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{preset.icon}</span>
                  <div>
                    <div className="font-semibold text-sm">{preset.label}</div>
                    <div className="text-f1-muted text-xs mt-0.5">
                      {preset.description}
                    </div>
                  </div>
                  {isSelected && (
                    <span className="ml-auto text-f1-red text-xs font-bold">
                      SELECTED
                    </span>
                  )}
                </div>
              </button>

              {/* Inline config form — only shown when card is selected */}
              {isSelected && preset.id !== 'base' && (
                <div className="mt-1 bg-f1-dark border border-f1-border rounded-lg px-4 py-3 space-y-3">
                  {preset.id === 'penalty' && (
                    <>
                      <FormRow label="Driver">
                        <Select
                          value={penaltyDriver}
                          options={driverOptions}
                          onChange={setPenaltyDriver}
                        />
                      </FormRow>
                      <FormRow label="On lap">
                        <NumberInput
                          value={penaltyLap}
                          min={1}
                          max={totalLaps}
                          onChange={setPenaltyLap}
                        />
                      </FormRow>
                      <FormRow label="Seconds">
                        <NumberInput
                          value={penaltySec}
                          min={1}
                          max={120}
                          onChange={setPenaltySec}
                        />
                      </FormRow>
                    </>
                  )}

                  {preset.id === 'sc' && (
                    <FormRow label="Deploy on lap">
                      <NumberInput
                        value={scLap}
                        min={1}
                        max={totalLaps - 1}
                        onChange={setScLap}
                      />
                    </FormRow>
                  )}

                  {preset.id === 'pit-change' && (
                    <>
                      <FormRow label="Driver">
                        <Select
                          value={pitDriver}
                          options={driverOptions}
                          onChange={setPitDriver}
                        />
                      </FormRow>
                      <FormRow label="Pit on lap">
                        <NumberInput
                          value={pitLap}
                          min={1}
                          max={totalLaps - 1}
                          onChange={setPitLap}
                        />
                      </FormRow>
                      <FormRow label="Compound">
                        <Select
                          value={pitCompound}
                          options={['SOFT', 'MEDIUM', 'HARD']}
                          onChange={(v) => setPitCompound(v as Compound)}
                        />
                      </FormRow>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

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

// ---------------------------------------------------------------------------
// Small form helpers — local to this file
// ---------------------------------------------------------------------------

function FormRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-xs text-f1-muted w-24 shrink-0">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-f1-mid border border-f1-border rounded px-2 py-1 text-sm text-f1-text"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

function NumberInput({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full bg-f1-mid border border-f1-border rounded px-2 py-1 text-sm text-f1-text"
    />
  );
}
