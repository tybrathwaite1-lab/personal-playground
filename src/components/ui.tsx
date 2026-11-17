import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Bookmark, BookmarkCheck, Heart, X } from 'lucide-react';
import { useStore } from '../hooks/useStore';
import type { SavedKind } from '../types';

// ─── Section header ─────────────────────────────────────────────────
export function SectionHeader({
  number,
  title,
  jp,
  blurb,
  actions,
}: {
  number: string;
  title: string;
  jp?: string;
  blurb?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 animate-rise border-b border-line pb-5 md:mb-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="label">
          No.{number} <span className="mx-2 text-line">/</span> Personal Playground
        </span>
        {jp && (
          <span className="font-jp text-xs tracking-[0.3em] text-muted" lang="ja">
            {jp}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-5xl sm:text-6xl md:text-7xl">{title}</h1>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {blurb && <p className="mt-3 max-w-xl text-muted">{blurb}</p>}
    </header>
  );
}

// ─── Chips ──────────────────────────────────────────────────────────
export function ChipGroup<T extends string>({
  label,
  number,
  options,
  value,
  onChange,
}: {
  label: string;
  number?: string;
  options: { value: T; label: string; jp?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <fieldset className="min-w-0">
      <legend id={id} className="label mb-2 flex items-center gap-2">
        {number && <span className="text-rust">{number}</span>}
        {label}
      </legend>
      <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={id}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="chip"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
            {o.jp && (
              <span className="font-jp text-[10px] opacity-60" lang="ja" aria-hidden>
                {o.jp}
              </span>
            )}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

// ─── Save / favorite ────────────────────────────────────────────────
export function SaveButton({
  kind,
  refId,
  title,
  subtitle,
  url,
  compact,
}: {
  kind: SavedKind;
  refId: string;
  title: string;
  subtitle?: string;
  url?: string;
  compact?: boolean;
}) {
  const { isSaved, toggleSave } = useStore();
  const saved = isSaved(kind, refId);
  const Icon = saved ? BookmarkCheck : Bookmark;
  return (
    <button
      type="button"
      className={compact ? 'btn-ghost' : 'btn'}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${title} from collection` : `Save ${title} to collection`}
      onClick={() => toggleSave({ kind, refId, title, subtitle, url })}
    >
      <Icon size={compact ? 18 : 16} className={saved ? 'text-rust' : ''} aria-hidden />
      {!compact && (saved ? 'Saved' : 'Save')}
    </button>
  );
}

export function FavoriteButton({ id, name }: { id: string; name: string }) {
  const { isFavorite, toggleFavorite } = useStore();
  const fav = isFavorite(id);
  return (
    <button
      type="button"
      className="btn-ghost"
      aria-pressed={fav}
      aria-label={fav ? `Unfavorite ${name}` : `Favorite ${name}`}
      onClick={() => toggleFavorite(id)}
    >
      <Heart size={18} aria-hidden className={fav ? 'fill-rust text-rust' : ''} />
    </button>
  );
}

// ─── Modal / sheet ──────────────────────────────────────────────────
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    const first =
      ref.current?.querySelector<HTMLElement>('input, textarea, select') ??
      ref.current?.querySelector<HTMLElement>('button');
    first?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-6" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="pb-safe max-h-[92dvh] w-full max-w-lg animate-rise overflow-y-auto border border-line bg-ink2 sm:max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-ink2 px-5 py-3">
          <h2 id={titleId} className="display text-2xl">
            {title}
          </h2>
          <button type="button" className="btn-ghost" onClick={onClose} aria-label="Close">
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Form field ─────────────────────────────────────────────────────
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="mb-4 block">
      <span className="label mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="search"
      className="input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
    />
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="stripe border border-dashed border-line px-5 py-10 text-center text-muted">{children}</div>;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={label}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
