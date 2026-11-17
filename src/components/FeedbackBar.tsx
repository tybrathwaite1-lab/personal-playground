import { useStore, type FeedbackFlag } from '../hooks/useStore';

const SETS: Record<'place' | 'editorial', { flag: FeedbackFlag; label: string }[]> = {
  place: [
    { flag: 'want', label: 'Want to go' },
    { flag: 'been', label: 'Been here' },
    { flag: 'enjoyed', label: 'Enjoyed' },
    { flag: 'notInterested', label: 'Not for me' },
  ],
  editorial: [
    { flag: 'more', label: 'More like this' },
    { flag: 'familiar', label: 'Already know it' },
    { flag: 'notInterested', label: 'Not my thing' },
  ],
};

/**
 * Optional private reactions. They quietly shape recommendations and sync between
 * your devices; there are no counts, scores or streaks anywhere.
 */
export function FeedbackBar({ itemKey, kind = 'place', label }: { itemKey: string; kind?: 'place' | 'editorial'; label: string }) {
  const { feedbackFor, toggleFeedback } = useStore();
  const fb = feedbackFor(itemKey);
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={`Your reaction to ${label}`}>
      {SETS[kind].map(({ flag, label: l }) => (
        <button
          key={flag}
          type="button"
          aria-pressed={Boolean(fb?.[flag])}
          onClick={() => toggleFeedback(itemKey, flag)}
          className="min-h-[32px] border border-line px-2 font-mono text-[10px] uppercase tracking-wider text-muted transition-colors hover:text-paper aria-pressed:border-rust aria-pressed:text-paper"
        >
          {l}
        </button>
      ))}
    </div>
  );
}
