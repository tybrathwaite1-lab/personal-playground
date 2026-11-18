import type { CSSProperties, ReactNode } from 'react';
import { Decor, tilt } from './Surface';

/** Deterministic pseudo-random sequence (same seed → same edge, so screenshots are stable). */
function random(seed: number) {
  let s = Math.max(1, Math.floor(seed)) % 2147483647;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** A torn or deckled paper edge path in a 1200 × `h` box, filled below the edge line. */
export function edgePath(seed: number, h = 14, style: 'torn' | 'deckle' = 'torn', w = 1200) {
  const rnd = random(seed);
  const pts: string[] = [];
  for (let x = 0; x < w; x += style === 'torn' ? 8 + rnd() * 18 : 4 + rnd() * 5) {
    const y = style === 'torn' ? h * (0.15 + rnd() * 0.75) : h * (0.45 + rnd() * 0.35);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  pts.push(`${w},${(h * 0.5).toFixed(1)}`);
  return `M0,${h} L${pts.join(' L')} L${w},${h} Z`;
}

/**
 * Paper edge: the top or bottom of the enclosing surface, torn or deckled. It is painted in the
 * surface's own color and overlaps the neighboring surface by `depth` pixels.
 */
export function PaperEdge({ side = 'top', seed = 7, depth = 14, style = 'torn' }: { side?: 'top' | 'bottom'; seed?: number; depth?: number; style?: 'torn' | 'deckle' }) {
  return (
    <Decor
      className="absolute inset-x-0 block"
      style={{ [side]: -depth + 1, height: depth, transform: side === 'bottom' ? 'scaleY(-1)' : undefined } as CSSProperties}
    >
      <svg viewBox={`0 0 1200 ${depth}`} preserveAspectRatio="none" className="block h-full w-full" style={{ fill: 'rgb(var(--surface))' }}>
        <path d={edgePath(seed, depth, style)} />
      </svg>
    </Decor>
  );
}

/** Masking tape. Purely decorative; position it with `className` (absolute utilities). */
export function Tape({ tone = 'cream', angle = -4, width = 104, className = '' }: { tone?: 'cream' | 'mustard' | 'pink' | 'paper'; angle?: number; width?: number; className?: string }) {
  const color = tone === 'paper' ? 'var(--pp-ns-paper)' : `var(--pp-ns-${tone})`;
  return (
    <Decor
      className={`absolute z-20 block h-7 shadow-[0_2px_6px_-3px_rgb(var(--pp-ink)/0.6)] ${className}`}
      style={{
        width,
        transform: `rotate(${tilt(angle)}deg)`,
        backgroundColor: `rgb(${color} / 0.82)`,
        clipPath: 'polygon(2% 0, 98% 6%, 100% 50%, 97% 100%, 3% 94%, 0 50%)',
      }}
    />
  );
}

/** Restrained film grain over a surface. Decorative; sits under content (z-0). */
export function Grain({ intensity = 'subtle' }: { intensity?: 'subtle' | 'medium' }) {
  return <Decor className="pp-grain absolute inset-0 z-0 block" style={{ opacity: intensity === 'subtle' ? 0.22 : 0.38 }} />;
}

/**
 * Stamp: short text in the surface accent, slightly rotated, landing with a small press
 * (static under reduced motion). The text is real text (≥ 4.5:1) unless `decorative`, in which
 * case the same information must appear elsewhere.
 */
export function Stamp({ children, shape = 'rect', angle = -6, decorative = false, className = '' }: { children: ReactNode; shape?: 'rect' | 'circle'; angle?: number; decorative?: boolean; className?: string }) {
  const a = tilt(angle, 12);
  const body = (
    <span
      className={`inline-flex animate-stamp-in items-center justify-center border-2 border-double border-accent font-mono text-label font-medium uppercase leading-tight text-accent ${
        shape === 'circle' ? 'h-20 w-20 rounded-full p-2 text-center' : 'px-2.5 py-1'
      }`}
      style={{ transform: `rotate(${a}deg)`, ['--stamp-angle' as string]: `${a}deg` } as CSSProperties}
    >
      {children}
    </span>
  );
  return decorative ? <Decor className={`inline-block ${className}`}>{body}</Decor> : <span className={`inline-block ${className}`}>{body}</span>;
}
