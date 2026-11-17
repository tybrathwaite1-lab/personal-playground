/**
 * The Local Pulse — data produced by scripts/pulse/ingest.ts during the daily
 * build and served as /data/pulse.json. Nothing here is hand-written sample data.
 */

export interface PulseSource {
  id: string;
  name: string;
  /** Human-facing page for the calendar. */
  homepage: string;
  /** Machine feed actually read. */
  feed: string;
  ok: boolean;
  /** ISO time of the last successful read (may be older than generatedAt if today's read failed). */
  lastSuccess: string | null;
  count: number;
  error?: string;
  /** True when today's read failed and we're showing events carried over from the last good read. */
  stale?: boolean;
}

export interface PulseEvent {
  /** Stable across refreshes: source + feed UID (or title+date). */
  id: string;
  title: string;
  description?: string;
  /** ISO with offset. For all-day events, midnight America/New_York. */
  start: string;
  end?: string;
  allDay: boolean;
  /** Spans more than two days, e.g. an exhibition. */
  ongoing: boolean;
  venue?: string;
  address?: string;
  city?: string;
  /** Approximate miles from St. Petersburg city center (city-level). */
  miles?: number;
  url?: string;
  /** Only when the listing itself states a price. Otherwise undefined = unknown. */
  priceNote?: string;
  free?: boolean;
  tags: string[];
  categories: string[];
  indoor?: boolean;
  cancelled: boolean;
  sourceIds: string[];
  /** When this listing was last confirmed in a source feed. */
  verifiedAt: string;
}

export interface PulseFile {
  generatedAt: string;
  timezone: 'America/New_York';
  sources: PulseSource[];
  events: PulseEvent[];
}
