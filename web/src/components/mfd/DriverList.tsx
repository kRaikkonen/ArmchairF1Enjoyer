/**
 * Driver List — left column.
 * Shows current race standings; clicking a row switches the "controlled" driver.
 */
import { t } from '../../i18n';
import { teamColor } from '../../engine/teamColors';

export interface DriverEntry {
  position: number;
  driverId: string;
  team: string;
  compound: string;
  gap: string;       // e.g. "+19.1s" or "领跑"
  isPlayer: boolean;
  hasPitted: boolean;
}

// Compound badge colors for tire nomination labels (C1–C5 relative)
// These are UI constants, not physics fits.
const COMPOUND_BADGE: Record<string, { bg: string; text: string }> = {
  C5: { bg: 'bg-red-600',    text: 'text-white'     }, // soft
  C4: { bg: 'bg-amber-400',  text: 'text-gray-900'  }, // medium
  C3: { bg: 'bg-gray-300',   text: 'text-gray-900'  }, // hard
  C2: { bg: 'bg-blue-500',   text: 'text-white'     }, // inter
  C1: { bg: 'bg-blue-800',   text: 'text-white'     }, // wet
};
const FALLBACK_BADGE = { bg: 'bg-f1-muted', text: 'text-white' };

interface DriverListProps {
  drivers: DriverEntry[];
  onSelectDriver: (id: string) => void;
}

export function DriverList({ drivers, onSelectDriver }: DriverListProps) {
  return (
    <aside className="w-[192px] shrink-0 flex flex-col border-r border-f1-border bg-f1-surface overflow-hidden">
      <div className="px-2 py-1.5 text-[10px] uppercase tracking-widest text-f1-muted border-b border-f1-border shrink-0">
        {t('drivers.title')}
      </div>
      <ul className="overflow-y-auto flex-1">
        {drivers.map((d) => {
          const badge  = COMPOUND_BADGE[d.compound] ?? FALLBACK_BADGE;
          const color  = teamColor(d.team);
          const isLeader = d.position === 1;

          return (
            <li key={d.driverId}>
              <button
                onClick={() => onSelectDriver(d.driverId)}
                style={{ borderLeftColor: color }}
                className={[
                  'w-full flex items-center gap-1.5 px-2 py-1.5 border-l-2 border-b border-f1-border',
                  'text-left transition-colors text-xs',
                  d.isPlayer
                    ? 'bg-f1-mid text-f1-text'
                    : 'bg-f1-surface text-f1-muted hover:bg-f1-mid hover:text-f1-text',
                ].join(' ')}
              >
                {/* Position */}
                <span className="w-4 text-right font-mono text-f1-muted text-[10px]">
                  {d.position}
                </span>

                {/* Driver ID */}
                <span className={`w-8 font-bold text-[11px] ${d.isPlayer ? 'text-f1-orange' : ''}`}>
                  {d.driverId}
                </span>

                {/* Compound badge */}
                <span
                  className={`px-1 py-0.5 rounded text-[9px] font-bold leading-none ${badge.bg} ${badge.text}`}
                >
                  {d.compound}
                </span>

                {/* Gap / leader */}
                <span className={`ml-auto text-[10px] font-mono ${isLeader ? 'text-green-400' : ''}`}>
                  {isLeader ? t('drivers.leader') : d.gap}
                </span>

                {/* Pitted tick */}
                {d.hasPitted && (
                  <span className="text-f1-orange text-[9px]">✓已进</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
