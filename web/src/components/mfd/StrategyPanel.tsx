/**
 * Strategy panel — the What-If injection console (Phase 3, step 2b).
 *
 * - Controlled driver's strategy = a list of STINTS (multi-stop, per-stint
 *   engine mode, and a per-stop "slow stop" extra time for botched/slow pit
 *   crews).
 * - Race events = an add-as-many-as-you-want LIST: Safety Car / VSC / rain /
 *   penalty. Penalty carries its own driver (any car, multiple penalties), so
 *   it matches reality where different drivers get penalised.
 *
 * Every control maps to a real engine input so "重新推演" changes the sim.
 */
import { useState } from 'react';
import type { Compound, ErsMode, EventEffect } from '../../engine/types';
import { PIT_STOP_TIME_SEC } from '../../engine/events';

interface StrategyPanelProps {
  playerId: string;
  totalLaps: number;
  startCompound: Compound;
  driverIds: string[];
  realPits?: { lap: number; compound: Compound }[];
  realSafetyCars?: { lap: number; duration: number }[];
  isRunning: boolean;
  onRun: (events: EventEffect[]) => void;
  onReset: () => void;
}

interface Pit { lap: number; compound: Compound; ersMode: ErsMode; slowSec: number; }
type EvtKind = 'safety_car' | 'vsc' | 'rain' | 'penalty';
interface RaceEvt { kind: EvtKind; lap: number; duration: number; isWet: boolean; driverId: string; penaltySec: number; }

const MAX_PITS = 3;
const MAX_EVTS = 8;
const COMPOUNDS: { v: Compound; label: string }[] = [
  { v: 'SOFT', label: '软' }, { v: 'MEDIUM', label: '中' }, { v: 'HARD', label: '硬' },
  { v: 'INTER', label: '中性(雨)' }, { v: 'WET', label: '湿胎(雨)' },
];
const ERS_MODES: { v: ErsMode; label: string }[] = [
  { v: 'neutral', label: '标准' }, { v: 'attack', label: '激进' }, { v: 'save', label: '节能' },
];
const EVT_KINDS: { v: EvtKind; label: string }[] = [
  { v: 'safety_car', label: '安全车 SC' }, { v: 'vsc', label: 'VSC' }, { v: 'rain', label: '雨天' }, { v: 'penalty', label: '罚时' },
];
const COMPOUND_LABEL: Record<string, string> = { SOFT: '软', MEDIUM: '中', HARD: '硬', INTER: '中性', WET: '湿' };

export function StrategyPanel({ playerId, totalLaps, startCompound, driverIds, realPits, realSafetyCars, isRunning, onRun, onReset }: StrategyPanelProps) {
  const [startErs, setStartErs] = useState<ErsMode>('neutral');
  const [pits, setPits] = useState<Pit[]>(() =>
    realPits && realPits.length
      ? realPits.map((p) => ({ lap: p.lap, compound: p.compound, ersMode: 'neutral' as ErsMode, slowSec: 0 }))
      : [{ lap: Math.max(2, Math.round(totalLaps / 2.6)), compound: 'HARD', ersMode: 'neutral', slowSec: 0 }],
  );
  const [raceEvts, setRaceEvts] = useState<RaceEvt[]>(() =>
    (realSafetyCars ?? []).map((sc) => ({ kind: 'safety_car' as EvtKind, lap: sc.lap, duration: sc.duration, isWet: true, driverId: playerId, penaltySec: 5 })),
  );

  function setPit(i: number, patch: Partial<Pit>) { setPits((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p))); }
  function addPit() {
    setPits((ps) => {
      if (ps.length >= MAX_PITS) return ps;
      const lastLap = ps[ps.length - 1]?.lap ?? Math.round(totalLaps / 3);
      return [...ps, { lap: Math.min(totalLaps - 1, lastLap + Math.round(totalLaps / 4)), compound: 'SOFT', ersMode: 'neutral', slowSec: 0 }];
    });
  }
  function removePit(i: number) { setPits((ps) => (ps.length <= 1 ? ps : ps.filter((_, j) => j !== i))); }

  function setEvt(i: number, patch: Partial<RaceEvt>) { setRaceEvts((es) => es.map((e, j) => (j === i ? { ...e, ...patch } : e))); }
  function addEvt() {
    setRaceEvts((es) => (es.length >= MAX_EVTS ? es : [...es, { kind: 'safety_car', lap: Math.round(totalLaps / 2), duration: 3, isWet: true, driverId: playerId, penaltySec: 5 }]));
  }
  function removeEvt(i: number) { setRaceEvts((es) => es.filter((_, j) => j !== i)); }

  function run() {
    const ev: EventEffect[] = [];
    let prevMode: ErsMode = startErs;
    if (startErs !== 'neutral') ev.push({ type: 'ers_mode', lap: 1, driverId: playerId, ersMode: startErs });
    for (const p of [...pits].sort((a, b) => a.lap - b.lap)) {
      ev.push({ type: 'pit', lap: p.lap, driverId: playerId, compound: p.compound, ...(p.slowSec > 0 ? { pitTimeSec: PIT_STOP_TIME_SEC + p.slowSec } : {}) });
      if (p.ersMode !== prevMode) ev.push({ type: 'ers_mode', lap: p.lap, driverId: playerId, ersMode: p.ersMode });
      prevMode = p.ersMode;
    }
    for (const e of raceEvts) {
      if (e.kind === 'rain') ev.push({ type: 'rain', lap: e.lap, isWet: e.isWet });
      else if (e.kind === 'penalty') ev.push({ type: 'penalty', lap: e.lap, driverId: e.driverId, penaltySec: e.penaltySec });
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
        <div key={i} className="border-l-2 border-f1-orange/40 pl-2 text-[11px] space-y-1">
          <div className="flex items-center gap-1.5">
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
          <div className="flex items-center gap-1 text-[10px] text-f1-muted pl-1">
            <span>换胎慢停 +</span>
            <input type="number" min={0} max={30} value={p.slowSec}
              onChange={(e) => setPit(i, { slowSec: Number(e.target.value) })}
              className="w-10 bg-f1-mid border border-f1-border rounded px-1 py-0.5 text-xs text-center" />
            <span>s（默认 {PIT_STOP_TIME_SEC.toFixed(1)}s 进站损失）</span>
          </div>
        </div>
      ))}
      {pits.length < MAX_PITS && (
        <button onClick={addPit} className="text-[10px] text-f1-orange hover:underline">+ 增加进站（多停）</button>
      )}

      {/* Race events — add as many as you like (SC / VSC / rain / penalty) */}
      <div className="space-y-1.5 border-t border-f1-border pt-2">
        <div className="text-[10px] text-f1-muted uppercase tracking-widest">赛会事件</div>
        {raceEvts.map((e, i) => (
          <div key={i} className="flex items-center gap-1 text-[11px] border-l-2 border-yellow-500/40 pl-2">
            <select value={e.kind} onChange={(ev) => setEvt(i, { kind: ev.target.value as EvtKind })}
              className="bg-f1-mid border border-f1-border rounded px-1 py-0.5 text-xs text-f1-text">
              {EVT_KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}
            </select>
            {e.kind === 'penalty' && (
              <select value={e.driverId} onChange={(ev) => setEvt(i, { driverId: ev.target.value })}
                className="bg-f1-mid border border-f1-border rounded px-1 py-0.5 text-xs text-f1-text">
                {driverIds.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
            <span className="text-f1-muted">L</span>
            <input type="number" min={1} max={totalLaps} value={e.lap}
              onChange={(ev) => setEvt(i, { lap: Number(ev.target.value) })}
              className="w-10 bg-f1-mid border border-f1-border rounded px-1 py-0.5 text-xs text-center" />
            {e.kind === 'rain' ? (
              <select value={e.isWet ? '1' : '0'} onChange={(ev) => setEvt(i, { isWet: ev.target.value === '1' })}
                className="bg-f1-mid border border-f1-border rounded px-1 py-0.5 text-xs text-f1-text">
                <option value="1">转湿</option><option value="0">转干</option>
              </select>
            ) : e.kind === 'penalty' ? (
              <><span className="text-f1-muted">+</span>
                <input type="number" min={1} max={60} value={e.penaltySec}
                  onChange={(ev) => setEvt(i, { penaltySec: Number(ev.target.value) })}
                  className="w-9 bg-f1-mid border border-f1-border rounded px-1 py-0.5 text-xs text-center" />
                <span className="text-f1-muted">s</span></>
            ) : (
              <><input type="number" min={1} max={10} value={e.duration}
                  onChange={(ev) => setEvt(i, { duration: Number(ev.target.value) })}
                  className="w-9 bg-f1-mid border border-f1-border rounded px-1 py-0.5 text-xs text-center" />
                <span className="text-f1-muted">圈</span></>
            )}
            <button onClick={() => removeEvt(i)} className="ml-auto text-f1-muted hover:text-f1-red text-sm leading-none">×</button>
          </div>
        ))}
        {raceEvts.length < MAX_EVTS && (
          <button onClick={addEvt} className="text-[10px] text-yellow-500 hover:underline">+ 增加赛会事件（SC/VSC/雨/罚时）</button>
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
