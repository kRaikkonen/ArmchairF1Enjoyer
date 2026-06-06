/**
 * Strategy panel — the What-If injection console (Phase 3, step 2b).
 *
 * Every control maps to a real engine input, so "重新推演" actually changes the
 * simulation:
 *   - 进站圈数 + 出站轮胎  → a `pit` event for the controlled driver
 *   - 引擎模式             → an `ers_mode` event for the controlled driver
 *   - 罚时                 → a `penalty` event for the controlled driver
 *   - 安全车 / VSC / 雨天   → race-wide events
 *   - 路面温度             → trackTempC passed to simulate()
 *
 * Only engine-modelled events are exposed (no "pit error / gun failure" — the
 * engine doesn't model those, so showing them would be a lie).
 */
import { useState } from 'react';
import type { Compound, ErsMode, EventEffect } from '../../engine/types';

interface StrategyPanelProps {
  playerId: string;
  totalLaps: number;
  isRunning: boolean;
  onRun: (events: EventEffect[], trackTempC: number, weatherIsWet: boolean) => void;
  onReset: () => void;
}

const COMPOUNDS: { v: Compound; label: string }[] = [
  { v: 'SOFT', label: '软 SOFT' },
  { v: 'MEDIUM', label: '中 MEDIUM' },
  { v: 'HARD', label: '硬 HARD' },
];
const ERS_MODES: { v: ErsMode; label: string }[] = [
  { v: 'neutral', label: '标准' },
  { v: 'attack', label: '激进' },
  { v: 'save', label: '节能' },
];

export function StrategyPanel({ playerId, totalLaps, isRunning, onRun, onReset }: StrategyPanelProps) {
  const [pitLap, setPitLap]     = useState(Math.max(2, Math.round(totalLaps / 2.6)));
  const [outComp, setOutComp]   = useState<Compound>('HARD');
  const [ersMode, setErsMode]   = useState<ErsMode>('neutral');
  const [trackTemp, setTrackTemp] = useState(31);

  const [penOn, setPenOn]   = useState(false);
  const [penSec, setPenSec] = useState(5);
  const [scOn, setScOn]     = useState(false);
  const [scLap, setScLap]   = useState(Math.round(totalLaps / 3));
  const [vscOn, setVscOn]   = useState(false);
  const [vscLap, setVscLap] = useState(Math.round(totalLaps / 2.5));
  const [rainOn, setRainOn] = useState(false);
  const [rainLap, setRainLap] = useState(Math.round(totalLaps / 2));

  function run() {
    const ev: EventEffect[] = [
      { type: 'pit', lap: pitLap, driverId: playerId, compound: outComp },
    ];
    if (ersMode !== 'neutral') ev.push({ type: 'ers_mode', lap: 1, driverId: playerId, ersMode });
    if (penOn) ev.push({ type: 'penalty', lap: 1, driverId: playerId, penaltySec: penSec });
    if (scOn)  ev.push({ type: 'safety_car', lap: scLap });
    if (vscOn) ev.push({ type: 'vsc', lap: vscLap });
    if (rainOn) ev.push({ type: 'rain', lap: rainLap, isWet: true });
    onRun(ev, trackTemp, false);
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-f1-muted uppercase tracking-widest">What-If 推演设置</span>
        <span className="text-[10px] text-f1-muted">接管 <b className="text-f1-orange">{playerId}</b></span>
      </div>

      {/* Pit lap */}
      <div>
        <div className="flex justify-between text-[10px] text-f1-muted mb-1">
          <span>进站圈数（接管车手）</span>
          <span className="font-mono text-f1-orange">第 {pitLap} 圈</span>
        </div>
        <input type="range" min={2} max={totalLaps - 1} value={pitLap}
          onChange={(e) => setPitLap(Number(e.target.value))}
          className="w-full accent-f1-orange h-1.5" />
      </div>

      {/* Out tyre + engine mode */}
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] text-f1-muted">出站轮胎</span>
          <select value={outComp} onChange={(e) => setOutComp(e.target.value as Compound)}
            className="w-full mt-1 bg-f1-mid border border-f1-border rounded px-2 py-1 text-xs text-f1-text">
            {COMPOUNDS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] text-f1-muted">引擎模式</span>
          <select value={ersMode} onChange={(e) => setErsMode(e.target.value as ErsMode)}
            className="w-full mt-1 bg-f1-mid border border-f1-border rounded px-2 py-1 text-xs text-f1-text">
            {ERS_MODES.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
          </select>
        </label>
      </div>

      {/* Events */}
      <div className="space-y-1.5 border-t border-f1-border pt-2">
        <div className="text-[10px] text-f1-muted uppercase tracking-widest">事件注入</div>

        <EventRow on={penOn} onToggle={() => setPenOn(!penOn)} label={`罚时 ${playerId}`}>
          <NumBox value={penSec} min={1} max={60} onChange={setPenSec} suffix="s" />
        </EventRow>
        <EventRow on={scOn} onToggle={() => setScOn(!scOn)} label="安全车 SC">
          <NumBox value={scLap} min={1} max={totalLaps} onChange={setScLap} prefix="L" />
        </EventRow>
        <EventRow on={vscOn} onToggle={() => setVscOn(!vscOn)} label="虚拟安全车 VSC">
          <NumBox value={vscLap} min={1} max={totalLaps} onChange={setVscLap} prefix="L" />
        </EventRow>
        <EventRow on={rainOn} onToggle={() => setRainOn(!rainOn)} label="雨天 从">
          <NumBox value={rainLap} min={1} max={totalLaps} onChange={setRainLap} prefix="L" />
        </EventRow>
      </div>

      {/* Track temp */}
      <div>
        <div className="flex justify-between text-[10px] text-f1-muted mb-1">
          <span>路面温度</span>
          <span className="font-mono text-f1-muted">{trackTemp}°C</span>
        </div>
        <input type="range" min={15} max={55} value={trackTemp}
          onChange={(e) => setTrackTemp(Number(e.target.value))}
          className="w-full accent-f1-orange h-1.5" />
      </div>

      {/* Run / reset */}
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

function EventRow({
  on, onToggle, label, children,
}: { on: boolean; onToggle: () => void; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onToggle}
        className={[
          'px-2 py-0.5 rounded text-[10px] font-medium border transition-colors shrink-0 w-32 text-left',
          on ? 'bg-yellow-500 text-gray-900 border-yellow-500' : 'bg-f1-mid border-f1-border text-f1-muted hover:text-f1-text',
        ].join(' ')}>
        {on ? '● ' : '○ '}{label}
      </button>
      <div className={on ? '' : 'opacity-30 pointer-events-none'}>{children}</div>
    </div>
  );
}

function NumBox({
  value, min, max, onChange, prefix, suffix,
}: { value: number; min: number; max: number; onChange: (n: number) => void; prefix?: string; suffix?: string }) {
  return (
    <div className="flex items-center gap-0.5 text-[10px] text-f1-muted">
      {prefix}
      <input type="number" value={value} min={min} max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-12 bg-f1-mid border border-f1-border rounded px-1 py-0.5 text-xs text-f1-text text-center" />
      {suffix}
    </div>
  );
}
