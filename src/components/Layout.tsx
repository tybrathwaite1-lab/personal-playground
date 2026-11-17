import { useEffect, useState, type ReactNode } from 'react';
import {
  Archive,
  Compass,
  Globe,
  House,
  Library,
  MapPin,
  Menu,
  NotebookPen,
  RotateCcw,
  Sparkles,
  WifiOff,
  X,
} from 'lucide-react';
import { href, type RouteName } from '../hooks/useRoute';
import { useStore } from '../hooks/useStore';

export const NAV: { route: RouteName; label: string; short: string; num: string; jp: string; icon: typeof House }[] = [
  { route: 'home', label: 'Home', short: 'Home', num: '00', jp: '表紙', icon: House },
  { route: 'discover', label: 'Discovery Engine', short: 'Discover', num: '01', jp: '発見', icon: Compass },
  { route: 'interests', label: 'My Interests', short: 'Interests', num: '02', jp: '興味', icon: Sparkles },
  { route: 'local', label: 'Local Playground', short: 'Local', num: '03', jp: '地元', icon: MapPin },
  { route: 'digital', label: 'Digital Playground', short: 'Digital', num: '04', jp: '電子', icon: Globe },
  { route: 'rediscover', label: 'Rediscover', short: 'Rediscover', num: '05', jp: '再発見', icon: RotateCcw },
  { route: 'collection', label: 'My Collection', short: 'Collection', num: '06', jp: '収集', icon: Library },
  { route: 'notes', label: 'Field Notes', short: 'Notes', num: '07', jp: '手帳', icon: NotebookPen },
];

const BOTTOM: RouteName[] = ['home', 'discover', 'local', 'collection'];

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function Layout({ current, children }: { current: RouteName; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { toast, storageOk } = useStore();
  const online = useOnline();

  useEffect(() => setMenuOpen(false), [current]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:bg-paper focus:px-3 focus:py-2 focus:text-ink">
        Skip to content
      </a>

      {/* ── Top bar ─────────────────────────────────────────── */}
      <header className="pt-safe sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
          <a href={href('home')} className="flex items-baseline gap-3" aria-label="Personal Playground — home">
            <span className="display text-xl tracking-normal">
              Personal Playground<span className="text-rust">.</span>
            </span>
            <span className="label hidden sm:inline">Vol. 01</span>
          </a>
          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center gap-0.5">
              {NAV.slice(1).map((n) => (
                <li key={n.route}>
                  <a
                    href={href(n.route)}
                    aria-current={current === n.route ? 'page' : undefined}
                    className="block px-2.5 py-2 font-mono text-[11px] uppercase tracking-wider text-muted transition-colors hover:text-paper aria-[current=page]:text-paper aria-[current=page]:underline aria-[current=page]:decoration-rust aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-8"
                  >
                    {n.short}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex items-center gap-1">
            {!online && (
              <span className="label flex items-center gap-1.5 text-rust" role="status">
                <WifiOff size={14} aria-hidden /> Offline
              </span>
            )}
            <a href={href('backup')} className="btn-ghost hidden lg:inline-flex" aria-label="Backup and settings">
              <Archive size={18} aria-hidden />
            </a>
            <button
              type="button"
              className="btn-ghost lg:hidden"
              aria-expanded={menuOpen}
              aria-controls="more-menu"
              aria-label="Open menu"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={22} aria-hidden />
            </button>
          </div>
        </div>
      </header>

      {!storageOk && (
        <div className="border-b border-rust bg-rust/15 px-4 py-2 text-center text-sm" role="alert">
          Your browser is blocking storage (private mode?). Saves won’t persist — export a backup before closing.
        </div>
      )}

      <main id="main" className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:px-6 md:pt-10 lg:pb-16">
        {children}
      </main>

      <footer className="mx-auto hidden max-w-6xl border-t border-line px-6 py-8 lg:block">
        <div className="flex items-center justify-between">
          <p className="label">Stay curious. Play more. Explore freely.</p>
          <p className="font-jp text-xs tracking-[0.3em] text-muted" lang="ja">
            遊び場 · 第一号
          </p>
        </div>
      </footer>

      {/* ── Mobile bottom nav ───────────────────────────────── */}
      <nav aria-label="Primary" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/95 backdrop-blur lg:hidden">
        <ul className="grid grid-cols-5">
          {NAV.filter((n) => BOTTOM.includes(n.route)).map((n) => {
            const Icon = n.icon;
            const active = current === n.route;
            return (
              <li key={n.route}>
                <a
                  href={href(n.route)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex h-16 flex-col items-center justify-center gap-1 ${active ? 'text-paper' : 'text-muted'}`}
                >
                  <Icon size={20} aria-hidden className={active ? 'text-rust' : ''} />
                  <span className="font-mono text-[10px] uppercase tracking-wider">{n.short}</span>
                </a>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-expanded={menuOpen}
              aria-controls="more-menu"
              className={`flex h-16 w-full flex-col items-center justify-center gap-1 ${
                !BOTTOM.includes(current) ? 'text-paper' : 'text-muted'
              }`}
            >
              <Menu size={20} aria-hidden className={!BOTTOM.includes(current) ? 'text-rust' : ''} />
              <span className="font-mono text-[10px] uppercase tracking-wider">More</span>
            </button>
          </li>
        </ul>
      </nav>

      {/* ── Full menu ───────────────────────────────────────── */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-ink lg:hidden" id="more-menu" role="dialog" aria-modal="true" aria-label="All sections">
          <div className="pt-safe flex h-14 items-center justify-between border-b border-line px-4">
            <span className="label">Contents · 目次</span>
            <button type="button" className="btn-ghost" onClick={() => setMenuOpen(false)} aria-label="Close menu" autoFocus>
              <X size={22} aria-hidden />
            </button>
          </div>
          <ul className="px-4 py-2">
            {[...NAV, { route: 'backup' as RouteName, label: 'Backup & Settings', short: 'Backup', num: '08', jp: '保管', icon: Archive }].map((n) => (
              <li key={n.route} className="border-b border-line">
                <a href={href(n.route)} className="flex items-baseline gap-4 py-3.5" aria-current={current === n.route ? 'page' : undefined}>
                  <span className="font-mono text-xs text-rust">{n.num}</span>
                  <span className={`display text-3xl ${current === n.route ? 'text-rust' : ''}`}>{n.label}</span>
                  <span className="ml-auto font-jp text-xs text-muted" lang="ja">
                    {n.jp}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Toast ───────────────────────────────────────────── */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-8">
        {toast && (
          <div className="animate-rise border border-line bg-paper px-4 py-2 font-mono text-xs uppercase tracking-wider text-ink">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
