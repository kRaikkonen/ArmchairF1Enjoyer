/**
 * Track map — renders the REAL circuit outline from FastF1 telemetry
 * (model.trackOutline, extracted by pipeline/scripts/extract_track_outline.py).
 *
 * Note: cars are NOT drawn on the track. The engine ranks by cumulative time,
 * not physical track position (known limitation, see README debt #4), so any
 * on-track dot would be false precision (PLAN §8.6). We show only the circuit
 * shape and the start/finish line.
 */
import type { TrackOutline } from '../../engine/types';

interface TrackSvgProps {
  trackName: string;
  outline: TrackOutline | null | undefined;
  lengthKm?: number | null;
  totalLaps?: number;
}

export function TrackSvg({ trackName, outline, lengthKm, totalLaps }: TrackSvgProps) {
  return (
    <div className="flex flex-col items-center w-full">
      <div className="flex items-center justify-between w-full mb-2">
        <span className="text-[10px] text-f1-muted uppercase tracking-widest">{trackName}</span>
        <span className="text-[9px] text-f1-border">真实赛道轮廓</span>
      </div>

      {outline ? (
        <svg viewBox={outline.viewBox} className="w-full" style={{ maxHeight: 200 }}>
          {/* track bed */}
          <path d={outline.path} fill="none" stroke="#2a2a3e" strokeWidth={34}
            strokeLinecap="round" strokeLinejoin="round" />
          {/* track surface */}
          <path d={outline.path} fill="none" stroke="#454560" strokeWidth={22}
            strokeLinecap="round" strokeLinejoin="round" />
          {/* center hairline */}
          <path d={outline.path} fill="none" stroke="#5e5e80" strokeWidth={1.5}
            strokeDasharray="6 10" strokeLinecap="round" />
          {/* start/finish */}
          <circle cx={outline.startFinish.x} cy={outline.startFinish.y} r={13}
            fill="none" stroke="#e8002d" strokeWidth={4} />
          <circle cx={outline.startFinish.x} cy={outline.startFinish.y} r={4} fill="#e8002d" />
        </svg>
      ) : (
        <div className="text-[10px] text-f1-muted py-8">无赛道轮廓数据</div>
      )}

      <div className="text-[10px] text-f1-muted mt-1 text-center font-mono">
        {lengthKm ? `${lengthKm.toFixed(3)} km` : ''}{lengthKm && totalLaps ? ' · ' : ''}{totalLaps ? `${totalLaps} 圈` : ''}
      </div>
    </div>
  );
}
