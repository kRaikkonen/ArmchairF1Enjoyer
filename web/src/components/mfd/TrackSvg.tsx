/**
 * Track SVG — simplified circuit layout used as a visual landmark.
 * Not geographically accurate; intended as an ambient orientation aid.
 *
 * The Silverstone path below is a hand-approximated outline of the circuit.
 * It is a UI constant and bears no relationship to physics parameters.
 */

interface TrackSvgProps {
  trackName: string;
  driverPositions?: { id: string; frac: number; isPlayer: boolean }[]; // 0..1 along the path
}

// Simplified Silverstone layout (hand-traced, normalised to 0-200 × 0-200)
const SILVERSTONE_PATH = `
  M 148,30
  C 168,30 178,42 178,55
  L 175,80
  C 172,95 162,102 150,112
  C 135,124 122,128 112,120
  C 100,110  94,96  88,84
  C 82,72   72,65  58,68
  C 42,72   30,83  26,100
  C 22,118  28,138  40,155
  C 52,172  72,180  96,182
  C 118,184  148,180  164,172
  C 178,164  183,152  180,138
  C 177,124  168,118  168,108
  C 168,95  175,80  175,80
`;

export function TrackSvg({ trackName, driverPositions = [] }: TrackSvgProps) {
  return (
    <div className="w-[200px] shrink-0 flex flex-col items-center justify-center p-3">
      <div className="text-[9px] text-f1-muted uppercase tracking-widest mb-2">
        {trackName}
      </div>
      <svg viewBox="10 20 180 170" className="w-full" style={{ maxHeight: '160px' }}>
        {/* Track outline (thick) */}
        <path
          d={SILVERSTONE_PATH}
          fill="none"
          stroke="#2a2a3e"
          strokeWidth="14"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Track surface */}
        <path
          d={SILVERSTONE_PATH}
          fill="none"
          stroke="#3a3a52"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Start/finish line */}
        <line x1="146" y1="26" x2="150" y2="46" stroke="#e8002d" strokeWidth="2" />

        {/* Driver dots (placeholder positions along a simplified arc) */}
        {driverPositions.slice(0, 6).map((dp) => {
          // Map frac 0..1 around a rough ellipse for placeholder positions
          const angle = dp.frac * 2 * Math.PI - Math.PI / 2;
          const cx = 100 + 68 * Math.cos(angle);
          const cy = 105 + 65 * Math.sin(angle);
          return (
            <circle
              key={dp.id}
              cx={cx.toFixed(1)}
              cy={cy.toFixed(1)}
              r={dp.isPlayer ? 4.5 : 3}
              fill={dp.isPlayer ? '#f97316' : '#8888aa'}
              opacity={0.85}
            />
          );
        })}
      </svg>
      {/* Circuit stats */}
      <div className="text-[9px] text-f1-muted mt-1 text-center">
        5.891 km · 52圈
      </div>
    </div>
  );
}
