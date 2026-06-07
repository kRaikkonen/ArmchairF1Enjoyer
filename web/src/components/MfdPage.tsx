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
import { PositionChart } from './mfd/PositionChart';
import type { PosSeries } from './mfd/PositionChart';
import { TrackPositionView } from './mfd/TrackPositionView';
import type { TrackDriver } from './mfd/TrackPositionView';
import { EventFeed } from './mfd/EventFeed';
import { ShareCard } from './mfd/ShareCard';
import { StrategyPanel } from './mfd/StrategyPanel';
import { buildShareUrl } from '../utils/shareUrl';
import { realRaceEvents, realPitEvents } from '../utils/raceFactsEvents';
import { defaultStrat, stratToEvents, raceEvtsToEvents, realRaceEvts } from './mfd/strategyTypes';
import type { DriverStrat, RaceEvt, Pit, ErsChange } from './mfd/strategyTypes';
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
  const setSelectedPlayerId = useRaceStore((s) => s.setSelectedPlayerId);
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
  const [chartTab, setChartTab] = useState<'gap' | 'position' | 'track'>('gap');
  const [showShare, setShowShare] = useState(false);
  const [rivalsReact, setRivalsReact] = useState(false);
  // Scenario state lives HERE (not in the panel) so it persists and ACCUMULATES
  // across driver switches: each edited driver keeps their strategy override,
  // race events are global, and the feed shows them all.
  const [driverStrats, setDriverStrats] = useState<Record<string, DriverStrat>>({});
  const [raceEvts, setRaceEvts] = useState<RaceEvt[]>(() => realRaceEvts(facts?.safetyCars));

  // Keep the scrubber pinned to the final lap whenever a new result arrives.
  useEffect(() => { setLap(result?.lapHistory.length ?? totalLaps); }, [result, totalLaps]);

  // team lookup from the model (authoritative)
  const teamByDriver = useMemo(() => {
    const m: Record<string, string> = {};
    if (trackModel) for (const o of Object.values(trackModel.driverOffsets)) m[o.driverId] = o.team;
    return m;
  }, [trackModel]);

  const driverIds = useMemo(() => Object.keys(teamByDriver), [teamByDriver]);

  // Real classification status (FastF1) — to honestly flag drivers the engine
  // shows as finishers but who actually retired (R) or were disqualified (D).
  const realStatusByDriver = useMemo(() => {
    const m: Record<string, 'finished' | 'dnf' | 'dsq'> = {};
    for (const r of trackModel?.results ?? []) m[r.driverId] = r.status;
    return m;
  }, [trackModel]);

  // car number (FastF1) per driver — for the track map dots
  const numberByDriver = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of trackModel?.results ?? []) m[r.driverId] = r.driverNumber;
    return m;
  }, [trackModel]);

  // real finishing position per classified driver — for the "beat the real
  // result" verdict and the share card.
  const realPosByDriver = useMemo(() => {
    const m: Record<string, number> = {};
    (trackModel?.results ?? []).filter((r) => r.status === 'finished')
      .sort((a, b) => a.position - b.position)
      .forEach((r, i) => { m[r.driverId] = i + 1; });
    return m;
  }, [trackModel]);

  // Keep the store's selected player in sync so ResultPage / the share URL
  // reflect the driver you're actually controlling (was a stale-data bug).
  useEffect(() => { if (playerId) setSelectedPlayerId(playerId); }, [playerId, setSelectedPlayerId]);

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

  // Reference driver = the scenario's P1 (final winner), so the chart is anchored
  // to whoever wins THIS scenario, not the per-lap leader.
  const winnerId = result?.finalOrder[0]?.driverId ?? '';

  // per-driver gap-to-WINNER across all laps → Gap Chart series
  const gapSeries: GapSeries[] = useMemo(() => {
    if (!result) return [];
    const nLaps = result.lapHistory.length;
    // winner's gap-to-leader per lap = the reference baseline to subtract.
    const winnerGap = Array(nLaps).fill(0);
    result.lapHistory.forEach((snaps, i) => {
      const w = snaps.find((s) => s.driverId === winnerId);
      if (w) winnerGap[i] = w.gapToLeaderSec;
    });
    const byDriver = new Map<string, number[]>();
    result.lapHistory.forEach((snaps, i) => {
      for (const s of snaps) {
        if (!byDriver.has(s.driverId)) byDriver.set(s.driverId, Array(nLaps).fill(NaN));
        byDriver.get(s.driverId)![i] = Math.max(0, s.gapToLeaderSec - winnerGap[i]);
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
  }, [result, playerId, teamByDriver, winnerId]);

  // per-driver position (rank) across all laps → Position Chart series
  const posSeries: PosSeries[] = useMemo(() => {
    if (!result) return [];
    const nLaps = result.lapHistory.length;
    const byDriver = new Map<string, number[]>();
    result.lapHistory.forEach((snaps, i) => {
      for (const s of snaps) {
        if (!byDriver.has(s.driverId)) byDriver.set(s.driverId, Array(nLaps).fill(NaN));
        byDriver.get(s.driverId)![i] = s.position;
      }
    });
    return [...byDriver.entries()].map(([driverId, positions]) => ({
      id: driverId,
      label: driverId,
      color: driverId === playerId ? '#f97316' : teamColor(teamByDriver[driverId] ?? ''),
      positions,
      highlighted: driverId === playerId,
      dim: driverId !== playerId,
    }));
  }, [result, playerId, teamByDriver]);

  const maxPos = result?.finalOrder.length ?? 20;

  // drivers placed on the circuit for the track-map view at the scrubbed lap
  const trackDrivers: TrackDriver[] = useMemo(() => {
    const snaps: LapSnapshot[] = result?.lapHistory[lap - 1] ?? [];
    return snaps.map((s) => ({
      id: s.driverId,
      gapToLeaderSec: s.gapToLeaderSec,
      color: s.driverId === playerId ? '#f97316' : teamColor(teamByDriver[s.driverId] ?? ''),
      isPlayer: s.driverId === playerId,
      carNumber: numberByDriver[s.driverId] ?? s.position,
    }));
  }, [result, lap, playerId, teamByDriver, numberByDriver]);

  // controlled driver's ERS battery (MJ) at the scrubbed lap
  const playerBatteryMJ = useMemo(() => {
    const snaps: LapSnapshot[] = result?.lapHistory[lap - 1] ?? [];
    return snaps.find((s) => s.driverId === playerId)?.ersPool;
  }, [result, lap, playerId]);

  const lapRefSec = trackModel?.trackBasePace && trackModel.trackBasePace > 0 ? trackModel.trackBasePace : 96;

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
        realStatus: realStatusByDriver[s.driverId],
      }));
  }, [result, lap, playerId, teamByDriver, pittedByLap, realStatusByDriver]);

  const player = standings.find((d) => d.driverId === playerId) ?? standings[0];

  // ── Scenario (accumulates across driver switches) ──────────────────────────
  const initialRaceEvts = useMemo(() => realRaceEvts(facts?.safetyCars), [facts]);

  // the controlled driver's editable strategy (override if any, else their real)
  const currentStrat: DriverStrat = driverStrats[playerId] ?? defaultStrat(facts?.strategies[playerId]);
  const updateStrat = (patch: Partial<DriverStrat>) =>
    setDriverStrats((prev) => ({ ...prev, [playerId]: { ...(prev[playerId] ?? defaultStrat(facts?.strategies[playerId])), ...patch } }));
  const setPits = (pits: Pit[]) => updateStrat({ pits });
  const setErsChanges = (ers: ErsChange[]) => updateStrat({ ers });

  const overridden = Object.keys(driverStrats);
  const raceEvtsModified = JSON.stringify(raceEvts) !== JSON.stringify(initialRaceEvts);
  const isWhatIf = overridden.length > 0 || raceEvtsModified;

  // "Beat the real result" verdict for the controlled driver.
  const verdict = useMemo(() => {
    if (!result) return null;
    const simPos = result.finalOrder.findIndex((d) => d.driverId === playerId) + 1;
    const realPos = realPosByDriver[playerId];
    if (!simPos || !realPos) return null;
    return { realPos, simPos, delta: realPos - simPos };
  }, [result, playerId, realPosByDriver]);

  // Feed = the player's modifications: edited drivers' strategies + race events
  // that aren't the baseline real safety car.
  const feedEvents = useMemo(() => {
    const extraRaceEvts = raceEvts.filter(
      (e) => !initialRaceEvts.some((r) => r.kind === e.kind && r.lap === e.lap && r.duration === e.duration),
    );
    return [
      ...overridden.flatMap((d) => stratToEvents(d, driverStrats[d], totalLaps)),
      ...raceEvtsToEvents(extraRaceEvts, totalLaps),
    ];
  }, [driverStrats, raceEvts, initialRaceEvts, totalLaps]); // eslint-disable-line react-hooks/exhaustive-deps

  function buildScenarioEvents() {
    const overrideSet = new Set(overridden);
    const overrideEvents = overridden.flatMap((d) => stratToEvents(d, driverStrats[d], totalLaps));
    const raceEvents = raceEvtsToEvents(raceEvts, totalLaps);
    if (rivalsReact) {
      // Rivals run the reactive AI (not hard-injected), so only the player's
      // explicit overrides + race events are injected.
      return [...overrideEvents, ...raceEvents];
    }
    return [
      ...realPitEvents(facts).filter((e) => !(e.driverId && overrideSet.has(e.driverId))),
      ...overrideEvents,
      ...raceEvents,
    ];
  }

  // In react mode, every driver WITHOUT a player override runs the reactive AI
  // seeded to their real strategy.
  function buildReactiveStrategies(): Record<string, { lap: number; compound: import('../engine/types').Compound }[]> | undefined {
    if (!rivalsReact || !facts) return undefined;
    const overrideSet = new Set(overridden);
    const out: Record<string, { lap: number; compound: import('../engine/types').Compound }[]> = {};
    for (const [d, pits] of Object.entries(facts.strategies)) {
      if (!overrideSet.has(d)) out[d] = pits;
    }
    return out;
  }

  function handleRun() {
    runScenario(buildScenarioEvents(), BASELINE_TEMP_C, false, buildReactiveStrategies());
  }

  function resetToBaseline() {
    setDriverStrats({});
    setRaceEvts(initialRaceEvts);
    runScenario(realRaceEvents(facts), BASELINE_TEMP_C, false);
  }

  // Switching the controlled driver just changes which car the panel edits — the
  // accumulated scenario (and the result/feed) is untouched.
  const handleSelectDriver = (id: string) => setPlayerId(id);

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

        {/* "Beat the real result" verdict for the controlled driver */}
        {isWhatIf && verdict && (
          <span className={`px-2 py-0.5 rounded text-[11px] font-bold whitespace-nowrap ${verdict.delta > 0 ? 'bg-green-500/20 text-green-400' : verdict.delta < 0 ? 'bg-red-500/20 text-red-400' : 'bg-f1-mid text-f1-muted'}`}>
            {playerId} 真实 P{verdict.realPos} → P{verdict.simPos} {verdict.delta > 0 ? `▲${verdict.delta} 赢了!` : verdict.delta < 0 ? `▼${-verdict.delta}` : '持平'}
          </span>
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
            {playerBatteryMJ !== undefined && (
              <span className="flex items-center gap-1" title="ERS 电池">
                <span className="text-f1-muted text-[10px]">电池</span>
                <span className="w-10 h-2 rounded-full bg-f1-border overflow-hidden inline-block align-middle">
                  <span className="h-full block bg-green-400" style={{ width: `${Math.round((playerBatteryMJ / 4) * 100)}%` }} />
                </span>
              </span>
            )}
          </div>
        )}
        {isWhatIf && (
          <button
            onClick={() => setShowShare(true)}
            className="px-3 py-1.5 rounded bg-f1-orange text-white text-xs font-bold hover:opacity-90 transition whitespace-nowrap"
          >
            分享 ▤
          </button>
        )}
        <button
          onClick={resetToBaseline}
          disabled={isRunning}
          className="px-3 py-1.5 rounded border border-f1-border text-f1-muted text-xs font-bold hover:text-f1-text hover:border-f1-muted transition disabled:opacity-50 whitespace-nowrap"
        >
          重置真实
        </button>
      </header>

      {/* ── Honest-trust banner (§8.6) ── */}
      <div className="flex items-center gap-2 px-4 h-6 bg-f1-dark border-b border-f1-border shrink-0 text-[10px] text-f1-muted">
        <span className="text-yellow-500">⚠ 可信度</span>
        <span>领奖台(前3)较可信 · 中下游仅供娱乐（真实复现误差约 ±4 位）· 单 seed 确定性 · 对手不博弈 · 退赛/DSQ 车手已剔除（不参与推演）</span>
      </div>

      {/* ── Body: three side-by-side columns (no deep stacking) ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left: live standings at the scrubbed lap */}
        <DriverList drivers={standings} onSelectDriver={handleSelectDriver} />

        {/* Center: chart with tab switcher (gap / track position) */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden p-1">
          <div className="flex gap-1 px-2 pt-1 shrink-0">
            {([['gap', '间距图'], ['position', '名次变化'], ['track', '赛道位置']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setChartTab(k)}
                className={[
                  'px-3 py-1 rounded-t text-[11px] font-medium transition-colors',
                  chartTab === k ? 'bg-f1-surface text-f1-text border-b-2 border-f1-orange' : 'text-f1-muted hover:text-f1-text',
                ].join(' ')}>
                {label}
              </button>
            ))}
          </div>
          {chartTab === 'gap' ? (
            <GapChart trackName={eventName} totalLaps={totalLaps} currentLap={lap}
              series={gapSeries} maxGapSec={maxGapSec} referenceLabel={winnerId} />
          ) : chartTab === 'position' ? (
            <PositionChart trackName={eventName} totalLaps={totalLaps} currentLap={lap}
              series={posSeries} maxPos={maxPos} />
          ) : (
            <TrackPositionView trackName={eventName} outline={trackModel.trackOutline}
              drivers={trackDrivers} lapRefSec={lapRefSec} currentLap={lap} totalLaps={totalLaps} />
          )}
        </main>

        {/* Event feed — the player's accumulated What-If modifications */}
        <EventFeed events={feedEvents} isWhatIf={isWhatIf} />

        {/* Right: strategy panel (track map is now the 赛道位置 tab) */}
        <aside className="w-[290px] shrink-0 flex flex-col border-l border-f1-border bg-f1-surface overflow-y-auto">
          <label className="flex items-center gap-2 px-3 py-2 border-b border-f1-border text-[11px] cursor-pointer">
            <input type="checkbox" checked={rivalsReact} onChange={(e) => setRivalsReact(e.target.checked)} className="accent-f1-orange" />
            <span className="text-f1-text font-medium">对手博弈</span>
            <span className="text-f1-border text-[9px]">开启后对手会防守 undercut、安全车下抢停、雨天换胎（近似真实，非精确复现）</span>
          </label>
          <StrategyPanel
            playerId={playerId}
            totalLaps={totalLaps}
            startCompound={storeDrivers.find((d) => d.driverId === playerId)?.compound ?? 'MEDIUM'}
            driverIds={driverIds}
            pits={currentStrat.pits}
            setPits={setPits}
            ersChanges={currentStrat.ers}
            setErsChanges={setErsChanges}
            raceEvts={raceEvts}
            setRaceEvts={setRaceEvts}
            isRunning={isRunning}
            onRun={handleRun}
            onReset={resetToBaseline}
          />
          <div className="px-3 py-2 text-[9px] text-f1-border leading-relaxed border-t border-f1-border">
            seed {seed} · 默认复现真实比赛。可分别改多名车手的策略并叠加，修改累积显示在「本场修改」。其余车保持真实策略不博弈（已知局限）。
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

      {showShare && verdict && (
        <ShareCard
          driverId={playerId}
          teamColor={teamColor(teamByDriver[playerId] ?? '')}
          realPos={verdict.realPos}
          simPos={verdict.simPos}
          delta={verdict.delta}
          eventName={eventName}
          season={trackModel.season}
          seed={seed}
          feedEvents={feedEvents}
          shareUrl={buildShareUrl({ track: eventName.toLowerCase(), season: trackModel.season, player: playerId, events: buildScenarioEvents(), seed })}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
