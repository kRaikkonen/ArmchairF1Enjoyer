/**
 * Event feed — the race's REAL timeline (every driver's real pit lap + tyre +
 * real stationary time, plus the real SC/VSC), shown on load so the player can
 * see what actually happened and decide what to change. The player's What-If
 * modifications are listed on top, highlighted. Editing happens in the strategy
 * panel (pick a driver → their real pits load with real times; SC/VSC are an
 * editable list).
 */
import type { EventEffect } from '../../engine/types';
import { PIT_LANE_IN_SEC, PIT_LANE_OUT_SEC, DEFAULT_PIT_STATIONARY_SEC } from '../../engine/events';

interface EventFeedProps {
  /** The real race (all drivers' real pits + real SC/VSC). */
  realEvents: EventEffect[];
  /** The player's modifications (overridden drivers' pits/ers + added race events). */
  modEvents: EventEffect[];
  /** Drivers the player took over — their real pits are superseded by modEvents. */
  overriddenDrivers: string[];
  isWhatIf: boolean;
}

const COMPOUND_LABEL: Record<string, string> = { SOFT: '软', MEDIUM: '中', HARD: '硬', INTER: '中性', WET: '湿' };
const ERS_LABEL: Record<string, string> = { attack: '激进', neutral: '标准', save: '节能' };

interface FeedRow { lap: number; icon: string; cls: string; text: string; }

function rowFor(e: EventEffect): FeedRow | null {
  if (e.type === 'pit') {
    const comp = COMPOUND_LABEL[e.compound ?? ''] ?? e.compound ?? '';
    const stat = e.pitStationarySec ?? DEFAULT_PIT_STATIONARY_SEC;
    const total = PIT_LANE_IN_SEC + stat + PIT_LANE_OUT_SEC;
    const slow = stat > DEFAULT_PIT_STATIONARY_SEC + 0.6 ? ` · 慢停 ${total.toFixed(1)}s` : '';
    return { lap: e.lap, icon: '🛞', cls: slow ? 'text-red-400' : 'text-f1-orange', text: `${e.driverId ?? ''} 进站 → ${comp}${slow}` };
  }
  if (e.type === 'ers_mode') return { lap: e.lap, icon: '⚡', cls: 'text-blue-400', text: `${e.driverId ?? ''} 引擎 → ${ERS_LABEL[e.ersMode ?? ''] ?? e.ersMode}` };
  if (e.type === 'penalty') return { lap: e.lap, icon: '⏱', cls: 'text-red-400', text: `${e.driverId ?? ''} 罚时 +${e.penaltySec ?? 0}s` };
  if (e.type === 'safety_car') return { lap: e.lap, icon: '🟡', cls: 'text-yellow-400', text: `安全车 SC · ${e.duration ?? 3} 圈` };
  if (e.type === 'vsc') return { lap: e.lap, icon: '🟡', cls: 'text-yellow-300', text: `VSC · ${e.duration ?? 2} 圈` };
  if (e.type === 'rain') return { lap: e.lap, icon: '🌧', cls: 'text-blue-300', text: `雨天 ${e.isWet ? '转湿' : '转干'}` };
  return null;
}

const toRows = (events: EventEffect[]): FeedRow[] =>
  events.map(rowFor).filter((r): r is FeedRow => r !== null).sort((a, b) => a.lap - b.lap);

function List({ rows }: { rows: FeedRow[] }) {
  return (
    <ul className="p-1.5 space-y-1">
      {rows.map((r, i) => (
        <li key={i} className="flex items-start gap-1.5 text-[10px] leading-tight">
          <span className="font-mono text-f1-muted w-7 text-right shrink-0">L{r.lap}</span>
          <span className="shrink-0">{r.icon}</span>
          <span className={r.cls}>{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function EventFeed({ realEvents, modEvents, overriddenDrivers, isWhatIf }: EventFeedProps) {
  const overridden = new Set(overriddenDrivers);
  // real timeline, minus the pits of drivers the player took over (those show as mods)
  const realRows = toRows(realEvents.filter((e) => !(e.type === 'pit' && e.driverId && overridden.has(e.driverId))));
  const modRows = toRows(modEvents);

  return (
    <aside className="w-[200px] shrink-0 flex flex-col border-l border-f1-border bg-f1-surface overflow-hidden">
      <div className="px-2 py-1.5 text-[10px] uppercase tracking-widest text-f1-muted border-b border-f1-border shrink-0 flex items-center justify-between">
        <span>本场事件</span>
        {isWhatIf ? <span className="text-f1-orange">What-If</span> : <span className="text-green-500">真实</span>}
      </div>

      <div className="overflow-y-auto flex-1">
        {modRows.length > 0 && (
          <>
            <div className="px-2 pt-1.5 text-[9px] uppercase tracking-widest text-f1-orange">你的修改</div>
            <List rows={modRows} />
            <div className="px-2 pt-1 text-[9px] uppercase tracking-widest text-f1-muted border-t border-f1-border">本场真实</div>
          </>
        )}
        {realRows.length > 0 ? (
          <List rows={realRows} />
        ) : (
          <div className="p-3 text-[10px] text-f1-muted leading-relaxed">本场无真实进站/安全车记录。</div>
        )}
      </div>
    </aside>
  );
}
