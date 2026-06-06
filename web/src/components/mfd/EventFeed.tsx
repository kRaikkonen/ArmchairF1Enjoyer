/**
 * Event feed — a readable log of the player's What-If modifications for the
 * current scenario (pit strategy, engine-mode changes, penalties, SC/VSC/rain).
 * Driven by the events from the last "重新推演".
 */
import type { EventEffect } from '../../engine/types';
import { PIT_LANE_IN_SEC, PIT_LANE_OUT_SEC, DEFAULT_PIT_STATIONARY_SEC } from '../../engine/events';

interface EventFeedProps {
  events: EventEffect[];
  isWhatIf: boolean;
}

const COMPOUND_LABEL: Record<string, string> = { SOFT: '软', MEDIUM: '中', HARD: '硬', INTER: '中性', WET: '湿' };
const ERS_LABEL: Record<string, string> = { attack: '激进', neutral: '标准', save: '节能' };

interface FeedRow { lap: number; icon: string; cls: string; text: string; }

function toRows(events: EventEffect[]): FeedRow[] {
  const rows: FeedRow[] = [];
  for (const e of events) {
    if (e.type === 'pit') {
      const comp = COMPOUND_LABEL[e.compound ?? ''] ?? e.compound ?? '';
      const stat = e.pitStationarySec ?? DEFAULT_PIT_STATIONARY_SEC;
      const total = PIT_LANE_IN_SEC + stat + PIT_LANE_OUT_SEC;
      const slow = stat > DEFAULT_PIT_STATIONARY_SEC ? ` · 慢停 ${total.toFixed(1)}s` : '';
      rows.push({ lap: e.lap, icon: '🛞', cls: 'text-f1-orange', text: `${e.driverId ?? ''} 进站 → ${comp}${slow}` });
    } else if (e.type === 'ers_mode') {
      rows.push({ lap: e.lap, icon: '⚡', cls: 'text-blue-400', text: `${e.driverId ?? ''} 引擎 → ${ERS_LABEL[e.ersMode ?? ''] ?? e.ersMode}` });
    } else if (e.type === 'penalty') {
      rows.push({ lap: e.lap, icon: '⏱', cls: 'text-red-400', text: `${e.driverId ?? ''} 罚时 +${e.penaltySec ?? 0}s` });
    } else if (e.type === 'safety_car') {
      rows.push({ lap: e.lap, icon: '🟡', cls: 'text-yellow-400', text: `安全车 SC · ${e.duration ?? 3} 圈` });
    } else if (e.type === 'vsc') {
      rows.push({ lap: e.lap, icon: '🟡', cls: 'text-yellow-300', text: `VSC · ${e.duration ?? 2} 圈` });
    } else if (e.type === 'rain') {
      rows.push({ lap: e.lap, icon: '🌧', cls: 'text-blue-300', text: `雨天 ${e.isWet ? '转湿' : '转干'}` });
    }
  }
  return rows.sort((a, b) => a.lap - b.lap);
}

export function EventFeed({ events, isWhatIf }: EventFeedProps) {
  const rows = toRows(events);

  return (
    <aside className="w-[200px] shrink-0 flex flex-col border-l border-f1-border bg-f1-surface overflow-hidden">
      <div className="px-2 py-1.5 text-[10px] uppercase tracking-widest text-f1-muted border-b border-f1-border shrink-0 flex items-center justify-between">
        <span>本场修改</span>
        {isWhatIf ? <span className="text-f1-orange">What-If</span> : <span className="text-green-500">真实</span>}
      </div>

      {(!isWhatIf || rows.length === 0) ? (
        <div className="p-3 text-[10px] text-f1-muted leading-relaxed">
          真实复现 · 无修改。<br />在右侧策略面板改动后点「重新推演」，这里会列出你注入的所有事件。
        </div>
      ) : (
        <ul className="overflow-y-auto flex-1 p-1.5 space-y-1">
          {rows.map((r, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[10px] leading-tight">
              <span className="font-mono text-f1-muted w-7 text-right shrink-0">L{r.lap}</span>
              <span className="shrink-0">{r.icon}</span>
              <span className={r.cls}>{r.text}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
