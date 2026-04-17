/**
 * Gap Chart — SVG-based gap-to-leader chart with uncertainty bands.
 *
 * Each compound group is rendered as:
 *   1. A filled polygon (the uncertainty band, ±uncertainty per lap)
 *   2. A polyline (the median/expected gap)
 *
 * The uncertainty band widens after the first pit window (later laps are
 * less predictable) — a deliberate design choice, not a physics fit.
 *
 * All data passed via props; mock data injected by parent (MfdPage).
 */
import { t } from '../../i18n';

// ── Types ──────────────────────────────────────────────────────────────────

export interface GapSeries {
  id: string;           // e.g. 'c4-soft'
  label: string;        // e.g. 'C4 软'
  color: string;        // hex
  gaps: number[];       // gap to leader per lap (length = totalLaps)
  uncertainty: number[];// ±σ per lap — widens towards end
  highlighted?: boolean; // player's group
}

interface GapChartProps {
  trackName: string;
  totalLaps: number;
  currentLap: number;
  series: GapSeries[];
  maxGapSec?: number;
}

// ── Layout constants (UI, not physics) ────────────────────────────────────
const W          = 600;
const H          = 210;
const PAD_LEFT   = 36;
const PAD_RIGHT  = 12;
const PAD_TOP    = 14;
const PAD_BOTTOM = 28;
const CHART_W    = W - PAD_LEFT - PAD_RIGHT;
const CHART_H    = H - PAD_TOP  - PAD_BOTTOM;

// ── Coordinate helpers ─────────────────────────────────────────────────────

function lapX(lap: number, total: number) {
  return PAD_LEFT + ((lap - 1) / Math.max(total - 1, 1)) * CHART_W;
}

function gapY(gap: number, maxGap: number) {
  const clamped = Math.min(Math.max(gap, 0), maxGap);
  return PAD_TOP + (clamped / maxGap) * CHART_H;
}

// ── SVG path builders ─────────────────────────────────────────────────────

function buildCenterLine(gaps: number[], total: number, maxGap: number): string {
  return gaps
    .map((g, i) => `${i === 0 ? 'M' : 'L'} ${lapX(i + 1, total).toFixed(1)},${gapY(g, maxGap).toFixed(1)}`)
    .join(' ');
}

function buildBandPolygon(
  gaps: number[],
  uncertainty: number[],
  total: number,
  maxGap: number,
): string {
  // Upper edge (gap + σ)
  const upper = gaps.map((g, i) =>
    `${lapX(i + 1, total).toFixed(1)},${gapY(g + uncertainty[i], maxGap).toFixed(1)}`
  );
  // Lower edge (gap - σ) — reversed for closed polygon
  const lower = gaps.map((g, i) =>
    `${lapX(i + 1, total).toFixed(1)},${gapY(Math.max(0, g - uncertainty[i]), maxGap).toFixed(1)}`
  ).reverse();
  return `M ${upper[0]} L ${upper.slice(1).join(' L ')} L ${lower[0]} L ${lower.slice(1).join(' L ')} Z`;
}

// ── Y-axis tick values ─────────────────────────────────────────────────────

function yTicks(maxGap: number): number[] {
  const step = maxGap <= 20 ? 5 : 10;
  const ticks: number[] = [];
  for (let v = 0; v <= maxGap; v += step) ticks.push(v);
  return ticks;
}

// ── Component ─────────────────────────────────────────────────────────────

export function GapChart({
  trackName, totalLaps, currentLap, series, maxGapSec = 40,
}: GapChartProps) {
  const xTickEvery = totalLaps <= 30 ? 5 : 10;
  const xTicks: number[] = [];
  for (let l = 1; l <= totalLaps; l += xTickEvery) xTicks.push(l);
  if (!xTicks.includes(totalLaps)) xTicks.push(totalLaps);

  const currentX = lapX(currentLap, totalLaps);

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden p-2">
      <div className="text-[10px] text-f1-muted uppercase tracking-widest mb-1">
        {t('chart.title')}
        <span className="ml-2 text-[9px] text-f1-border">
          {t('chart.track', { track: trackName })}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full flex-1 min-h-0"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid lines */}
        {yTicks(maxGapSec).map((v) => {
          const y = gapY(v, maxGapSec);
          return (
            <g key={v}>
              <line
                x1={PAD_LEFT} y1={y} x2={W - PAD_RIGHT} y2={y}
                stroke="#2a2a3e" strokeWidth="1"
              />
              <text
                x={PAD_LEFT - 4} y={y + 3}
                textAnchor="end" fontSize="9" fill="#8888aa"
              >
                {v === 0 ? '' : `+${v}s`}
              </text>
            </g>
          );
        })}

        {/* X-axis ticks */}
        {xTicks.map((lap) => {
          const x = lapX(lap, totalLaps);
          return (
            <g key={lap}>
              <line
                x1={x} y1={PAD_TOP + CHART_H} x2={x} y2={PAD_TOP + CHART_H + 4}
                stroke="#2a2a3e" strokeWidth="1"
              />
              <text
                x={x} y={H - 6}
                textAnchor="middle" fontSize="9" fill="#8888aa"
              >
                {lap}
              </text>
            </g>
          );
        })}

        {/* Chart border */}
        <rect
          x={PAD_LEFT} y={PAD_TOP}
          width={CHART_W} height={CHART_H}
          fill="none" stroke="#2a2a3e" strokeWidth="1"
        />

        {/* Series: bands first (below lines) */}
        {series.map((s) => (
          <path
            key={`band-${s.id}`}
            d={buildBandPolygon(s.gaps, s.uncertainty, totalLaps, maxGapSec)}
            fill={s.color}
            fillOpacity={s.highlighted ? 0.18 : 0.10}
            stroke="none"
          />
        ))}

        {/* Series: center lines */}
        {series.map((s) => (
          <path
            key={`line-${s.id}`}
            d={buildCenterLine(s.gaps, totalLaps, maxGapSec)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.highlighted ? 1.8 : 1.2}
            strokeOpacity={s.highlighted ? 1 : 0.7}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* Current lap marker */}
        <line
          x1={currentX} y1={PAD_TOP}
          x2={currentX} y2={PAD_TOP + CHART_H}
          stroke="#f97316" strokeWidth="1.5" strokeDasharray="3 2"
        />
        <text
          x={currentX + 3} y={PAD_TOP + 10}
          fontSize="9" fill="#f97316"
        >
          {t('hud.lapOf', { lap: currentLap, total: totalLaps }).split('/')[0].trim()}
        </text>
      </svg>

      {/* Compound legend */}
      <div className="flex gap-3 mt-1 px-1">
        {series.map((s) => (
          <div key={s.id} className="flex items-center gap-1">
            <svg width="16" height="8">
              <rect x="0" y="3" width="16" height="4"
                fill={s.color} fillOpacity="0.25" />
              <line x1="0" y1="5" x2="16" y2="5"
                stroke={s.color} strokeWidth="1.5" />
            </svg>
            <span className="text-[9px] text-f1-muted">{s.label}</span>
          </div>
        ))}
        <span className="text-[9px] text-f1-border ml-auto">
          {t('chart.uncertainty')}
        </span>
      </div>
    </div>
  );
}
