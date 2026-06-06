/**
 * Strategy panel — the What-If injection console (Phase 3, step 2b).
 *
 * - Pit stops: a list (no cap) of {lap, out-compound, stationary time}. The
 *   stop's lap-time cost = pit-in (generic) + stationary (you set it, for
 *   slow/botched stops) + pit-out (generic).
 * - Engine mode: a SEPARATE list of {lap, mode} changes, decoupled from pits —
 *   you can switch ERS mode at any lap.
 * - Race events: SC / VSC / rain / penalty, also an add-as-many list (penalty
 *   carries its own driver).
 *
 * Every control maps to a real engine input so "重新推演" changes the sim.
 */
import { useState } from 'react';
import type { Compound, ErsMode, EventEffect } from '../../engine/types';
import { PIT_LANE_IN_SEC, PIT_LANE_OUT_SEC, DEFAULT_PIT_STATIONARY_SEC } from '../../engine/events';

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

interface Pit { lap: number; compound: Compound; stationary: number; }
interface ErsChange { lap: number; mode: ErsMode; }
type EvtKind = 'safety_car' | 'vsc' | 'rain' | 'penalty';
interface RaceEvt { kind: EvtKind; lap: number; duration: number; isWet: boolean; driverId: string; penaltySec: number; }

const MAX_EVTS = 12;
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
  const [pits, setPits] = useState<Pit[]>(() =>
    realPits && realPits.length
      ? realPits.map((p) => ({ lap: p.lap, compound: p.compound, stationary: DEFAULT_PIT_STATIONARY_SEC }))
      : [{ lap: Math.max(2, Math.round(totalLaps / 2.6)), compound: 'HARD', stationary: DEFAULT_PIT_STATIONARY_SEC }],
  );
  const [ersChanges, setErsChanges] = useState<ErsChange[]>([]);
  const [raceEvts, setRaceEvts] = useState<RaceEvt[]>(() =>
    (realSafetyCars ?? []).map((sc) => ({ kind: 'safety_car' as EvtKind, lap: sc.lap, duration: sc.duration, isWet: true, driverId: playerId, penaltySec: 5 })),
  );

  function setPit(i: number, patch: Partial<Pit>) { setPits((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p))); }
  function addPit() {
    setPits((ps) => {
      // Pick the next FREE lap so we never stack two stops on the same lap
      // (which the engine would fire twice — doubled pit loss + pitCount).
      const used = new Set(ps.map((p) => p.lap));
      const base = (ps[ps.length - 1]?.lap ?? Math.round(totalLaps / 3)) + Math.round(totalLaps / 4);
      let lap = Math.min(totalLaps - 1, base);
      while (used.has(lap) && lap < totalLaps - 1) lap++;
      while (used.has(lap) && lap > 2) lap--;
      return [...ps, { lap, compound: 'SOFT', stationary: DEFAULT_PIT_STATIONARY_SEC }];
    });
  }
  function removePit(i: number) { setPits((ps) => (ps.length <= 1 ? ps : ps.filter((_, j) => j !== i))); }

  function setErs(i: number, patch: Partial<ErsChange>) { setErsChanges((es) => es.map((e, j) => (j === i ? { ...e, ...patch } : e))); }
  function addErs() { setErsChanges((es) => [...es, { lap: 1, mode: 'attack' }]); }
  function removeErs(i: number) { setErsChanges((es) => es.filter((_, j) => j !== i)); }

  function setEvt(i: number, patch: Partial<RaceEvt>) { setRaceEvts((es) => es.map((e, j) => (j === i ? { ...e, ...patch } : e))); }
  function addEvt() {
    setRaceEvts((es) => (es.length >= MAX_EVTS ? es : [...es, { kind: 'safety_car', lap: Math.round(totalLaps / 2), duration: 3, isWet: true, driverId: playerId, penaltySec: 5 }]));
  }
  function removeEvt(i: number) { setRaceEvts((es) => es.filter((_, j) => j !== i)); }

  function run() {
    // Clamp every user value so empty/NaN/out-of-range input can never corrupt
    // the sim, and collapse pits to one-per-lap (a duplicate lap would otherwise
    // be fired twice by the engine — doubled pit loss + pitCount).
    const lapIn = (l: number, lo: number) => Math.min(totalLaps, Math.max(lo, Number.isFinite(l) ? Math.round(l) : lo));
    const ev: EventEffect[] = [];

    const pitByLap = new Map<number, Pit>();
    for (const p of pits) pitByLap.set(Math.min(totalLaps - 1, lapIn(p.lap, 2)), p);
    for (const [lap, p] of [...pitByLap.entries()].sort((a, b) => a[0] - b[0])) {
      const stat = Math.min(40, Math.max(0, Number.isFinite(p.stationary) ? p.stationary : DEFAULT_PIT_STATIONARY_SEC));
      ev.push({ type: 'pit', lap, driverId: playerId, compound: p.compound, pitStationarySec: stat });
    }
    for (const e of ersChanges) ev.push({ type: 'ers_mode', lap: lapIn(e.lap, 1), driverId: playerId, ersMode: e.mode });
    for (const e of raceEvts) {
      const lap = lapIn(e.lap, 1);
      if (e.kind === 'rain') ev.push({ type: 'rain', lap, isWet: e.isWet });
      else if (e.kind === 'penalty') ev.push({ type: 'penalty', lap, driverId: e.driverId, penaltySec: Math.max(0, Number.isFinite(e.penaltySec) ? e.penaltySec : 5) });
      else ev.push({ type: e.kind, lap, duration: Math.max(1, Number.isFinite(e.duration) ? e.duration : 3) });
    }
    onRun(ev);
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-f1-muted uppercase tracking-widest">车手策略</span>
        <span className="text-[10px] text-f1-muted">接管 <b className="text-f1-orange">{playerId}</b></span>
      </div>

      {/* Start compound */}
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-f1-muted w-12">起步</span>
        <span className="px-1.5 py-0.5 rounded bg-f1-mid text-f1-text font-mono">{COMPOUND_LABEL[startCompound] ?? startCompound}</span>
      </div>

      {/* Pit stints (no cap) */}
      {pits.map((p, i) => {
        const stat = Number.isFinite(p.stationary) ? p.stationary : DEFAULT_PIT_STATIONARY_SEC;
        const total = PIT_LANE_IN_SEC + stat + PIT_LANE_OUT_SEC;
        return (
          <div key={i} className="border-l-2 border-f1-orange/40 pl-2 text-[11px] space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-f1-muted">进站{i + 1} L</span>
              <input type="number" min={2} max={totalLaps - 1} value={p.lap}
                onChange={(e) => setPit(i, { lap: Number(e.target.value) })}
                className="w-11 bg-f1-mid border border-f1-border rounded px-1 py-0.5 text-xs text-center" />
              <span className="text-f1-muted">→</span>
              <CompoundSelect value={p.compound} onChange={(v) => setPit(i, { compound: v })} />
              {pits.length > 1 && (
                <button onClick={() => removePit(i)} className="ml-auto text-f1-muted hover:text-f1-red text-sm leading-none">×</button>
              )}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-f1-muted pl-1">
              <span>换胎用时</span>
              <input type="number" min={0} max={40} step={0.5} value={p.stationary}
                onChange={(e) => setPit(i, { stationary: Number(e.target.value) })}
                className="w-12 bg-f1-mid border border-f1-border rounded px-1 py-0.5 text-xs text-center" />
              <span>s → 损失 {PIT_LANE_IN_SEC}+{stat}+{PIT_LANE_OUT_SEC} = {total.toFixed(1)}s</span>
            </div>
          </div>
        );
      })}
      <button onClick={addPit} className="text-[10px] text-f1-orange hover:underline">+ 增加进站</button>

      {/* Engine mode — decoupled from pits */}
      <div className="space-y-1.5 border-t border-f1-border pt-2">
        <div className="text-[10px] text-f1-muted uppercase tracking-widest">引擎模式（独立于进站）</div>
        {ersChanges.map((e, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[11px] border-l-2 border-blue-400/40 pl-2">
            <span className="text-f1-muted">L</span>
            <input type="number" min={1} max={totalLaps} value={e.lap}
              onChange={(ev) => setErs(i, { lap: Number(ev.target.value) })}
              className="w-11 bg-f1-mid border border-f1-border rounded px-1 py-0.5 text-xs text-center" />
            <span className="text-f1-muted">→</span>
            <ErsSelect value={e.mode} onChange={(v) => setErs(i, { mode: v })} />
            <button onClick={() => removeErs(i)} className="ml-auto text-f1-muted hover:text-f1-red text-sm leading-none">×</button>
          </div>
        ))}
        <button onClick={addErs} className="text-[10px] text-blue-400 hover:underline">+ 增加引擎模式切换</button>
      </div>

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
