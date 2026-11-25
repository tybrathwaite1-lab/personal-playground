/**
 * The unlisted preview file (public/data/preview/living.json), approved by the owner for PR 3
 * (collaboration/PR3_PREVIEW_PROPOSAL.md, option A). It lets the ten verified Edition 001 records
 * be evaluated at #/preview/living without publishing them.
 *
 * It is deliberately separate from the public file (publish.ts), which it does not change:
 *  - Which records: `ready` records, and `published` ones that are available on `today`. Never
 *    drafts, and never a record with an unresolved link review (replace or remove): apart from
 *    the status, the same bar as publishing. Statuses in content/discoveries are not touched.
 *  - Which fields: the same explicit allowlist as the public file, minus `status` and
 *    `publishDate`, so a preview record can't be mistaken for a published one.
 *  - Which relations: only those whose target is itself in this file. Drop items and thread
 *    nodes aren't carried here (no record relates to one today), so the file is self-contained.
 *
 * Only the preview route reads this file. Like everything deployed to GitHub Pages it is public
 * to anyone with the URL: unlisted, not access-controlled.
 */
import { availableRecords, createDiscoveryGraph } from './graph';
import { publicRecord, type PublicDiscoveryRecord } from './publish';
import type { DiscoveryRecord } from './types';

export type PreviewDiscoveryRecord = Omit<PublicDiscoveryRecord, 'status' | 'publishDate'>;
export interface PreviewDiscoveryFile {
  /** Marks the file for what it is, so nothing mistakes it for the public discoveries file. */
  preview: true;
  asOf: string;
  discoveries: PreviewDiscoveryRecord[];
}

const unresolved = (r: DiscoveryRecord) => (r.linkReviews ?? []).some((l) => l.decision === 'replace' || l.decision === 'remove');

/** The records the preview may show on `today`, sorted by id. */
export function previewEligible(records: readonly DiscoveryRecord[], today: string): DiscoveryRecord[] {
  const published = new Set(availableRecords(records, today));
  return records
    .filter((r) => (r.status === 'ready' || published.has(r)) && !unresolved(r))
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The preview file for `today`. `records` are validated standalone records (any status); the
 * input is never modified. Relations are resolved with the discovery graph over an in-memory
 * copy in which the eligible records count as available, and nothing else exists.
 */
export function previewDiscoveryFile(records: readonly DiscoveryRecord[], today: string): PreviewDiscoveryFile {
  const eligible = previewEligible(records, today);
  const asAvailable = eligible.map((r) => ({ ...r, status: 'published' as const, publishDate: today }));
  const graph = createDiscoveryGraph({ editions: [], nodes: [], discoveries: asAvailable }, { today });
  const discoveries = eligible
    .filter((r) => graph.has(r.id))
    .map((r) => Object.fromEntries(Object.entries(publicRecord(r, (id) => graph.has(id))).filter(([k]) => k !== 'status' && k !== 'publishDate')) as PreviewDiscoveryRecord);
  return { preview: true, asOf: today, discoveries };
}
