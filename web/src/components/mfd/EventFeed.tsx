/**
 * Event feed — the EFFECTIVE race timeline (real events with the player's edits/
 * removals applied), so a removed pit/SC is simply gone (not "add-only"), and the
 * player's changes are flagged. Two views: 全部 (whole field) and 本车手 (just the
 * selected driver's events + the global SC/VSC for context). Editing happens in
 * the strategy panel; this is the read-out.
 */
import { useState } from 'react';
import type { EventEffect } from '../../engine/types';
import { PIT_LANE_IN_SEC, PIT_LANE_OUT_SEC, DEFAULT_PIT_STATIONARY_SEC } from '../../engine/events';

export interface FeedItem { e: EventEffect; modified: boolean; }

interface EventFeedProps {
  events: FeedItem[];
  playerId: string;
  isWhatIf: boolean;
}

const COMPOUND_LABEL: Record<string, string> = { SOFT: '软', MEDIUM: '中', HARD: '硬', INTER: '中性', WET: '湿' };
const ERS_LABEL: Record<string, string> = { attack: '激进', neutral: '标准', save: '节能' };

interface FeedRow { lap: number; icon: string; cls: string; text: string; modified: boolean; }

function rowFor(e: EventEffect, modified: boolean): FeedRow | null {
  const base = { lap: e.lap, modified };
  if (e.type === 'pit') {
    const comp = COMPOUND_LABEL[e.compound ?? ''] ?? e.compound ?? '';
    const stat = e.pitStationarySec ?? DEFAULT_PIT_STATIONARY_SEC;
    const total = PIT_LANE_IN_SEC + stat + PIT_LANE_OUT_SEC;
    const slow = stat > DEFAULT_PIT_STATIONARY_SEC + 0.6 ? ` · 慢停 ${total.toFixed(1)}s` : '';
    return { ...base, icon: '🛞', cls: slow ? 'text-red-400' : 'text-f1-orange', text: `${e.driverId ?? ''} 进站 → ${comp}${slow}` };
  }
  if (e.type === 'ers_mode') return { ...base, icon: '⚡', cls: 'text-blue-400', text: `${e.driverId ?? ''} 引擎 → ${ERS_LABEL[e.ersMode ?? ''] ?? e.ersMode}` };
  if (e.type === 'penalty') return { ...base, icon: '⏱', cls: 'text-red-400', text: `${e.driverId ?? ''} 罚时 +${e.penaltySec ?? 0}s` };
  if (e.type === 'safety_car') return { ...base, icon: '🟡', cls: 'text-yellow-400', text: `安全车 SC · ${e.duration ?? 3} 圈` };
  if (e.type === 'vsc') return { ...base, icon: '🟡', cls: 'text-yellow-300', text: `VSC · ${e.duration ?? 2} 圈` };
  if (e.type === 'rain') return { ...base, icon: '🌧', cls: 'text-blue-300', text: `雨天 ${e.isWet ? '转湿' : '转干'}` };
  return null;
}

const isGlobal = (e: EventEffect) => e.type === 'safety_car' || e.type === 'vsc' || e.type === 'rain';

export function EventFeed({ events, playerId, isWhatIf }: EventFeedProps) {
  const [mine, setMine] = useState(false);

  const rows = events
    .filter(({ e }) => !mine || isGlobal(e) || e.driverId === playerId)
    .map(({ e, modified }) => rowFor(e, modified))
    .filter((r): r is FeedRow => r !== null)
    .sort((a, b) => a.lap - b.lap);
  const modCount = rows.filter((r) => r.modified).length;

  const Tab = (key: boolean, label: string) => (
    <button onClick={() => setMine(key)}
      className={`px-1.5 py-0.5 rounded ${mine === key ? 'bg-f1-mid text-f1-text' : 'text-f1-muted'}`}>{label}</button>
  );

  return (
    <aside className="w-[200px] shrink-0 flex flex-col border-l border-f1-border bg-f1-surface overflow-hidden">
      <div className="px-2 py-1.5 border-b border-f1-border shrink-0 flex items-center justify-between text-[10px]">
        <span className="uppercase tracking-widest text-f1-muted">本场事件</span>
        {isWhatIf ? <span className="text-f1-orange">已改 {modCount}</span> : <span className="text-green-500">真实</span>}
      </div>
      <div className="px-1.5 py-1 flex gap-1 text-[10px] border-b border-f1-border shrink-0">
        {Tab(false, '全部')}
        {Tab(true, `本车手 ${playerId}`)}
      </div>

      {rows.length > 0 ? (
        <ul className="overflow-y-auto flex-1 p-1.5 space-y-1">
          {rows.map((r, i) => (
            <li key={i} className="flex items-start gap-1 text-[10px] leading-tight">
              <span className="font-mono text-f1-muted w-7 text-right shrink-0">L{r.lap}</span>
              <span className="shrink-0">{r.icon}</span>
              <span className={r.cls}>{r.text}</span>
              {r.modified && <span className="ml-auto shrink-0 text-[8px] text-f1-orange border border-f1-orange/50 rounded px-0.5">改</span>}
            </li>
          ))}
        </ul>
      ) : (
        <div className="p-3 text-[10px] text-f1-muted leading-relaxed">{mine ? `${playerId} 本场无进站/事件（已全部移除？）` : '本场无事件。'}</div>
      )}
    </aside>
  );
}
