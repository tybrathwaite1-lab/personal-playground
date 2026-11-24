import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import {
  APPEARANCE_KEY,
  DEFAULT_APPEARANCE,
  initialAppearanceState,
  isDirty,
  loadAppearance,
  parseAppearance,
  reduceAppearance,
  resolve,
  saveAppearance,
  shownAppearance,
  type Appearance,
  type Resolved,
} from '../appearance/appearance';
import type { LookId } from '../appearance/looks';

interface AppearanceContext {
  /** The saved appearance (what this device remembers). */
  saved: Appearance;
  /** On screen now: the preview if there is one, else the saved appearance. */
  shown: Appearance;
  /** `shown`, resolved to the atmosphere, colour and type applied; null = the default Playground. */
  resolved: Resolved;
  previewing: boolean;
  dirty: boolean;
  /** False after a save that couldn't be stored (blocked storage); the choice lasts this session. */
  persisted: boolean;
  previewLook: (look: LookId | null) => void;
  previewCustom: (look: LookId, change: { palette?: string; typeface?: string }) => void;
  commit: () => void;
  cancel: () => void;
}

const Ctx = createContext<AppearanceContext | null>(null);

/**
 * Holds the visitor's appearance (Creative Slice 03, Phase 3.2). Device-local and separate
 * from personal data and Sync. With nothing chosen it does nothing at all: the default
 * Playground, unchanged. When an atmosphere is shown it is mirrored onto <html> as
 * data-look / data-look-palette / data-look-type, which the shell atmospheres use (Phase 3.3:
 * src/styles/atmospheres/tokens.css and shell.css). No controls can set them yet.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduceAppearance, undefined, () => initialAppearanceState(loadAppearance()));
  const [persisted, setPersisted] = useState(true);
  const shown = shownAppearance(state);
  const resolved = resolve(shown);

  // Each commit stores the new saved appearance (and only a commit: never on load or on a
  // change from another tab, so a stored value is never rewritten just by reading it).
  const { commits, saved } = state;
  const stored = useRef(0);
  useEffect(() => {
    if (commits === stored.current) return;
    stored.current = commits;
    setPersisted(saveAppearance(saved));
  }, [commits, saved]);

  // Another tab saved (or cleared) an appearance.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== APPEARANCE_KEY && e.key !== null) return;
      let next = DEFAULT_APPEARANCE;
      try {
        next = e.newValue === null ? DEFAULT_APPEARANCE : parseAppearance(JSON.parse(e.newValue));
      } catch {
        /* malformed: treat as the default */
      }
      dispatch({ type: 'external', saved: next });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Mirror what's shown onto <html>; the default Playground leaves no attributes at all. The
  // saved appearance is already there before the first paint (the inline script in index.html);
  // this keeps it in step with previews and changes from here on.
  const look = resolved?.look;
  const palette = resolved?.palette;
  const type = resolved?.type;
  useEffect(() => {
    const el = document.documentElement;
    if (look && palette && type) {
      el.dataset.look = look;
      el.dataset.lookPalette = palette;
      el.dataset.lookType = type;
    } else {
      delete el.dataset.look;
      delete el.dataset.lookPalette;
      delete el.dataset.lookType;
    }
    syncBrowserColours();
  }, [look, palette, type]);

  const previewLook = useCallback((l: LookId | null) => dispatch({ type: 'preview-look', look: l }), []);
  const previewCustom = useCallback((l: LookId, c: { palette?: string; typeface?: string }) => dispatch({ type: 'preview-custom', look: l, ...c }), []);
  const commit = useCallback(() => dispatch({ type: 'commit' }), []);
  const cancel = useCallback(() => dispatch({ type: 'cancel' }), []);

  const value = useMemo<AppearanceContext>(
    () => ({ saved: state.saved, shown, resolved, previewing: state.draft !== null, dirty: isDirty(state), persisted, previewLook, previewCustom, commit, cancel }),
    [state, shown, resolved, persisted, previewLook, previewCustom, commit, cancel],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * The browser's own chrome (address bar, status bar, scrollbars, form controls) follows the
 * page: theme-color is the page colour now on screen (--pp-ink, which each colour set re-points)
 * and color-scheme says whether that page is light or dark. Read from the applied styles, so
 * there is one source of truth; nothing is written while they already match, so the default
 * Playground keeps index.html's static #141614 and "dark" untouched.
 */
export function syncBrowserColours() {
  const cs = getComputedStyle(document.documentElement);
  const ink = /^(\d+) (\d+) (\d+)$/.exec(cs.getPropertyValue('--pp-ink').trim());
  if (!ink) return; // styles not applied (tests without CSS): leave the metas alone
  const hex = `#${ink
    .slice(1)
    .map((c) => Number(c).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
  const scheme = cs.getPropertyValue('color-scheme').trim() === 'light' ? 'light' : 'dark';
  const set = (name: string, value: string) => {
    const m = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
    if (m && m.content !== value) m.content = value;
  };
  set('theme-color', hex);
  set('color-scheme', scheme);
}

export function useAppearance(): AppearanceContext {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppearance must be used inside <AppearanceProvider>');
  return v;
}
