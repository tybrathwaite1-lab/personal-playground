// The single handwritten face (Caveat Bold, OFL-1.1), self-hosted and Latin-only. Imported
// here so it loads only with the components that use it, never with the app shell.
import '@fontsource/caveat/latin-700.css';
import type { ReactNode } from 'react';
import { Decor, tilt } from './Surface';

const ARROWS = {
  left: 'M44 14 C30 6, 16 8, 4 16 M4 16 L13 10 M4 16 L12 22',
  right: 'M4 14 C18 6, 32 8, 44 16 M44 16 L35 10 M44 16 L36 22',
  down: 'M24 2 C14 14, 16 26, 24 40 M24 40 L17 33 M24 40 L30 32',
} as const;

/**
 * Handwritten margin note: decoration only, so it is aria-hidden and never carries essential
 * information, labels or controls. Still drawn in the surface accent (≥ 4.5:1).
 */
export function Annotation({ children, arrow, angle = -3, className = '' }: { children: ReactNode; arrow?: keyof typeof ARROWS; angle?: number; className?: string }) {
  const path = arrow ? ARROWS[arrow] : null;
  return (
    <Decor className={`inline-flex items-center gap-1 text-accent ${arrow === 'down' ? 'flex-col' : ''} ${className}`} style={{ transform: `rotate(${tilt(angle)}deg)` }}>
      {arrow === 'left' && path && <ArrowSvg d={path} />}
      <span className="font-hand text-[1.625rem] font-bold leading-none">{children}</span>
      {(arrow === 'right' || arrow === 'down') && path && <ArrowSvg d={path} tall={arrow === 'down'} />}
    </Decor>
  );
}

function ArrowSvg({ d, tall = false }: { d: string; tall?: boolean }) {
  return (
    <svg viewBox={tall ? '0 0 48 44' : '0 0 48 28'} className={tall ? 'h-10 w-11' : 'h-6 w-12'} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
