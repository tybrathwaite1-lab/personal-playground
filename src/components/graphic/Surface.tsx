import type { ComponentPropsWithoutRef, CSSProperties, ElementType, ReactNode } from 'react';

/** Every surface defined in src/styles/tokens.css (tested pairs). */
export const SURFACES = ['ink', 'raised', 'hunter', 'editorial', 'cream', 'orange', 'mustard', 'pink', 'cobalt', 'olive', 'forest'] as const;
export type SurfaceTone = (typeof SURFACES)[number];
/** Field Guide (existing app) vs. Newsstand (approved Sprint 02 palette). */
export const FIELD_GUIDE: SurfaceTone[] = ['ink', 'raised', 'hunter'];
export const NEWSSTAND: SurfaceTone[] = ['editorial', 'cream', 'orange', 'mustard', 'pink', 'cobalt', 'olive', 'forest'];

type SurfaceProps<T extends ElementType> = {
  tone: SurfaceTone;
  as?: T;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>;

/**
 * A surface paints its background and text, and re-resolves every semantic token (text-fg,
 * text-accent, border-control, the focus ring, …) for its children. Surfaces nest freely.
 */
export function Surface<T extends ElementType = 'div'>({ tone, as, className = '', children, ...rest }: SurfaceProps<T>) {
  const Tag = (as ?? 'div') as ElementType;
  return (
    <Tag data-surface={tone} className={`surface-${tone} relative isolate ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * A decorative layer: hidden from assistive technology, never interactive, never selectable.
 * Every graphic primitive renders through this, so decoration stays separate from essential
 * text and controls.
 */
export function Decor({ className = '', style, children }: { className?: string; style?: CSSProperties; children?: ReactNode }) {
  return (
    <span aria-hidden="true" data-decor="" className={`pointer-events-none select-none ${className}`} style={style}>
      {children}
    </span>
  );
}

/** Clamp a decorative rotation so compositions stay legible. */
export const tilt = (deg: number, max = 8) => Math.max(-max, Math.min(max, deg));
