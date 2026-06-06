/**
 * Track-position view — drivers placed on the REAL circuit outline at their
 * approximate on-track location for the scrubbed lap.
 *
 * The engine ranks by cumulative time, not physical track position (debt #4),
 * so a car's location is ESTIMATED: leader at the start/finish line, every other
 * car placed behind by (gap / lap-time) of a lap. This makes the Safety-Car
 * bunching visible (cars cluster nose-to-tail), but it is an estimate, not GPS —
 * labelled as such (§8.6, no false precision).
 */
import { useMemo } from 'react';
import type { TrackOutline } from '../../engine/types';

export interface TrackDriver {
  id: string;
  gapToLeaderSec: number; // 0 for the leader
  color: string;
  isPlayer: boolean;
  carNumber: number; // shown on the dot (e.g. VER = 1)
}

/** How far the whole pack rotates around the circuit per lap of the scrubber.
 * The absolute on-track position is unmodelled, so this is a cosmetic phase so
 * the leader isn't frozen at the start/finish line as you scrub. */
const PACK_ROTATION_PER_LAP = 0.37;

interface TrackPositionViewProps {
  trackName: string;
  outline: TrackOutline | null | undefined;
  drivers: TrackDriver[];
  lapRefSec: number; // representative lap time → converts a time gap to a lap fraction
  currentLap: number;
  totalLaps: number;
}

function parsePoints(path: string): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const re = /[ML]\s*([\d.]+),([\d.]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) pts.push([parseFloat(m[1]), parseFloat(m[2])]);
  return pts;
}

export function TrackPositionView({ trackName, outline, drivers, lapRefSec, currentLap, totalLaps }: TrackPositionViewProps) {
  const geom = useMemo(() => {
    if (!outline) return null;
    const pts = parsePoints(outline.path);
    if (pts.length < 2) return null;
    // Close the loop (the path's trailing 'Z' returns to the first point) so the
    // segment from the last vertex back to the start/finish is included.
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) pts.push([first[0], first[1]]);
    const cum: number[] = [0];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      cum.push(cum[i - 1] + Math.hypot(x1 - x0, y1 - y0));
    }
    return { pts, cum, total: cum[cum.length - 1] };
  }, [outline]);

  function pointAtFrac(frac: number): [number, number] {
    if (!geom) return [0, 0];
    const target = ((frac % 1) + 1) % 1 * geom.total;
    // binary-ish linear scan (paths are ~700 pts, fine)
    let i = 1;
    while (i < geom.cum.length && geom.cum[i] < target) i++;
    const a = geom.pts[i - 1];
    const b = geom.pts[Math.min(i, geom.pts.length - 1)];
    const segLen = geom.cum[Math.min(i, geom.cum.length - 1)] - geom.cum[i - 1] || 1;
    const t = Math.max(0, Math.min(1, (target - geom.cum[i - 1]) / segLen));
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden p-2">
      <div className="text-[10px] text-f1-muted uppercase tracking-widest mb-1">
        赛道位置 — TRACK MAP
        <span className="ml-2 text-[9px] text-f1-border">{trackName} · L{currentLap}/{totalLaps}</span>
      </div>

      {outline && geom ? (
        <svg viewBox={outline.viewBox} className="w-full flex-1 min-h-0" preserveAspectRatio="xMidYMid meet">
          <path d={outline.path} fill="none" stroke="#2a2a3e" strokeWidth={34} strokeLinecap="round" strokeLinejoin="round" />
          <path d={outline.path} fill="none" stroke="#454560" strokeWidth={22} strokeLinecap="round" strokeLinejoin="round" />
          {/* start/finish */}
          <circle cx={outline.startFinish.x} cy={outline.startFinish.y} r={10} fill="none" stroke="#e8002d" strokeWidth={4} />

          {/* driver dots — the pack rotates with the lap (leader not pinned to
              S/F); each car sits behind the leader by gap / lap-time. */}
          {(() => {
            const leaderPhase = ((currentLap - 1) * PACK_ROTATION_PER_LAP) % 1;
            return [...drivers].sort((a, b) => Number(a.isPlayer) - Number(b.isPlayer)).map((d) => {
              const frac = (((leaderPhase - Math.max(0, d.gapToLeaderSec) / lapRefSec) % 1) + 1) % 1;
              const [x, y] = pointAtFrac(frac);
              return (
                <g key={d.id}>
                  <circle cx={x} cy={y} r={d.isPlayer ? 22 : 16} fill={d.color} stroke={d.isPlayer ? '#fff' : '#11111b'} strokeWidth={d.isPlayer ? 5 : 3} />
                  <text x={x} y={y + 6} textAnchor="middle" fontSize={d.isPlayer ? 19 : 14} fontWeight="bold" fill={d.isPlayer ? '#11111b' : '#fff'}>{d.carNumber}</text>
                </g>
              );
            });
          })()}
        </svg>
      ) : (
        <div className="text-[10px] text-f1-muted py-8 text-center">无赛道轮廓数据</div>
      )}

      <div className="text-[9px] text-f1-border mt-1">
        位置由时间差估算（引擎按时间排名，不建模真实赛道坐标）· 安全车收车后车阵贴尾会在此聚拢
      </div>
    </div>
  );
}
