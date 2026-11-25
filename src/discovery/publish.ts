/**
 * What the public discoveries file contains (public/data/discoveries.json): the records that are
 * public on `today` (published, on or after their publishDate), sorted by id, without the
 * editor-only fields. Pure, so the build and its tests agree.
 */
import { availableRecords } from './graph';
import type { DiscoveryRecord } from './types';

export type PublicDiscoveryRecord = Omit<DiscoveryRecord, 'editorialNotes' | 'linkReviews'>;
export interface PublicDiscoveryFile {
  asOf: string;
  discoveries: PublicDiscoveryRecord[];
}

export function publicDiscoveryFile(records: readonly DiscoveryRecord[], today: string): PublicDiscoveryFile {
  return {
    asOf: today,
    discoveries: availableRecords(records, today).map((r) => {
      const out: Record<string, unknown> = { ...r };
      delete out.editorialNotes;
      delete out.linkReviews;
      return out as unknown as PublicDiscoveryRecord;
    }),
  };
}
