/**
 * Pit Console — bottom of the center panel.
 * Controls: pit lap slider, tyre selection, engine mode, track temp, re-simulate.
 *
 * All state is local for Phase 2 skeleton; real simulation hook-up is Phase 3.
 */
import { useState } from 'react';
import { t } from '../../i18n';

interface TireOption {
  compound: string;   // e.g. 'C3'
  name: string;       // 中
  life: number;       // laps
  healthPct: { soft: number; medium: number; hard: number };
}

// Phase 2 mock tire options — not from model
const TIRE_OPTIONS: TireOption[] = [
  {
    compound: 'C4', name: '软',  life: 18,
    healthPct: { soft: 100, medium: 0, hard: 100 },
  },
  {
    compound: 'C3', name: '中',  life: 30,
    healthPct: { soft: 80, medium: 100, hard: 100 },
  },
  {
    compound: 'C2', name: '硬',  life: 45,
    healthPct: { soft: 100, medium: 100, hard: 100 },
  },
];

interface PitConsoleProps {
  totalLaps: number;
  currentLap: number;
  onReSimulate: (pitLap: number, compound: string, engineMode: string, trackTemp: number) => void;
}

export function PitConsole({ totalLaps, currentLap, onReSimulate }: PitConsoleProps) {
  const [pitLap, setPitLap]       = useState(Math.min(currentLap + 2, totalLaps - 5));
  const [tireIdx, setTireIdx]     = useState(1); // default C3
  const [engineMode, setEngineMode] = useState('standard');
  const [trackTemp, setTrackTemp] = useState(31);

  const tire = TIRE_OPTIONS[tireIdx];

  // Health bar colours (UI constants)
  const healthColor = (pct: number) =>
    pct > 80 ? 'bg-green-500' : pct > 40 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="border-t border-f1-border bg-f1-surface p-3 space-y-3">

      {/* Tyre health preview */}
      <div>
        <div className="text-[10px] text-f1-muted uppercase tracking-widest mb-1.5">
          {t('pit.tireHealth')}
        </div>
        {[
          { label: t('pit.health.soft'),   pct: tire.healthPct.soft   },
          { label: t('pit.health.medium'), pct: tire.healthPct.medium },
          { label: t('pit.health.hard'),   pct: tire.healthPct.hard   },
        ].map(({ label, pct }) => (
          <div key={label} className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-f1-muted w-4 text-right">{label}</span>
            <div className="flex-1 h-2 bg-f1-border rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${healthColor(pct)}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-f1-muted w-8 text-right">
              {pct}%
            </span>
          </div>
        ))}
      </div>

      {/* Controls grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">

        {/* Pit lap slider */}
        <div className="col-span-2">
          <div className="flex justify-between text-[10px] text-f1-muted mb-1">
            <span>{t('pit.lapLabel')}</span>
            <span className="font-mono text-f1-orange">
              {t('pit.lapValue', { lap: pitLap })}
            </span>
          </div>
          <input
            type="range"
            min={currentLap + 1}
            max={totalLaps - 2}
            value={pitLap}
            onChange={(e) => setPitLap(Number(e.target.value))}
            className="w-full accent-f1-orange h-1.5"
          />
        </div>

        {/* Tyre selector */}
        <div>
          <div className="flex justify-between text-[10px] text-f1-muted mb-1">
            <span>{t('pit.tireLabel')}</span>
            <span className="font-mono text-f1-muted">
              {tire.compound}·{tire.name}·寿命{tire.life}圈
            </span>
          </div>
          <select
            value={tireIdx}
            onChange={(e) => setTireIdx(Number(e.target.value))}
            className="w-full bg-f1-mid border border-f1-border rounded px-2 py-1 text-xs text-f1-text"
          >
            {TIRE_OPTIONS.map((o, i) => (
              <option key={o.compound} value={i}>
                {o.name} ({o.compound}{o.name}) 寿命{o.life}圈
              </option>
            ))}
          </select>
        </div>

        {/* Engine mode */}
        <div>
          <div className="text-[10px] text-f1-muted mb-1">
            <span>{t('pit.engineLabel')}</span>
            <span className="float-right font-mono text-f1-muted">
              {engineMode === 'standard' ? '标准模式' : engineMode === 'attack' ? '激进模式' : '节能模式'}
            </span>
          </div>
          <select
            value={engineMode}
            onChange={(e) => setEngineMode(e.target.value)}
            className="w-full bg-f1-mid border border-f1-border rounded px-2 py-1 text-xs text-f1-text"
          >
            <option value="standard">{t('pit.engine.standard')}</option>
            <option value="attack">{t('pit.engine.attack')}</option>
            <option value="save">{t('pit.engine.save')}</option>
          </select>
        </div>

        {/* Track temp */}
        <div className="col-span-2">
          <div className="flex justify-between text-[10px] text-f1-muted mb-1">
            <span>{t('pit.tempLabel')}</span>
            <span className="font-mono text-f1-muted">
              {t('pit.tempValue', { temp: trackTemp })}
            </span>
          </div>
          <input
            type="range"
            min={15}
            max={55}
            value={trackTemp}
            onChange={(e) => setTrackTemp(Number(e.target.value))}
            className="w-full accent-f1-orange h-1.5"
          />
        </div>
      </div>

      {/* Re-simulate button */}
      <button
        onClick={() => onReSimulate(pitLap, tire.compound, engineMode, trackTemp)}
        className="w-full bg-f1-orange text-white font-bold py-2 rounded-lg text-sm
                   hover:opacity-90 active:scale-[0.99] transition-all"
      >
        {t('pit.runBtn')}
      </button>
    </div>
  );
}
