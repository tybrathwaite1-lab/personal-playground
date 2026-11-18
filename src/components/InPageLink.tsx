import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';

/**
 * Move to an element on the current page without touching the URL. With a hash router, a bare
 * `#id` link would replace the route (`#/styleguide` → `#id`), so in-page links scroll to the
 * target and move keyboard focus to it, leaving the route alone.
 * Returns false when the target doesn't exist.
 */
export function focusTarget(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  if (!el.hasAttribute('tabindex') && !el.matches('a[href], button, input, select, textarea')) el.setAttribute('tabindex', '-1');
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  el.focus({ preventScroll: true });
  return true;
}

/** An in-page link (skip links, "jump to" links) that works inside the hash router. */
export function InPageLink({ to, children, onClick, ...rest }: { to: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    // Let modified clicks (new tab, etc.) and already-handled events through.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (focusTarget(to)) e.preventDefault();
  };
  return (
    <a href={`#${to}`} data-in-page-link={to} onClick={handle} {...rest}>
      {children}
    </a>
  );
}
