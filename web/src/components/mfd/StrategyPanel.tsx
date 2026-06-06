/**
 * Strategy panel — the What-If injection console (Phase 3, step 2b).
 *
 * The controlled driver's strategy is a list of STINTS, so you can build a
 * multi-stop race and pick the engine mode per stint (not one global toggle):
 *   - start stint: fixed start compound (from the grid) + an engine mode
 *   - each added pit: lap + out-compound + engine mode for the new stint
 *
 * Each control maps to a real engine input so "重新推演" changes the sim:
 *   pit lap + compound → `pit` events; per-stint engine mode → `ers_mode`
 *   events at each stint boundary; 罚时/SC/VSC/雨天 → penalty/safety_car/vsc/rain;
 *   路面温度 → trackTempC. Only engine-modelled events are exposed.
 */
import { useState } from 'react';
import type { Compound, ErsMode, EventEffect } from '../../engine/types';

interface StrategyPanelProps {
  playerId: string;
  totalLaps: number;
  /** Grid start compound for the controlled driver (from buildDriversFromModel). */
  startCompound: Compound;
  /** Controlled driver's REAL pit stops (defaults the stint list to reality). */
  realPits?: { lap: number; compound: Compound }[];
  /** Real safety car (defaults the SC toggle to the real race). */
  realSc?: { lap: number; duration: number } | null;
  isRunning: boolean;
  onRun: (events: EventEffect[]) => void;
  onReset: () => void;
}

interface Pit { lap: number; compound: Compound; ersMode: ErsMode; }

const MAX_PITS = 3;
const COMPOUNDS: { v: Compound; label: string }[] = [
  { v: 'SOFT', label: '软' }, { v: 'MEDIUM', label: '中' }, { v: 'HARD', label: '硬' },
  { v: 'INTER', label: '中性(雨)' }, { v: 'WET', label: '湿胎(雨)' },
];
const ERS_MODES: { v: ErsMode; label: string }[] = [
  { v: 'neutral', label: '标准' }, { v: 'attack', label: '激进' }, { v: 'save', label: '节能' },
];
const COMPOUND_LABEL: Record<string, string> = { SOFT: '软', MEDIUM: '中', HARD: '硬', INTER: '中性', WET: '湿' };

export function StrategyPanel({ playerId, totalLaps, startCompound, realPits, realSc, isRunning, onRun, onReset }: StrategyPanelProps) {
  const [startErs, setStartErs] = useState<ErsMode>('neutral');
  // Default the stint list to the driver's REAL strategy (the player tweaks it).
  const [pits, setPits] = useState<Pit[]>(() =>
    realPits && realPits.length
      ? realPits.map((p) => ({ lap: p.lap, compound: p.compound, ersMode: 'neutral' as ErsMode }))
      : [{ lap: Math.max(2, Math.round(totalLaps / 2.6)), compound: 'HARD', ersMode: 'neutral' }],
  );

  const [penOn, setPenOn]   = useState(false);
  const [penSec, setPenSec] = useState(5);
  const [scOn, setScOn]     = useState(!!realSc);
  const [scLap, setScLap]   = useState(realSc?.lap ?? Math.round(totalLaps / 3));
  const [scDur, setScDur]   = useState(realSc?.duration ?? 3);
  const [vscOn, setVscOn]   = useState(false);
  const [vscLap, setVscLap] = useState(Math.round(totalLaps / 2.5));
  const [rainOn, setRainOn] = useState(false);
  const [rainLap, setRainLap] = useState(Math.round(totalLaps / 2));

  function setPit(i: number, patch: Partial<Pit>) {
    setPits((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }
  function addPit() {
    setPits((ps) => {
      if (ps.length >= MAX_PITS) return ps;
      const lastLap = ps[ps.length - 1]?.lap ?? Math.round(totalLaps / 3);
      const lap = Math.min(totalLaps - 1, lastLap + Math.round(totalLaps / 4));
      return [...ps, { lap, compound: 'SOFT', ersMode: 'neutral' }];
    });
  }
  function removePit(i: number) {
    setPits((ps) => (ps.length <= 1 ? ps : ps.filter((_, j) => j !== i)));
  }

  function run() {
    const ev: EventEffect[] = [];
    let prevMode: ErsMode = startErs;
    if (startErs !== 'neutral') ev.push({ type: 'ers_mode', lap: 1, driverId: playerId, ersMode: startErs });
    for (const p of [...pits].sort((a, b) => a.lap - b.lap)) {
      ev.push({ type: 'pit', lap: p.lap, driverId: playerId, compound: p.compound });
      if (p.ersMode !== prevMode) ev.push({ type: 'ers_mode', lap: p.lap, driverId: playerId, ersMode: p.ersMode });
      prevMode = p.ersMode;
    }
    if (penOn) ev.push({ type: 'penalty', lap: 1, driverId: playerId, penaltySec: penSec });
    if (scOn)  ev.push({ type: 'safety_car', lap: scLap, duration: scDur });
    if (vscOn) ev.push({ type: 'vsc', lap: vscLap });
    if (rainOn) ev.push({ type: 'rain', lap: rainLap, isWet: true });
    onRun(ev);
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-f1-muted uppercase tracking-widest">车手策略</span>
        <span className="text-[10px] text-f1-muted">接管 <b className="text-f1-orange">{playerId}</b></span>
      </div>

      {/* Stint 0 (start) */}
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-f1-muted w-12">起步</span>
        <span className="px-1.5 py-0.5 rounded bg-f1-mid text-f1-text font-mono">{COMPOUND_LABEL[startCompound] ?? startCompound}</span>
        <span className="text-f1-muted ml-auto">引擎</span>
        <ErsSelect value={startErs} onChange={setStartErs} />
      </div>

      {/* Pit stints */}
      {pits.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5 text-[11px] border-l-2 border-f1-orange/40 pl-2">
          <span className="text-f1-muted">进站{i + 1} L</span>
          <input type="number" min={2} max={totalLaps - 1} value={p.lap}
            onChange={(e) => setPit(i, { lap: Number(e.target.value) })}
            className="w-11 bg-f1-mid border border-f1-border rounded px-1 py-0.5 text-xs text-center" />
          <span className="text-f1-muted">→</span>
          <CompoundSelect value={p.compound} onChange={(v) => setPit(i, { compound: v })} />
          <ErsSelect value={p.ersMode} onChange={(v) => setPit(i, { ersMode: v })} />
          {pits.length > 1 && (
            <button onClick={() => removePit(i)} className="ml-auto text-f1-muted hover:text-f1-red text-sm leading-none">×</button>
          )}
        </div>
      ))}
      {pits.length < MAX_PITS && (
        <button onClick={addPit} className="text-[10px] text-f1-orange hover:underline">+ 增加进站（多停）</button>
      )}

      {/* Events */}
      <div className="space-y-1.5 border-t border-f1-border pt-2">
        <div className="text-[10px] text-f1-muted uppercase tracking-widest">事件注入</div>
        <EventRow on={penOn} onToggle={() => setPenOn(!penOn)} label={`罚时 ${playerId}`}>
          <NumBox value={penSec} min={1} max={60} onChange={setPenSec} suffix="s" />
        </EventRow>
        <EventRow on={scOn} onToggle={() => setScOn(!scOn)} label="安全车 SC">
          <div className="flex items-center gap-1">
            <NumBox value={scLap} min={1} max={totalLaps} onChange={setScLap} prefix="L" />
            <NumBox value={scDur} min={1} max={10} onChange={setScDur} suffix="圈" />
          </div>
        </EventRow>
        <EventRow on={vscOn} onToggle={() => setVscOn(!vscOn)} label="虚拟安全车 VSC">
          <NumBox value={vscLap} min={1} max={totalLaps} onChange={setVscLap} prefix="L" />
        </EventRow>
        <EventRow on={rainOn} onToggle={() => setRainOn(!rainOn)} label="雨天 从">
          <NumBox value={rainLap} min={1} max={totalLaps} onChange={setRainLap} prefix="L" />
        </EventRow>
      </div>

      <div className="flex gap-2">
        <button onClick={run} disabled={isRunning}
          className="flex-1 bg-f1-orange text-white font-bold py-2 rounded-lg text-sm hover:opacity-90 active:scale-[0.99] transition disabled:opacity-50">
          {isRunning ? '推演中…' : '重新推演 ▶'}
        </button>
        <button onClick={onReset} disabled={isRunning}
          className="px-3 py-2 rounded-lg text-xs border border-f1-border text-f1-muted hover:text-f1-text hover:border-f1-muted transition disabled:opacity-50">
          重置基准
        </button>
      </div>
    </div>
  );
}

function CompoundSelect({ value, onChange }: { value: Compound; onChange: (v: Compound) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Compound)}
      className="bg-f1-mid border border-f1-border rounded px-1 py-0.5 text-xs text-f1-text">
      {COMPOUNDS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
    </select>
  );
}
function ErsSelect({ value, onChange }: { value: ErsMode; onChange: (v: ErsMode) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as ErsMode)}
      className="bg-f1-mid border border-f1-border rounded px-1 py-0.5 text-xs text-f1-text">
      {ERS_MODES.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
    </select>
  );
}
function EventRow({ on, onToggle, label, children }: { on: boolean; onToggle: () => void; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onToggle}
        className={['px-2 py-0.5 rounded text-[10px] font-medium border transition-colors shrink-0 w-32 text-left',
          on ? 'bg-yellow-500 text-gray-900 border-yellow-500' : 'bg-f1-mid border-f1-border text-f1-muted hover:text-f1-text'].join(' ')}>
        {on ? '● ' : '○ '}{label}
      </button>
      <div className={on ? '' : 'opacity-30 pointer-events-none'}>{children}</div>
    </div>
  );
}
function NumBox({ value, min, max, onChange, prefix, suffix }: { value: number; min: number; max: number; onChange: (n: number) => void; prefix?: string; suffix?: string }) {
  return (
    <div className="flex items-center gap-0.5 text-[10px] text-f1-muted">
      {prefix}
      <input type="number" value={value} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))}
        className="w-12 bg-f1-mid border border-f1-border rounded px-1 py-0.5 text-xs text-f1-text text-center" />
      {suffix}
    </div>
  );
}
