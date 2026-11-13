import { memo } from 'react';
import type { Design, PointerPosition, PublicSegment } from '../types';

export type WheelLook = Pick<
  Design,
  'borderColor' | 'dotColor' | 'pointerColor' | 'centerColor' | 'centerImageUrl' | 'labelScale'
>;

interface WheelProps {
  segments: PublicSegment[];
  /** Total clockwise rotation in degrees. Changing it animates the spin. */
  rotation: number;
  durationSec: number;
  spinning?: boolean;
  onSpinEnd?: () => void;
  look: WheelLook;
  pointer: PointerPosition;
}

const R = 180; // wheel radius in SVG units (viewBox is 400x400 centred on 0,0)
const RIM = 196;

function polar(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [r * Math.cos(rad), r * Math.sin(rad)];
}

function slicePath(startDeg: number, endDeg: number): string {
  const [x1, y1] = polar(R, startDeg);
  const [x2, y2] = polar(R, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M0,0 L${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} Z`;
}

/** Split long labels onto two lines at the space closest to the middle. */
function splitLabel(label: string): string[] {
  if (label.length <= 10 || !label.includes(' ')) return [label];
  const mid = label.length / 2;
  let best = -1;
  for (let i = 0; i < label.length; i++) {
    if (label[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  return [label.slice(0, best), label.slice(best + 1)];
}

const WheelFace = memo(function WheelFace({ segments, look }: { segments: PublicSegment[]; look: WheelLook }) {
  const n = segments.length;
  const slice = 360 / n;
  const lights = Math.max(12, n * 2);
  const scale = Math.max(0.5, Math.min(1.6, (look.labelScale || 100) / 100));

  return (
    <svg viewBox="-200 -200 400 400" className="lw-wheel-svg" aria-hidden="true">
      <defs>
        <radialGradient id="lw-shine" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="scale(180)">
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.18" />
        </radialGradient>
        <clipPath id="lw-center-clip">
          <circle r="27" />
        </clipPath>
      </defs>

      <circle r={RIM} fill={look.borderColor} />
      <circle r={RIM - 3} fill="none" stroke={look.pointerColor} strokeWidth="3" />

      {segments.map((seg, i) => {
        // Slice i spans clockwise from the top: SVG 0deg is 3 o'clock, so shift by -90.
        const start = -90 + i * slice;
        const mid = start + slice / 2;
        const lines = splitLabel(seg.label);
        const longest = Math.max(...lines.map((l) => l.length));
        const arcRoom = 2 * Math.PI * (R * 0.62) * (slice / 360);
        const auto = Math.min(20, 230 / Math.max(longest, 5), arcRoom / (lines.length * 1.35));
        const fontSize = Math.max(8, auto * scale);
        return (
          <g key={seg.id}>
            <path d={slicePath(start, start + slice)} fill={seg.color} stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" />
            <g transform={`rotate(${mid})`}>
              <text
                x={R * 0.6}
                y={0}
                fill={seg.textColor}
                fontSize={fontSize}
                fontWeight={800}
                textAnchor="middle"
                dominantBaseline="central"
                style={{ letterSpacing: '0.02em' }}
              >
                {lines.map((line, li) => (
                  <tspan key={li} x={R * 0.6} dy={li === 0 ? `${-(lines.length - 1) * 0.55}em` : '1.1em'}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          </g>
        );
      })}

      <circle r={R} fill="url(#lw-shine)" pointerEvents="none" />

      {Array.from({ length: lights }, (_, i) => {
        const [x, y] = polar(R + 8, (360 / lights) * i);
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r="4"
            fill={look.dotColor}
            className={`lw-light ${i % 2 ? 'lw-light-b' : 'lw-light-a'}`}
          />
        );
      })}

      <circle r="30" fill={look.centerColor} stroke={look.pointerColor} strokeWidth="5" />
      {look.centerImageUrl ? (
        <image
          href={look.centerImageUrl}
          x="-27"
          y="-27"
          width="54"
          height="54"
          clipPath="url(#lw-center-clip)"
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        <circle r="12" fill={look.borderColor} />
      )}
    </svg>
  );
});

export function Wheel({ segments, rotation, durationSec, spinning, onSpinEnd, look, pointer }: WheelProps) {
  return (
    <div className={`lw-wheel ${spinning ? 'is-spinning' : ''}`}>
      {/* Clip keeps the rotated square's corners from creating scroll overflow. */}
      <div className="lw-wheel-clip">
        <div
          className="lw-wheel-rotor"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? `transform ${durationSec}s cubic-bezier(0.12, 0.6, 0.08, 1)` : 'none',
          }}
          onTransitionEnd={(e) => {
            if (e.propertyName === 'transform') onSpinEnd?.();
          }}
        >
          <WheelFace segments={segments} look={look} />
        </div>
      </div>
      <div className={`lw-pointer lw-pointer--${pointer}`} aria-hidden="true">
        {pointer === 'center' ? (
          <svg viewBox="0 0 40 80">
            <path d="M20 2 L32 56 A13 13 0 1 1 8 56 Z" fill={look.pointerColor} stroke={look.borderColor} strokeWidth="3" />
            <circle cx="20" cy="62" r="5" fill={look.borderColor} />
          </svg>
        ) : (
          <svg viewBox="0 0 40 50">
            <path d="M20 48 L4 12 A16 16 0 1 1 36 12 Z" fill={look.pointerColor} stroke={look.borderColor} strokeWidth="3" />
            <circle cx="20" cy="16" r="6" fill={look.borderColor} />
          </svg>
        )}
      </div>
    </div>
  );
}
