/**
 * MFD advanced mode — wired to the REAL engine (Phase 3, step 1).
 *
 * Data flow: store.trackModel + store.result (from simulate()). No mock data.
 *   - HUD + driver standings reflect the simulated state at the scrubbed lap.
 *   - Gap Chart plots each driver's real gap-to-leader over every lap
 *     (from result.lapHistory). Single seed → single deterministic line, no
 *     uncertainty band (false precision; multi-seed bands are a later step).
 *   - Track map renders the real FastF1 circuit outline (model.trackOutline).
 *   - "重新推演" calls store.runSimulation() (the real engine).
 *
 * Event-bar / pit-console injection (making the controls actually change the
 * sim) is the next step; honest "podium-trustworthy / midfield-for-fun"
 * labelling is the step after.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRaceStore } from '../store/raceStore';
import { teamColor } from '../engine/teamColors';
import { DriverList } from './mfd/DriverList';
import type { DriverEntry } from './mfd/DriverList';
import { GapChart } from './mfd/GapChart';
import type { GapSeries } from './mfd/GapChart';
import { TrackSvg } from './mfd/TrackSvg';
import { StrategyPanel } from './mfd/StrategyPanel';
import { realRaceEvents, realPitEvents } from '../utils/raceFactsEvents';
import type { LapSnapshot } from '../engine/types';

const BASELINE_TEMP_C = 32; // schema constant for the real-race baseline run

export function MfdPage() {
  const setView       = useRaceStore((s) => s.setView);
  const trackModel    = useRaceStore((s) => s.trackModel);
  const result        = useRaceStore((s) => s.result);
  const isRunning     = useRaceStore((s) => s.isRunning);
  const runSimulation = useRaceStore((s) => s.runSimulation);
  const runScenario   = useRaceStore((s) => s.runScenario);
  const storeDrivers  = useRaceStore((s) => s.drivers);
  const storedPlayer  = useRaceStore((s) => s.selectedPlayerId);
  const seed          = useRaceStore((s) => s.seed);

  const facts = trackModel?.raceFacts;

  // Land on the REAL race: every driver's real strategy + the real safety cars.
  // Falls back to the AI baseline if no race facts are available.
  useEffect(() => {
    if (!trackModel || result || isRunning) return;
    if (facts) runScenario(realRaceEvents(facts), BASELINE_TEMP_C, false);
    else runSimulation();
  }, [trackModel, result, isRunning, facts, runScenario, runSimulation]);

  const totalLaps = result?.lapHistory.length ?? trackModel?.totalLaps ?? 57;
  const [lap, setLap] = useState(totalLaps);
  const [playerId, setPlayerId] = useState(storedPlayer ?? 'VER');
  const [resetNonce, setResetNonce] = useState(0);
  const [isWhatIf, setIsWhatIf] = useState(false);

  // Keep the scrubber pinned to the final lap whenever a new result arrives.
  useEffect(() => { setLap(result?.lapHistory.length ?? totalLaps); }, [result, totalLaps]);

  // team lookup from the model (authoritative)
  const teamByDriver = useMemo(() => {
    const m: Record<string, string> = {};
    if (trackModel) for (const o of Object.values(trackModel.driverOffsets)) m[o.driverId] = o.team;
    return m;
  }, [trackModel]);

  // drivers that have pitted on or before a given lap (isInPit in lapHistory)
  const pittedByLap = useMemo(() => {
    const out: Set<string>[] = [];
    const seen = new Set<string>();
    for (const snaps of result?.lapHistory ?? []) {
      for (const s of snaps) if (s.isInPit) seen.add(s.driverId);
      out.push(new Set(seen));
    }
    return out;
  }, [result]);

  // per-driver gap-to-leader across all laps → Gap Chart series
  const gapSeries: GapSeries[] = useMemo(() => {
    if (!result) return [];
    const byDriver = new Map<string, number[]>();
    result.lapHistory.forEach((snaps, i) => {
      for (const s of snaps) {
        if (!byDriver.has(s.driverId)) byDriver.set(s.driverId, Array(result.lapHistory.length).fill(NaN));
        byDriver.get(s.driverId)![i] = Math.max(0, s.gapToLeaderSec);
      }
    });
    return [...byDriver.entries()].map(([driverId, gaps]) => ({
      id: driverId,
      label: driverId,
      color: driverId === playerId ? '#f97316' : teamColor(teamByDriver[driverId] ?? ''),
      gaps,
      highlighted: driverId === playerId,
      dim: driverId !== playerId,
    }));
  }, [result, playerId, teamByDriver]);

  // max gap for the Y-axis (cover the field at the final lap, rounded, capped)
  const maxGapSec = useMemo(() => {
    if (!result) return 60;
    const last = result.lapHistory[result.lapHistory.length - 1] ?? [];
    const maxG = Math.max(10, ...last.map((s) => s.gapToLeaderSec).filter(Number.isFinite));
    return Math.min(120, Math.ceil(maxG / 10) * 10);
  }, [result]);

  // standings at the scrubbed lap
  const standings: DriverEntry[] = useMemo(() => {
    const snaps: LapSnapshot[] = result?.lapHistory[lap - 1] ?? [];
    const pitted = pittedByLap[lap - 1] ?? new Set<string>();
    return [...snaps]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        position: s.position,
        driverId: s.driverId,
        team: teamByDriver[s.driverId] ?? '',
        compound: s.compound,
        gap: s.position === 1 ? '领跑' : `+${s.gapToLeaderSec.toFixed(1)}s`,
        isPlayer: s.driverId === playerId,
        hasPitted: pitted.has(s.driverId),
      }));
  }, [result, lap, playerId, teamByDriver, pittedByLap]);

  const player = standings.find((d) => d.driverId === playerId) ?? standings[0];

  function resetToBaseline() {
    setResetNonce((n) => n + 1);
    setIsWhatIf(false);
    runScenario(realRaceEvents(facts), BASELINE_TEMP_C, false);
  }

  if (!trackModel) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3 bg-f1-dark text-f1-text">
        <div className="text-f1-muted text-sm">未加载赛道模型</div>
        <button onClick={() => setView('home')} className="px-3 py-1.5 border border-f1-border rounded text-sm">← 返回首页选择比赛</button>
      </div>
    );
  }

  const eventName = trackModel.event ?? 'Bahrain';

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-f1-dark text-f1-text select-none">
      {/* ── HUD + global controls ── */}
      <header className="flex items-center gap-4 px-4 h-11 bg-f1-surface border-b border-f1-border shrink-0">
        <span className="font-bold text-f1-red tracking-widest text-[11px] uppercase whitespace-nowrap">Armchair Pitwall</span>
        <span className="text-f1-muted text-xs whitespace-nowrap">
          {eventName} · {trackModel.season} · {trackModel.circuitLengthKm?.toFixed(3)}km · {totalLaps}L
        </span>
        {isWhatIf ? (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-f1-orange text-white">What-If 平行世界</span>
        ) : (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-600 text-white">真实复现 · 基准</span>
        )}

        {/* global lap scrubber */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[10px] text-f1-muted uppercase tracking-wider whitespace-nowrap">圈</span>
          <input
            type="range" min={1} max={totalLaps} value={lap}
            onChange={(e) => setLap(Number(e.target.value))}
            className="flex-1 min-w-0 accent-f1-orange h-1.5"
          />
          <span className="font-mono text-f1-text text-xs whitespace-nowrap w-14 text-right">L{lap}/{totalLaps}</span>
        </div>

        {/* player summary */}
        {player && (
          <div className="flex items-center gap-3 text-xs whitespace-nowrap">
            <span><span className="text-f1-muted text-[10px] mr-1">接管</span><b className="text-f1-orange">{player.driverId}</b></span>
            <span><span className="text-f1-muted text-[10px] mr-1">排位</span><b className="font-mono">P{player.position}</b></span>
            <span className="font-mono text-yellow-400">{player.gap}</span>
          </div>
        )}
        <button
          onClick={resetToBaseline}
          disabled={isRunning}
          className="px-3 py-1.5 rounded border border-f1-border text-f1-muted text-xs font-bold hover:text-f1-text hover:border-f1-muted transition disabled:opacity-50 whitespace-nowrap"
        >
          重置真实
        </button>
      </header>

      {/* ── Body: three side-by-side columns (no deep stacking) ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left: live standings at the scrubbed lap */}
        <DriverList drivers={standings} onSelectDriver={setPlayerId} />

        {/* Center: Gap Chart (hero) */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden p-1">
          <GapChart
            trackName={eventName}
            totalLaps={totalLaps}
            currentLap={lap}
            series={gapSeries}
            maxGapSec={maxGapSec}
          />
        </main>

        {/* Right: real track map + strategy panel */}
        <aside className="w-[290px] shrink-0 flex flex-col border-l border-f1-border bg-f1-surface overflow-y-auto">
          <div className="p-3 border-b border-f1-border">
            <TrackSvg
              trackName={`${eventName} 赛道`}
              outline={trackModel.trackOutline}
              lengthKm={trackModel.circuitLengthKm}
              totalLaps={totalLaps}
            />
          </div>
          <StrategyPanel
            key={`${playerId}-${resetNonce}`}
            playerId={playerId}
            totalLaps={totalLaps}
            startCompound={storeDrivers.find((d) => d.driverId === playerId)?.compound ?? 'MEDIUM'}
            realPits={facts?.strategies[playerId]}
            realSc={facts?.safetyCars[0] ?? null}
            isRunning={isRunning}
            // Keep every other driver on their real strategy; only the
            // controlled driver runs the player's edited plan.
            onRun={(ev) => { setIsWhatIf(true); runScenario([...realPitEvents(facts, playerId), ...ev], BASELINE_TEMP_C, false); }}
            onReset={resetToBaseline}
          />
          <div className="px-3 py-2 text-[9px] text-f1-border leading-relaxed border-t border-f1-border">
            seed {seed} · 默认复现真实比赛（各车真实进站策略 + 真实安全车）。改接管车手 = 平行世界；其余车保持真实策略不博弈（已知局限）。
          </div>
        </aside>
      </div>

      {/* back to result */}
      <button
        onClick={() => setView('result')}
        className="absolute bottom-2 left-2 opacity-30 hover:opacity-100 transition text-f1-muted text-[10px] px-2 py-1 border border-f1-border rounded bg-f1-dark"
      >
        ← 对比视图
      </button>
    </div>
  );
}
