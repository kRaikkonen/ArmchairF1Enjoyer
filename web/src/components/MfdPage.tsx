/**
 * MFD Page — Phase 2 three-column race strategy interface.
 *
 * Layout (1280px+):
 *   ┌────────────────────── HUD Bar (full width) ──────────────────────┐
 *   ├────────────────────── Event Bar (full width) ────────────────────┤
 *   │ Driver List │       Center Panel           │    Radio Log        │
 *   │ (192px)     │  Track SVG + Gap Chart        │    (224px)          │
 *   │             │  + Pit Console               │                     │
 *   └─────────────┴──────────────────────────────┴─────────────────────┘
 *
 * All data is mock/placeholder in Phase 2.  Engine hook-up is Phase 3.
 */

import { useState } from 'react';
import { useRaceStore } from '../store/raceStore';
import { HudBar }      from './mfd/HudBar';
import { EventBar }    from './mfd/EventBar';
import { DriverList }  from './mfd/DriverList';
import type { DriverEntry } from './mfd/DriverList';
import { GapChart }    from './mfd/GapChart';
import type { GapSeries } from './mfd/GapChart';
import { TrackSvg }    from './mfd/TrackSvg';
import { PitConsole }  from './mfd/PitConsole';
import { RadioLog }    from './mfd/RadioLog';
import type { RadioEntry } from './mfd/RadioLog';

// ── Mock data ──────────────────────────────────────────────────────────────
// Phase 2: all values are static placeholders.
// Phase 3 will replace these with live simulation output.

const MOCK_LAP   = 20;
const MOCK_TOTAL = 52;

const MOCK_DRIVERS: DriverEntry[] = [
  { position:  1, driverId: 'TSU', team: 'Racing Bulls',  compound: 'C3', gap: '+0.0s',  isPlayer: false, hasPitted: true  },
  { position:  2, driverId: 'LEC', team: 'Ferrari',       compound: 'C3', gap: '+2.7s',  isPlayer: false, hasPitted: true  },
  { position:  3, driverId: 'GAS', team: 'Alpine',        compound: 'C3', gap: '+6.7s',  isPlayer: false, hasPitted: true  },
  { position:  4, driverId: 'ZHO', team: 'Kick Sauber',   compound: 'C3', gap: '+6.8s',  isPlayer: false, hasPitted: true  },
  { position:  5, driverId: 'HAM', team: 'Ferrari',       compound: 'C4', gap: '+11.4s', isPlayer: false, hasPitted: true  },
  { position:  6, driverId: 'STR', team: 'Aston Martin',  compound: 'C4', gap: '+15.0s', isPlayer: false, hasPitted: true  },
  { position:  7, driverId: 'SAI', team: 'Williams',      compound: 'C4', gap: '+17.9s', isPlayer: false, hasPitted: true  },
  { position:  8, driverId: 'VER', team: 'Red Bull',      compound: 'C3', gap: '+19.1s', isPlayer: true,  hasPitted: true  },
  { position:  9, driverId: 'DEV', team: 'Racing Bulls',  compound: 'C4', gap: '+19.4s', isPlayer: false, hasPitted: true  },
  { position: 10, driverId: 'SAR', team: 'Williams',      compound: 'C4', gap: '+19.6s', isPlayer: false, hasPitted: true  },
  { position: 11, driverId: 'MAG', team: 'Haas',          compound: 'C4', gap: '+19.7s', isPlayer: false, hasPitted: true  },
  { position: 12, driverId: 'NOR', team: 'McLaren',       compound: 'C2', gap: '+21.1s', isPlayer: false, hasPitted: false },
  { position: 13, driverId: 'PIA', team: 'McLaren',       compound: 'C2', gap: '+21.5s', isPlayer: false, hasPitted: false },
  { position: 14, driverId: 'RUS', team: 'Mercedes',      compound: 'C2', gap: '+21.7s', isPlayer: false, hasPitted: false },
  { position: 15, driverId: 'ALB', team: 'Williams',      compound: 'C2', gap: '+22.9s', isPlayer: false, hasPitted: false },
  { position: 16, driverId: 'ALO', team: 'Aston Martin',  compound: 'C2', gap: '+23.5s', isPlayer: false, hasPitted: false },
  { position: 17, driverId: 'RIC', team: 'Racing Bulls',  compound: 'C2', gap: '+23.6s', isPlayer: false, hasPitted: false },
];

// Pre-computed mock gap trajectories over 52 laps (UI constant — not physics).
// Generated via lerp between keyframes; deterministic (no Math.random).
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function buildMockGaps(keyframes: [number, number][], laps: number): number[] {
  return Array.from({ length: laps }, (_, i) => {
    const t = i / (laps - 1);
    let lo = keyframes[0], hi = keyframes[keyframes.length - 1];
    for (let k = 0; k < keyframes.length - 1; k++) {
      if (t >= keyframes[k][0] && t <= keyframes[k + 1][0]) {
        lo = keyframes[k]; hi = keyframes[k + 1]; break;
      }
    }
    const lt = (t - lo[0]) / Math.max(hi[0] - lo[0], 0.001);
    return lerp(lo[1], hi[1], Math.min(1, Math.max(0, lt)));
  });
}

// Uncertainty widens towards the end of the race (more laps = more variance)
function buildUncertainty(baseU: number, laps: number): number[] {
  return Array.from({ length: laps }, (_, i) => baseU * (1 + (i / laps) * 1.8));
}

const GAP_SERIES: GapSeries[] = [
  {
    id: 'c4-soft', label: 'C4 软', color: '#f97316',
    gaps: buildMockGaps([[0,8],[0.28,24],[0.5,20],[1,16]], MOCK_TOTAL),
    uncertainty: buildUncertainty(1.5, MOCK_TOTAL),
  },
  {
    id: 'c3-medium', label: 'C3 中', color: '#9ca3af', highlighted: true,
    gaps: buildMockGaps([[0,15],[0.38,20],[0.6,22],[1,19]], MOCK_TOTAL),
    uncertainty: buildUncertainty(1.2, MOCK_TOTAL),
  },
  {
    id: 'c2-hard', label: 'C2 硬', color: '#60a5fa',
    gaps: buildMockGaps([[0,20],[0.3,26],[0.65,23],[1,20]], MOCK_TOTAL),
    uncertainty: buildUncertainty(2.0, MOCK_TOTAL),
  },
];

const MOCK_RADIO: RadioEntry[] = [
  {
    id: 'r1', from: 'fia', laps: 'L1~3',
    message: '压线超界，5s罚时成立。AI更新追击策略。',
  },
  {
    id: 'r2', from: 'ai', laps: 'L18~20',
    message: '预测进站窗口开启。建议 L20 进站换 C3，可超越 SAI（P7）。净时间差 +2.1s。',
  },
  {
    id: 'r3', from: 'engineer', laps: 'L15',
    message: '前方 SAI 轮胎性能下降明显，预计 L22 之前会进站。保持压力。',
  },
  {
    id: 'r4', from: 'driver', laps: 'L12',
    message: '硬胎还有余量，但内圈已开始滑移。告诉我进站的最佳时机。',
  },
  {
    id: 'r5', from: 'ai', laps: 'L10',
    message: '安全窗口确认：L19–L23 进站均可保持 P8 或更好。L20 为最优解。',
  },
  {
    id: 'r6', from: 'fia', laps: 'L8',
    message: '赛道绿旗，无安全车风险。天气预报：全程无雨。',
  },
];

const MOCK_DRIVER_IDS = MOCK_DRIVERS.map((d) => d.driverId);

// ── Component ──────────────────────────────────────────────────────────────

export function MfdPage() {
  const setView = useRaceStore((s) => s.setView);

  const [playerId, setPlayerId] = useState('VER');
  const [drivers, setDrivers]   = useState<DriverEntry[]>(MOCK_DRIVERS);

  function handleSelectDriver(id: string) {
    setPlayerId(id);
    setDrivers((prev) =>
      prev.map((d) => ({ ...d, isPlayer: d.driverId === id }))
    );
  }

  // Player's current stats (pulled from driver list)
  const player = drivers.find((d) => d.driverId === playerId) ?? drivers[7];

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-f1-dark text-f1-text select-none">
      {/* ── HUD ── */}
      <HudBar
        track="英国·银石"
        season={2025}
        lap={MOCK_LAP}
        totalLaps={MOCK_TOTAL}
        status="green"
        playerId={playerId}
        position={player.position}
        compound={player.compound}
        gapToLeader={player.position === 1 ? '领跑' : player.gap}
        nextPitLap={MOCK_LAP}
      />

      {/* ── Event bar ── */}
      <EventBar playerId={playerId} drivers={MOCK_DRIVER_IDS} />

      {/* ── Three-column body ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left: Driver list */}
        <DriverList drivers={drivers} onSelectDriver={handleSelectDriver} />

        {/* Center: Track + Gap chart + Pit console */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Top half: track map + gap chart side by side */}
          <div className="flex overflow-hidden" style={{ height: '55%' }}>
            <TrackSvg
              trackName="银石赛道"
              driverPositions={drivers.slice(0, 8).map((d, i) => ({
                id: d.driverId,
                frac: i / 8,
                isPlayer: d.isPlayer,
              }))}
            />
            <GapChart
              trackName="银石"
              totalLaps={MOCK_TOTAL}
              currentLap={MOCK_LAP}
              series={GAP_SERIES}
              maxGapSec={42}
            />
          </div>

          {/* Bottom half: pit console */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <PitConsole
              totalLaps={MOCK_TOTAL}
              currentLap={MOCK_LAP}
              onReSimulate={(pitLap, compound, engineMode, trackTemp) => {
                // Phase 3: wire to store.runSimulation() with updated events
                console.log('[MFD] re-simulate:', { pitLap, compound, engineMode, trackTemp });
              }}
            />
          </div>
        </main>

        {/* Right: Radio log */}
        <RadioLog entries={MOCK_RADIO} />
      </div>

      {/* Escape hatch back to Phase 1 result */}
      <div className="absolute bottom-2 right-2 opacity-30 hover:opacity-100 transition-opacity">
        <button
          onClick={() => setView('home')}
          className="text-f1-muted text-[10px] px-2 py-1 border border-f1-border rounded"
        >
          ← 首页
        </button>
      </div>
    </div>
  );
}
