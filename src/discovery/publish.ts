/**
 * The public discoveries file (public/data/discoveries.json): a content publication boundary.
 *
 *  - Which records: those available on `today` by the discovery graph's own rule (published,
 *    on or after their publishDate, no id collision). There is no second definition.
 *  - Which fields: an explicit allowlist, applied to every nested object and array (credits,
 *    destination, sources, relations). Editor-only fields (editorialNotes, linkReviews) and any
 *    unknown field are left out by construction, whatever the input holds.
 *  - Which relations: only those whose target is available on `today` (a published standalone
 *    discovery, a Drop item in a published edition, or a thread node), using the same graph.
 *    The source records keep every authored claim, so a relation appears once its target is
 *    published.
 *
 * Pure and deterministic: records sorted by id, relations in authored order, input never modified.
 * This decides what the app's public data contains. It is not access control: unpublished
 * records committed to a public repository are still public there.
 */
import { createDiscoveryGraph, availableRecords } from './graph';
import type { DiscoveryContent, DiscoveryRecord } from './types';
import type { DropRelation, DropSource } from '../types/drop';

export interface PublicDiscoveryRecord {
  schemaVersion: 1;
  id: string;
  status: 'published';
  publishDate: string;
  title: string;
  subject: string;
  context: string;
  nature: 'work' | 'subject';
  credits: { name: string; role: string }[];
  year?: string;
  tags: string[];
  destination: { url: string; label: string; verifiedAt: string; availability?: 'intermittent' | 'javascript-required' };
  sources: DropSource[];
  related?: DropRelation[];
  image?: string;
}
export interface PublicDiscoveryFile {
  asOf: string;
  discoveries: PublicDiscoveryRecord[];
}

const source = (s: DropSource): DropSource => ({ label: s.label, url: s.url, kind: s.kind, verifiedAt: s.verifiedAt });
const relation = (x: DropRelation): DropRelation => ({ to: x.to, relation: x.relation, note: x.note, basis: x.basis });

/** One record, projected field by field. `keep` decides which relation targets are available. */
export function publicRecord(r: DiscoveryRecord, keep: (targetId: string) => boolean): PublicDiscoveryRecord {
  const related = (r.related ?? []).filter((x) => x.to !== r.id && keep(x.to)).map(relation);
  const d = r.destination;
  return {
    schemaVersion: 1,
    id: r.id,
    status: 'published',
    publishDate: r.publishDate as string,
    title: r.title,
    subject: r.subject,
    context: r.context,
    nature: r.nature,
    credits: r.credits.map((c) => ({ name: c.name, role: c.role })),
    ...(r.year !== undefined && { year: r.year }),
    tags: [...r.tags],
    destination: { url: d.url, label: d.label, verifiedAt: d.verifiedAt, ...(d.availability !== undefined && { availability: d.availability }) },
    sources: r.sources.map(source),
    ...(related.length > 0 && { related }),
    ...(r.image !== undefined && { image: r.image }),
  };
}

/**
 * The public file for `today`. `content` is everything the graph knows (Drop editions, thread
 * nodes and the validated standalone records), so relation targets are judged with the same rule.
 */
export function publicDiscoveryFile(content: DiscoveryContent, today: string): PublicDiscoveryFile {
  const graph = createDiscoveryGraph(content, { today });
  const records = availableRecords(content.discoveries ?? [], today).filter((r) => graph.get(r.id)?.record === r);
  return { asOf: today, discoveries: records.map((r) => publicRecord(r, (id) => graph.has(id))) };
}
