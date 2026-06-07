/**
 * Strategy panel — the What-If injection console (Phase 3).
 *
 * Fully CONTROLLED: the scenario (this driver's pits + engine-mode changes, and
 * the global race events) lives in MfdPage, so it persists and accumulates as
 * you switch the controlled driver. The panel only renders and edits via props.
 *
 * - Pit stops: a list (no cap) of {lap, out-compound, stationary time}; cost =
 *   pit-in (generic) + stationary (you set it) + pit-out (generic).
 * - Engine mode: a separate list of {lap, mode}, decoupled from pits.
 * - Race events: SC / VSC / rain / penalty (penalty carries its own driver).
 */
import type { Compound, ErsMode } from '../../engine/types';
import { PIT_LANE_IN_SEC, PIT_LANE_OUT_SEC, DEFAULT_PIT_STATIONARY_SEC } from '../../engine/events';
import type { Pit, ErsChange, RaceEvt, EvtKind } from './strategyTypes';

interface StrategyPanelProps {
  playerId: string;
  totalLaps: number;
  startCompound: Compound;
  driverIds: string[];
  pits: Pit[];
  setPits: (p: Pit[]) => void;
  ersChanges: ErsChange[];
  setErsChanges: (e: ErsChange[]) => void;
  raceEvts: RaceEvt[];
  setRaceEvts: (e: RaceEvt[]) => void;
  isRunning: boolean;
  onRun: () => void;
  onReset: () => void;
}

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

export function StrategyPanel(p: StrategyPanelProps) {
  const { playerId, totalLaps, startCompound, driverIds, pits, setPits, ersChanges, setErsChanges, raceEvts, setRaceEvts, isRunning, onRun, onReset } = p;

  const setPit = (i: number, patch: Partial<Pit>) => setPits(pits.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const addPit = () => {
    const used = new Set(pits.map((x) => x.lap));
    let lap = Math.min(totalLaps - 1, (pits[pits.length - 1]?.lap ?? Math.round(totalLaps / 3)) + Math.round(totalLaps / 4));
    while (used.has(lap) && lap < totalLaps - 1) lap++;
    while (used.has(lap) && lap > 2) lap--;
    setPits([...pits, { lap, compound: 'SOFT', stationary: DEFAULT_PIT_STATIONARY_SEC }]);
  };
  // Allow removing ALL pits — a 0-stop strategy is a valid "what if they never
  // pitted" (the engine just never stops them; they live with the tyre cliff).
  const removePit = (i: number) => setPits(pits.filter((_, j) => j !== i));

  const setErs = (i: number, patch: Partial<ErsChange>) => setErsChanges(ersChanges.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const addErs = () => setErsChanges([...ersChanges, { lap: 1, mode: 'attack' }]);
  const removeErs = (i: number) => setErsChanges(ersChanges.filter((_, j) => j !== i));

  const setEvt = (i: number, patch: Partial<RaceEvt>) => setRaceEvts(raceEvts.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const addEvt = () => { if (raceEvts.length < MAX_EVTS) setRaceEvts([...raceEvts, { kind: 'safety_car', lap: Math.round(totalLaps / 2), duration: 3, isWet: true, driverId: playerId, penaltySec: 5 }]); };
  const removeEvt = (i: number) => setRaceEvts(raceEvts.filter((_, j) => j !== i));

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-f1-muted uppercase tracking-widest">车手策略</span>
        <span className="text-[10px] text-f1-muted">接管 <b className="text-f1-orange">{playerId}</b></span>
      </div>

      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-f1-muted w-12">起步</span>
        <span className="px-1.5 py-0.5 rounded bg-f1-mid text-f1-text font-mono">{COMPOUND_LABEL[startCompound] ?? startCompound}</span>
      </div>

      {/* Pit stints (no cap) */}
      {pits.map((pit, i) => {
        const stat = Number.isFinite(pit.stationary) ? pit.stationary : DEFAULT_PIT_STATIONARY_SEC;
        const total = PIT_LANE_IN_SEC + stat + PIT_LANE_OUT_SEC;
        return (
          <div key={i} className="border-l-2 border-f1-orange/40 pl-2 text-[11px] space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-f1-muted">进站{i + 1} L</span>
              <input type="number" min={2} max={totalLaps - 1} value={pit.lap}
                onChange={(e) => setPit(i, { lap: Number(e.target.value) })}
                className="w-11 bg-f1-mid border border-f1-border rounded px-1 py-0.5 text-xs text-center" />
              <span className="text-f1-muted">→</span>
              <CompoundSelect value={pit.compound} onChange={(v) => setPit(i, { compound: v })} />
              <button onClick={() => removePit(i)} className="ml-auto text-f1-muted hover:text-f1-red text-sm leading-none">×</button>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-f1-muted pl-1">
              <span>换胎用时</span>
              <input type="number" min={0} max={40} step={0.5} value={pit.stationary}
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
        <div className="text-[9px] text-f1-border leading-snug">
          电池约 4MJ，每圈回收 2MJ。激进=满功率部署（约 2 圈耗尽电池，之后失效）；标准=平衡；节能=少部署、回充电池。
        </div>
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

      {/* Race events */}
      <div className="space-y-1.5 border-t border-f1-border pt-2">
        <div className="text-[10px] text-f1-muted uppercase tracking-widest">赛会事件</div>
        {raceEvts.map((e, i) => (
          <div key={i} className="flex items-center gap-1 text-[11px] border-l-2 border-yellow-500/40 pl-2">
            <select value={e.kind} onChange={(ev) => setEvt(i, { kind: ev.target.value as EvtKind })}
              className="bg-f1-mid border border-f1-border rounded px-1 py-0.5 text-xs text-f1-text">
              {EVT_KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}
            </select>
            {e.kind === 'penalty' && (
              <select value={e.driverId || playerId} onChange={(ev) => setEvt(i, { driverId: ev.target.value })}
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
        {raceEvts.length < MAX_EVTS && <button onClick={addEvt} className="text-[10px] text-yellow-500 hover:underline">+ 增加赛会事件（SC/VSC/雨/罚时）</button>}
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onRun} disabled={isRunning}
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
