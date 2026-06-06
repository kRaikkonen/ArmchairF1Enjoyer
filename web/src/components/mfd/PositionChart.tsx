/**
 * Position chart — each driver's race position (rank) over the laps.
 * y-axis is inverted (P1 at the top). Classic F1 "position changes" view.
 * All data via props; positions come from result.lapHistory.
 */
import { t } from '../../i18n';

export interface PosSeries {
  id: string;
  label: string;
  color: string;
  positions: number[]; // 1-based position per lap (NaN if absent)
  highlighted?: boolean;
  dim?: boolean;
}

interface PositionChartProps {
  trackName: string;
  totalLaps: number;
  currentLap: number;
  series: PosSeries[];
  maxPos: number;
}

const W = 600, H = 210, PAD_LEFT = 28, PAD_RIGHT = 12, PAD_TOP = 12, PAD_BOTTOM = 24;
const CHART_W = W - PAD_LEFT - PAD_RIGHT;
const CHART_H = H - PAD_TOP - PAD_BOTTOM;

function lapX(lap: number, total: number) {
  return PAD_LEFT + ((lap - 1) / Math.max(total - 1, 1)) * CHART_W;
}
function posY(pos: number, maxPos: number) {
  // P1 at top (y = PAD_TOP), P{maxPos} at bottom.
  return PAD_TOP + ((pos - 1) / Math.max(maxPos - 1, 1)) * CHART_H;
}

function buildLine(positions: number[], total: number, maxPos: number): string {
  let d = '';
  let started = false;
  positions.forEach((p, i) => {
    if (!Number.isFinite(p)) return;
    const cmd = started ? 'L' : 'M';
    d += `${cmd} ${lapX(i + 1, total).toFixed(1)},${posY(p, maxPos).toFixed(1)} `;
    started = true;
  });
  return d.trim();
}

export function PositionChart({ trackName, totalLaps, currentLap, series, maxPos }: PositionChartProps) {
  const xTickEvery = totalLaps <= 30 ? 5 : 10;
  const xTicks: number[] = [];
  for (let l = 1; l <= totalLaps; l += xTickEvery) xTicks.push(l);
  if (!xTicks.includes(totalLaps)) xTicks.push(totalLaps);

  const posTicks: number[] = [];
  for (let p = 1; p <= maxPos; p += maxPos > 12 ? 4 : 3) posTicks.push(p);
  if (!posTicks.includes(maxPos)) posTicks.push(maxPos);

  const currentX = lapX(currentLap, totalLaps);

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden p-2">
      <div className="text-[10px] text-f1-muted uppercase tracking-widest mb-1">
        场上位置 — TRACK POSITION
        <span className="ml-2 text-[9px] text-f1-border">{trackName}</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full flex-1 min-h-0" preserveAspectRatio="xMidYMid meet">
        {/* Position grid lines */}
        {posTicks.map((p) => {
          const y = posY(p, maxPos);
          return (
            <g key={p}>
              <line x1={PAD_LEFT} y1={y} x2={W - PAD_RIGHT} y2={y} stroke="#2a2a3e" strokeWidth="1" />
              <text x={PAD_LEFT - 4} y={y + 3} textAnchor="end" fontSize="9" fill="#8888aa">P{p}</text>
            </g>
          );
        })}

        {/* X-axis ticks */}
        {xTicks.map((lap) => {
          const x = lapX(lap, totalLaps);
          return (
            <g key={lap}>
              <line x1={x} y1={PAD_TOP + CHART_H} x2={x} y2={PAD_TOP + CHART_H + 4} stroke="#2a2a3e" strokeWidth="1" />
              <text x={x} y={H - 4} textAnchor="middle" fontSize="9" fill="#8888aa">{lap}</text>
            </g>
          );
        })}

        <rect x={PAD_LEFT} y={PAD_TOP} width={CHART_W} height={CHART_H} fill="none" stroke="#2a2a3e" strokeWidth="1" />

        {/* Lines — player drawn last (on top) */}
        {[...series].sort((a, b) => Number(a.highlighted) - Number(b.highlighted)).map((s) => (
          <path key={s.id} d={buildLine(s.positions, totalLaps, maxPos)} fill="none" stroke={s.color}
            strokeWidth={s.highlighted ? 2.4 : s.dim ? 1 : 1.4}
            strokeOpacity={s.highlighted ? 1 : s.dim ? 0.5 : 0.85}
            strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {/* Current lap marker */}
        <line x1={currentX} y1={PAD_TOP} x2={currentX} y2={PAD_TOP + CHART_H} stroke="#f97316" strokeWidth="1.5" strokeDasharray="3 2" />
      </svg>

      <div className="flex gap-3 mt-1 px-1 items-center">
        {series.filter((s) => s.highlighted).map((s) => (
          <div key={s.id} className="flex items-center gap-1">
            <svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke={s.color} strokeWidth="2" /></svg>
            <span className="text-[9px] text-f1-muted">{s.label}</span>
          </div>
        ))}
        <span className="text-[9px] text-f1-border ml-auto">
          {t('hud.lapOf', { lap: currentLap, total: totalLaps }).split('/')[0].trim()} · 单 seed
        </span>
      </div>
    </div>
  );
}
