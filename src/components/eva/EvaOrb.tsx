import { cn } from '@/lib/utils';

export type EvaState = 'idle' | 'thinking' | 'speaking';

interface Props {
  state?: EvaState;
  size?: number;
  className?: string;
}

/**
 * Jarvis-achtige geanimeerde orb. Pure SVG + CSS.
 * - idle: zachte pulse, paarse gloed
 * - thinking: ringen draaien sneller, gele accenten
 * - speaking: golfpatroon, sterke glow
 */
export default function EvaOrb({ state = 'idle', size = 240, className }: Props) {
  const speakSpeed = state === 'speaking' ? '1.2s' : state === 'thinking' ? '2s' : '4s';
  const rotateSpeed = state === 'thinking' ? '6s' : state === 'speaking' ? '10s' : '20s';
  const counterSpeed = state === 'thinking' ? '8s' : state === 'speaking' ? '14s' : '28s';
  const glowOpacity = state === 'speaking' ? 0.85 : state === 'thinking' ? 0.6 : 0.4;

  return (
    <div
      className={cn('relative inline-block select-none', className)}
      style={{ width: size, height: size }}
      aria-label={`Eva is ${state}`}
    >
      {/* Outer glow halo */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, hsl(var(--primary) / ${glowOpacity}) 0%, transparent 65%)`,
          filter: 'blur(20px)',
          animation: `eva-pulse ${speakSpeed} ease-in-out infinite`,
        }}
      />

      <svg viewBox="0 0 200 200" className="relative w-full h-full">
        <defs>
          <radialGradient id="eva-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="1" />
            <stop offset="60%" stopColor="hsl(var(--primary))" stopOpacity="0.4" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="eva-ring" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.9" />
            <stop offset="50%" stopColor="hsl(var(--accent))" stopOpacity="0.7" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* Outer rotating dashed ring */}
        <g style={{ transformOrigin: '100px 100px', animation: `eva-rotate ${rotateSpeed} linear infinite` }}>
          <circle cx="100" cy="100" r="92" fill="none" stroke="url(#eva-ring)" strokeWidth="0.8"
            strokeDasharray="2 4" opacity="0.7" />
          <circle cx="100" cy="100" r="92" fill="none" stroke="hsl(var(--primary))" strokeWidth="1"
            strokeDasharray="40 320" opacity="0.9" />
        </g>

        {/* Counter-rotating ring */}
        <g style={{ transformOrigin: '100px 100px', animation: `eva-rotate-rev ${counterSpeed} linear infinite` }}>
          <circle cx="100" cy="100" r="78" fill="none" stroke="hsl(var(--primary) / 0.5)" strokeWidth="0.6"
            strokeDasharray="1 3" />
          <circle cx="100" cy="100" r="78" fill="none" stroke="hsl(var(--accent))" strokeWidth="1.2"
            strokeDasharray="20 200 8 200" opacity="0.8" />
        </g>

        {/* Mid ring with tick marks */}
        <g style={{ transformOrigin: '100px 100px', animation: `eva-rotate ${rotateSpeed} linear infinite reverse` }}>
          {Array.from({ length: 36 }).map((_, i) => {
            const angle = (i * 10 * Math.PI) / 180;
            const x1 = 100 + Math.cos(angle) * 64;
            const y1 = 100 + Math.sin(angle) * 64;
            const x2 = 100 + Math.cos(angle) * (i % 3 === 0 ? 70 : 67);
            const y2 = 100 + Math.sin(angle) * (i % 3 === 0 ? 70 : 67);
            return (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="hsl(var(--primary) / 0.6)" strokeWidth={i % 3 === 0 ? 1.2 : 0.6} />
            );
          })}
        </g>

        {/* Inner pulsing core */}
        <circle cx="100" cy="100" r="50" fill="url(#eva-core)"
          style={{ animation: `eva-core-pulse ${speakSpeed} ease-in-out infinite` }} />

        {/* Inner ring */}
        <circle cx="100" cy="100" r="40" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" opacity="0.8" />
        <circle cx="100" cy="100" r="32" fill="none" stroke="hsl(var(--primary) / 0.5)" strokeWidth="0.8"
          strokeDasharray="3 2" />

        {/* Equator line */}
        <line x1="40" y1="100" x2="160" y2="100" stroke="hsl(var(--primary))" strokeWidth="0.6" opacity="0.5"
          strokeDasharray="2 3" />

        {/* Speaking waveform (only when speaking) */}
        {state === 'speaking' && (
          <g>
            {Array.from({ length: 5 }).map((_, i) => (
              <rect key={i}
                x={86 + i * 7} y={92}
                width="3" height="16" rx="1.5"
                fill="hsl(var(--primary))"
                style={{ animation: `eva-wave 0.7s ease-in-out infinite`, animationDelay: `${i * 0.1}s`, transformOrigin: 'center' }}
              />
            ))}
          </g>
        )}

        {/* Center dot */}
        <circle cx="100" cy="100" r={state === 'speaking' ? 0 : 6} fill="hsl(var(--primary))"
          style={{ animation: `eva-core-pulse ${speakSpeed} ease-in-out infinite` }} />
      </svg>

      <style>{`
        @keyframes eva-rotate { to { transform: rotate(360deg); } }
        @keyframes eva-rotate-rev { to { transform: rotate(-360deg); } }
        @keyframes eva-pulse { 0%, 100% { opacity: 0.6; transform: scale(1); } 50% { opacity: 1; transform: scale(1.05); } }
        @keyframes eva-core-pulse { 0%, 100% { opacity: 0.85; } 50% { opacity: 1; } }
        @keyframes eva-wave { 0%, 100% { transform: scaleY(0.3); } 50% { transform: scaleY(1); } }
      `}</style>
    </div>
  );
}
