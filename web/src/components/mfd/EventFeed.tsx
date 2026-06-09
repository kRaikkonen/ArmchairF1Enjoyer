/**
 * Event feed — the EFFECTIVE race timeline (real events with the player's edits/
 * removals applied), and it's INTERACTIVE: click a pit/ers/penalty row to jump to
 * editing that driver, or × to remove any event (any driver). A removed pit/SC is
 * simply gone (not "add-only"); the player's changes are flagged 改. Two views:
 * 全部 (whole field) and 本车手 (selected driver + global SC/VSC for context).
 */
import { useState } from 'react';
import type { EventEffect } from '../../engine/types';
import { PIT_LANE_IN_SEC, PIT_LANE_OUT_SEC, DEFAULT_PIT_STATIONARY_SEC } from '../../engine/events';

export interface FeedItem { e: EventEffect; modified: boolean; }

interface EventFeedProps {
  events: FeedItem[];
  playerId: string;
  /** Drivers currently in the sim grid (finishers) — only these are editable. */
  editableDrivers: Set<string>;
  onEditDriver: (driverId: string) => void;
  onRemove: (item: FeedItem) => void;
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

export function EventFeed({ events, playerId, editableDrivers, onEditDriver, onRemove, isWhatIf }: EventFeedProps) {
  const [mine, setMine] = useState(false);

  const rows = events
    .filter(({ e }) => !mine || isGlobal(e) || e.driverId === playerId)
    .map((item) => { const r = rowFor(item.e, item.modified); return r ? { r, item } : null; })
    .filter((x): x is { r: FeedRow; item: FeedItem } => x !== null)
    .sort((a, b) => a.r.lap - b.r.lap);
  const modCount = rows.filter(({ r }) => r.modified).length;

  const Tab = (key: boolean, label: string) => (
    <button onClick={() => setMine(key)}
      className={`px-1.5 py-0.5 rounded ${mine === key ? 'bg-f1-mid text-f1-text' : 'text-f1-muted'}`}>{label}</button>
  );

  return (
    <aside className="w-[208px] shrink-0 flex flex-col border-l border-f1-border bg-f1-surface overflow-hidden">
      <div className="px-2 py-1.5 border-b border-f1-border shrink-0 flex items-center justify-between text-[10px]">
        <span className="uppercase tracking-widest text-f1-muted">本场事件 · 点击编辑</span>
        {isWhatIf ? <span className="text-f1-orange">已改 {modCount}</span> : <span className="text-green-500">真实</span>}
      </div>
      <div className="px-1.5 py-1 flex gap-1 text-[10px] border-b border-f1-border shrink-0">
        {Tab(false, '全部')}
        {Tab(true, `本车手 ${playerId}`)}
      </div>

      {rows.length > 0 ? (
        <ul className="overflow-y-auto flex-1 p-1 space-y-0.5">
          {rows.map(({ r, item }, i) => {
            const drv = item.e.driverId;
            const canEdit = !!drv && editableDrivers.has(drv);
            return (
              <li key={i} className="group flex items-center gap-1 text-[10px] leading-tight rounded hover:bg-f1-mid/60 px-1 py-0.5">
                <span className="font-mono text-f1-muted w-7 text-right shrink-0">L{r.lap}</span>
                <span className="shrink-0">{r.icon}</span>
                <button
                  className={`text-left flex-1 truncate ${r.cls} ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
                  onClick={() => canEdit && onEditDriver(drv!)}
                  title={canEdit ? `编辑 ${drv} 策略` : ''}
                >{r.text}</button>
                {r.modified && <span className="shrink-0 text-[8px] text-f1-orange border border-f1-orange/50 rounded px-0.5">改</span>}
                <button
                  className="shrink-0 text-f1-muted hover:text-f1-red text-sm leading-none opacity-40 group-hover:opacity-100"
                  onClick={() => onRemove(item)}
                  title="移除此事件"
                >×</button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="p-3 text-[10px] text-f1-muted leading-relaxed">{mine ? `${playerId} 本场无进站/事件。` : '本场无事件。'}</div>
      )}
    </aside>
  );
}
