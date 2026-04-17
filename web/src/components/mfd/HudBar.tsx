/**
 * HUD Bar — full-width top strip.
 * Left:  logo | track | lap counter | race status badge
 * Right: player label | pos | tire | gap | next-pit lap
 */
import { t } from '../../i18n';

interface HudBarProps {
  track: string;
  season: number;
  lap: number;
  totalLaps: number;
  status: 'green' | 'sc' | 'vsc' | 'rain';
  playerId: string;
  position: number;
  compound: string;
  gapToLeader: string;
  nextPitLap: number;
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  green: { label: t('hud.status.green'), cls: 'bg-green-600 text-white' },
  sc:    { label: t('hud.status.sc'),    cls: 'bg-yellow-500 text-gray-900' },
  vsc:   { label: t('hud.status.vsc'),  cls: 'bg-yellow-400 text-gray-900' },
  rain:  { label: t('hud.status.rain'), cls: 'bg-blue-600 text-white' },
};

export function HudBar({
  track, season, lap, totalLaps, status,
  playerId, position, compound, gapToLeader, nextPitLap,
}: HudBarProps) {
  const st = STATUS_STYLE[status] ?? STATUS_STYLE.green;

  return (
    <header className="flex items-center justify-between px-3 h-9 bg-f1-surface border-b border-f1-border shrink-0 text-xs">
      {/* Left cluster */}
      <div className="flex items-center gap-3">
        <span className="font-bold text-f1-red tracking-widest text-[11px] uppercase">
          {t('app.title')}
        </span>
        <span className="text-f1-muted">|</span>
        <span className="text-f1-text font-medium">{track}</span>
        <span className="text-f1-muted">·</span>
        <span className="text-f1-muted">{season}</span>
        <span className="text-f1-muted">·</span>
        <span className="font-mono text-f1-text font-semibold">
          {t('hud.lapOf', { lap, total: totalLaps })}
        </span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${st.cls}`}>
          {st.label}
        </span>
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-4">
        <HudStat label={t('hud.player')}   value={playerId} bold />
        <HudStat label={t('hud.position')} value={`P${position}`} />
        <HudStat label={t('hud.tire')}     value={compound}
          valueClass="font-mono bg-gray-700 px-1 rounded" />
        <HudStat label={t('hud.gap')}      value={gapToLeader}
          valueClass="font-mono text-yellow-400" />
        <HudStat label={t('hud.nextPit')}  value={`L${nextPitLap}`}
          valueClass="font-mono text-f1-orange" />
      </div>
    </header>
  );
}

function HudStat({
  label, value, bold = false, valueClass = '',
}: {
  label: string; value: string; bold?: boolean; valueClass?: string;
}) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-f1-muted text-[10px] uppercase tracking-wider">{label}</span>
      <span className={`text-f1-text font-semibold ${bold ? 'text-f1-orange' : ''} ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}
