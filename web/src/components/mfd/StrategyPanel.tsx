/**
 * Strategy panel — the What-If injection console (Phase 3, step 2b).
 *
 * Controlled driver's strategy is a list of STINTS (multi-stop, per-stint engine
 * mode). Race events (Safety Car / VSC / rain) are a separate add-as-many-as-you
 * -want LIST — just like pit stops — so you can stack multiple SC periods, VSC
 * periods and rain on/off changes. Penalty is a per-driver toggle.
 *
 * Every control maps to a real engine input so "重新推演" changes the sim.
 */
import { useState } from 'react';
import type { Compound, ErsMode, EventEffect } from '../../engine/types';

interface StrategyPanelProps {
  playerId: string;
  totalLaps: number;
  startCompound: Compound;
  /** Controlled driver's REAL pit stops (defaults the stint list to reality). */
  realPits?: { lap: number; compound: Compound }[];
  /** Real safety-car periods (default the event list to the real race). */
  realSafetyCars?: { lap: number; duration: number }[];
  isRunning: boolean;
  onRun: (events: EventEffect[]) => void;
  onReset: () => void;
}

interface Pit { lap: number; compound: Compound; ersMode: ErsMode; }
type EvtKind = 'safety_car' | 'vsc' | 'rain';
interface RaceEvt { kind: EvtKind; lap: number; duration: number; isWet: boolean; }

const MAX_PITS = 3;
const MAX_EVTS = 6;
const COMPOUNDS: { v: Compound; label: string }[] = [
  { v: 'SOFT', label: '软' }, { v: 'MEDIUM', label: '中' }, { v: 'HARD', label: '硬' },
  { v: 'INTER', label: '中性(雨)' }, { v: 'WET', label: '湿胎(雨)' },
];
const ERS_MODES: { v: ErsMode; label: string }[] = [
  { v: 'neutral', label: '标准' }, { v: 'attack', label: '激进' }, { v: 'save', label: '节能' },
];
const EVT_KINDS: { v: EvtKind; label: string }[] = [
  { v: 'safety_car', label: '安全车 SC' }, { v: 'vsc', label: 'VSC' }, { v: 'rain', label: '雨天' },
];
const COMPOUND_LABEL: Record<string, string> = { SOFT: '软', MEDIUM: '中', HARD: '硬', INTER: '中性', WET: '湿' };

export function StrategyPanel({ playerId, totalLaps, startCompound, realPits, realSafetyCars, isRunning, onRun, onReset }: StrategyPanelProps) {
  const [startErs, setStartErs] = useState<ErsMode>('neutral');
  const [pits, setPits] = useState<Pit[]>(() =>
    realPits && realPits.length
      ? realPits.map((p) => ({ lap: p.lap, compound: p.compound, ersMode: 'neutral' as ErsMode }))
      : [{ lap: Math.max(2, Math.round(totalLaps / 2.6)), compound: 'HARD', ersMode: 'neutral' }],
  );

  const [penOn, setPenOn]   = useState(false);
  const [penSec, setPenSec] = useState(5);

  // Race events default to the real race (e.g. the real Safety Car).
  const [raceEvts, setRaceEvts] = useState<RaceEvt[]>(() =>
    (realSafetyCars ?? []).map((sc) => ({ kind: 'safety_car' as EvtKind, lap: sc.lap, duration: sc.duration, isWet: true })),
  );

  function setPit(i: number, patch: Partial<Pit>) {
    setPits((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }
  function addPit() {
    setPits((ps) => {
      if (ps.length >= MAX_PITS) return ps;
      const lastLap = ps[ps.length - 1]?.lap ?? Math.round(totalLaps / 3);
      return [...ps, { lap: Math.min(totalLaps - 1, lastLap + Math.round(totalLaps / 4)), compound: 'SOFT', ersMode: 'neutral' }];
    });
  }
  function removePit(i: number) { setPits((ps) => (ps.length <= 1 ? ps : ps.filter((_, j) => j !== i))); }

  function setEvt(i: number, patch: Partial<RaceEvt>) {
    setRaceEvts((es) => es.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  }
  function addEvt() {
    setRaceEvts((es) => (es.length >= MAX_EVTS ? es : [...es, { kind: 'safety_car', lap: Math.round(totalLaps / 2), duration: 3, isWet: true }]));
  }
  function removeEvt(i: number) { setRaceEvts((es) => es.filter((_, j) => j !== i)); }

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
    for (const e of raceEvts) {
      if (e.kind === 'rain') ev.push({ type: 'rain', lap: e.lap, isWet: e.isWet });
      else ev.push({ type: e.kind, lap: e.lap, duration: e.duration });
    }
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

      {/* Penalty (per controlled driver) */}
      <div className="border-t border-f1-border pt-2 flex items-center gap-2">
        <button onClick={() => setPenOn(!penOn)}
          className={['px-2 py-0.5 rounded text-[10px] font-medium border transition-colors w-32 text-left',
            penOn ? 'bg-yellow-500 text-gray-900 border-yellow-500' : 'bg-f1-mid border-f1-border text-f1-muted hover:text-f1-text'].join(' ')}>
          {penOn ? '● ' : '○ '}罚时 {playerId}
        </button>
        <div className={penOn ? 'flex items-center gap-0.5 text-[10px] text-f1-muted' : 'opacity-30 pointer-events-none flex items-center gap-0.5 text-[10px] text-f1-muted'}>
          +<input type="number" value={penSec} min={1} max={60} onChange={(e) => setPenSec(Number(e.target.value))}
            className="w-12 bg-f1-mid border border-f1-border rounded px-1 py-0.5 text-xs text-center" />s
        </div>
      </div>

      {/* Race events — add as many as you like (SC / VSC / rain) */}
      <div className="space-y-1.5">
        <div className="text-[10px] text-f1-muted uppercase tracking-widest">赛会事件</div>
        {raceEvts.map((e, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[11px] border-l-2 border-yellow-500/40 pl-2">
            <select value={e.kind} onChange={(ev) => setEvt(i, { kind: ev.target.value as EvtKind })}
              className="bg-f1-mid border border-f1-border rounded px-1 py-0.5 text-xs text-f1-text">
              {EVT_KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}
            </select>
            <span className="text-f1-muted">L</span>
            <input type="number" min={1} max={totalLaps} value={e.lap}
              onChange={(ev) => setEvt(i, { lap: Number(ev.target.value) })}
              className="w-11 bg-f1-mid border border-f1-border rounded px-1 py-0.5 text-xs text-center" />
            {e.kind === 'rain' ? (
              <select value={e.isWet ? '1' : '0'} onChange={(ev) => setEvt(i, { isWet: ev.target.value === '1' })}
                className="bg-f1-mid border border-f1-border rounded px-1 py-0.5 text-xs text-f1-text">
                <option value="1">转湿</option><option value="0">转干</option>
              </select>
            ) : (
              <>
                <input type="number" min={1} max={10} value={e.duration}
                  onChange={(ev) => setEvt(i, { duration: Number(ev.target.value) })}
                  className="w-9 bg-f1-mid border border-f1-border rounded px-1 py-0.5 text-xs text-center" />
                <span className="text-f1-muted">圈</span>
              </>
            )}
            <button onClick={() => removeEvt(i)} className="ml-auto text-f1-muted hover:text-f1-red text-sm leading-none">×</button>
          </div>
        ))}
        {raceEvts.length < MAX_EVTS && (
          <button onClick={addEvt} className="text-[10px] text-yellow-500 hover:underline">+ 增加赛会事件</button>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={run} disabled={isRunning}
          className="flex-1 bg-f1-orange text-white font-bold py-2 rounded-lg text-sm hover:opacity-90 active:scale-[0.99] transition disabled:opacity-50">
          {isRunning ? '推演中…' : '重新推演 ▶'}
        </button>
        <button onClick={onReset} disabled={isRunning}
          className="px-3 py-2 rounded-lg text-xs border border-f1-border text-f1-muted hover:text-f1-text hover:border-f1-muted transition disabled:opacity-50">
          重置真实
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
