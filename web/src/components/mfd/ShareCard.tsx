/**
 * Share card — a screenshot-worthy result card for the player's What-If, the
 * product's social-growth artifact. Renders a styled card and exports it to a
 * PNG (html2canvas) for one-tap save/share.
 */
import { useRef, useState } from 'react';
import type { EventEffect } from '../../engine/types';

interface ShareCardProps {
  driverId: string;
  teamColor: string;
  realPos: number;
  simPos: number;
  delta: number; // realPos - simPos; >0 = gained
  eventName: string;
  season: number;
  seed: number;
  feedEvents: EventEffect[];
  shareUrl: string;
  onClose: () => void;
}

const COMPOUND_LABEL: Record<string, string> = { SOFT: '软', MEDIUM: '中', HARD: '硬', INTER: '中性', WET: '湿' };
const ERS_LABEL: Record<string, string> = { attack: '激进', neutral: '标准', save: '节能' };

/** One-line human summaries of the controlled driver's key moves. */
function keyMoves(driverId: string, events: EventEffect[]): string[] {
  const lines: string[] = [];
  for (const e of events) {
    if (e.type === 'pit' && e.driverId === driverId) lines.push(`L${e.lap} 进站 → ${COMPOUND_LABEL[e.compound ?? ''] ?? e.compound}`);
    else if (e.type === 'ers_mode' && e.driverId === driverId) lines.push(`L${e.lap} 引擎 ${ERS_LABEL[e.ersMode ?? ''] ?? e.ersMode}`);
    else if (e.type === 'penalty') lines.push(`${e.driverId} 罚时 +${e.penaltySec}s`);
    else if (e.type === 'safety_car') lines.push(`L${e.lap} 安全车`);
    else if (e.type === 'rain') lines.push(`L${e.lap} ${e.isWet ? '下雨' : '转干'}`);
  }
  return lines.slice(0, 4);
}

export function ShareCard(p: ShareCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const won = p.delta > 0;
  const moves = keyMoves(p.driverId, p.feedEvents);

  async function saveImage() {
    if (!cardRef.current) return;
    setBusy(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(cardRef.current, { backgroundColor: null, scale: 2 });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `armchair-pitwall-${p.driverId}-${p.eventName}.png`;
      a.click();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/70" onClick={p.onClose}>
      <div onClick={(e) => e.stopPropagation()}>
        {/* The card (captured to PNG) */}
        <div ref={cardRef} className="w-[600px] rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg,#12121c 0%,#1c1c2b 100%)' }}>
          <div className="px-6 pt-5 flex items-center justify-between">
            <span className="font-bold text-f1-red tracking-widest text-sm uppercase">Armchair Pitwall</span>
            <span className="text-f1-muted text-xs">{p.eventName} · {p.season}</span>
          </div>

          <div className="px-6 py-4 flex items-center gap-4">
            <div className="w-1.5 h-16 rounded" style={{ background: p.teamColor }} />
            <div className="flex-1">
              <div className="text-4xl font-extrabold text-white tracking-tight">{p.driverId}</div>
              <div className="text-2xl font-mono mt-1">
                <span className="text-f1-muted">真实 P{p.realPos}</span>
                <span className="text-f1-muted mx-2">→</span>
                <span className="text-white">我的策略 P{p.simPos}</span>
              </div>
            </div>
            <div className={`text-right ${won ? 'text-green-400' : p.delta < 0 ? 'text-red-400' : 'text-f1-muted'}`}>
              <div className="text-5xl font-extrabold">{won ? '▲' : p.delta < 0 ? '▼' : '='}{Math.abs(p.delta)}</div>
              <div className="text-xs font-bold mt-1">{won ? '赢了真实比赛!' : p.delta < 0 ? '更糟了' : '打平'}</div>
            </div>
          </div>

          {moves.length > 0 && (
            <div className="px-6 pb-2">
              <div className="text-[10px] text-f1-muted uppercase tracking-widest mb-1">关键操作</div>
              <div className="flex flex-wrap gap-1.5">
                {moves.map((m, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-f1-mid text-f1-text text-xs">{m}</span>
                ))}
              </div>
            </div>
          )}

          <div className="px-6 py-3 mt-1 flex items-center justify-between border-t border-f1-border/50">
            <span className="text-[10px] text-f1-border">seed {p.seed} · 同链接打开结果一致</span>
            <span className="text-[10px] text-f1-muted truncate max-w-[260px]">{p.shareUrl.replace(/^https?:\/\//, '')}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-3" onClick={(e) => e.stopPropagation()}>
        <button onClick={saveImage} disabled={busy}
          className="px-4 py-2 rounded-lg bg-f1-orange text-white font-bold text-sm hover:opacity-90 disabled:opacity-50">
          {busy ? '生成中…' : '保存图片 ↓'}
        </button>
        <button onClick={() => { navigator.clipboard?.writeText(p.shareUrl); }}
          className="px-4 py-2 rounded-lg border border-f1-border text-f1-text text-sm hover:border-f1-muted">
          复制链接
        </button>
        <button onClick={p.onClose}
          className="px-4 py-2 rounded-lg border border-f1-border text-f1-muted text-sm hover:text-f1-text">
          关闭
        </button>
      </div>
    </div>
  );
}
