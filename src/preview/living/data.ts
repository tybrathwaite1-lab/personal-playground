/**
 * Data for the discovery experience preview (#/preview/living, PR 3): reads the unlisted
 * preview file (public/data/preview/living.json, built by scripts/discoveries/build.ts) and
 * nothing else. The page never reads discoveries.json, the Weekly Drop, saved items or Sync.
 *
 * The file is checked again here, defensively: a record without its required text is dropped,
 * and a link that isn't a safe https URL never becomes clickable. Relations are resolved with
 * the discovery graph (src/discovery), so traversal works both ways while every claim keeps its
 * authored direction, wording and basis.
 */
import { createDiscoveryGraph, type DiscoveryGraph, type DiscoveryRecord, type PreviewDiscoveryRecord, type RelationClaim } from '../../discovery';
import type { DropRelation, DropSource } from '../../types/drop';
import { isSafeUrl } from '../../utils/helpers';

/** The preview file, relative to the app's base URL. */
export const PREVIEW_FILE = 'data/preview/living.json';
/** Discovery ids are kebab-case (validate.ts); anything else is not an id. */
export const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type PreviewRecord = PreviewDiscoveryRecord;
export interface Preview {
  asOf: string;
  /** In file order (sorted by id at build). */
  list: readonly PreviewRecord[];
  get: (id: string) => PreviewRecord | undefined;
  graph: DiscoveryGraph;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const https = (v: unknown): v is string => text(v) && v.startsWith('https://') && isSafeUrl(v);
const YMD = /^\d{4}-\d{2}-\d{2}$/;

function parseRecord(r: unknown): PreviewRecord | null {
  if (!isObj(r) || !text(r.id) || !ID_PATTERN.test(r.id) || !text(r.title) || !text(r.subject) || !text(r.context)) return null;
  const d = r.destination;
  if (!isObj(d) || !https(d.url) || !text(d.label)) return null;
  const credits = (Array.isArray(r.credits) ? r.credits : []).filter((c): c is { name: string; role: string } => isObj(c) && text(c.name) && text(c.role));
  const sources = (Array.isArray(r.sources) ? r.sources : []).filter((s): s is DropSource => isObj(s) && text(s.label) && https(s.url));
  const related = (Array.isArray(r.related) ? r.related : []).filter(
    (x): x is DropRelation => isObj(x) && text(x.to) && text(x.relation) && text(x.note) && (x.basis === 'fact' || x.basis === 'editorial'),
  );
  return {
    schemaVersion: 1,
    id: r.id,
    title: r.title,
    subject: r.subject,
    context: r.context,
    nature: r.nature === 'subject' ? 'subject' : 'work',
    credits: credits.map((c) => ({ name: c.name, role: c.role })),
    ...(text(r.year) && { year: r.year }),
    tags: Array.isArray(r.tags) ? r.tags.filter(text) : [],
    destination: {
      url: d.url,
      label: d.label,
      verifiedAt: text(d.verifiedAt) ? d.verifiedAt : '',
      ...((d.availability === 'intermittent' || d.availability === 'javascript-required') && { availability: d.availability }),
    },
    sources: sources.map((s) => ({ label: s.label, url: s.url, kind: s.kind, verifiedAt: s.verifiedAt })),
    ...(related.length > 0 && { related: related.map((x) => ({ to: x.to, relation: x.relation, note: x.note, basis: x.basis })) }),
    ...(text(r.image) && { image: r.image }),
  };
}

/** The preview from the file's JSON, or null if it isn't a preview file at all. */
export function parsePreview(raw: unknown): Preview | null {
  if (!isObj(raw) || raw.preview !== true || typeof raw.asOf !== 'string' || !YMD.test(raw.asOf) || !Array.isArray(raw.discoveries)) return null;
  const asOf = raw.asOf;
  const byId = new Map<string, PreviewRecord>();
  for (const r of raw.discoveries.map(parseRecord)) if (r && !byId.has(r.id)) byId.set(r.id, r);
  const list = [...byId.values()];
  // The graph only knows published records: in this in-memory copy, every preview record is one.
  const records = list.map((r) => ({ ...r, status: 'published', publishDate: asOf }) as DiscoveryRecord);
  const graph = createDiscoveryGraph({ editions: [], nodes: [], discoveries: records }, { today: asOf });
  return { asOf, list, get: (id) => byId.get(id), graph };
}

/** What the `d` parameter asks for. Unknown, malformed and unavailable ids look the same. */
export type Lookup = { kind: 'index' } | { kind: 'missing' } | { kind: 'found'; record: PreviewRecord };
export function lookup(preview: Preview, d: string | null): Lookup {
  if (d === null || d === '') return { kind: 'index' };
  const record = ID_PATTERN.test(d) && preview.graph.has(d) ? preview.get(d) : undefined;
  return record ? { kind: 'found', record } : { kind: 'missing' };
}

/** One connection as shown: the claim exactly as authored, and the discovery at the other end. */
export interface Connection {
  other: PreviewRecord;
  /** `outgoing`: this discovery made the claim; `incoming`: the other one did. Meaning is always from → to. */
  direction: 'outgoing' | 'incoming';
  claim: RelationClaim;
  from: PreviewRecord;
  to: PreviewRecord;
}

/** Every claim involving `id`, documented ones first; otherwise the graph's order. */
export function connections(preview: Preview, id: string): Connection[] {
  const out: Connection[] = [];
  for (const v of preview.graph.relationsFor(id)) {
    const other = preview.get(v.other);
    const from = preview.get(v.claim.from);
    const to = preview.get(v.claim.to);
    if (other && from && to) out.push({ other, direction: v.direction, claim: v.claim, from, to });
  }
  return out.map((c, i) => [c, i] as const).sort(([a, i], [b, j]) => (a.claim.basis === b.claim.basis ? i - j : a.claim.basis === 'fact' ? -1 : 1)).map(([c]) => c);
}

export const href = (id: string) => `#/preview/living?d=${encodeURIComponent(id)}`;

/** "25 November 2026" from YYYY-MM-DD, without the clock or the locale's time zone. */
export function longDate(ymd: string): string {
  if (!YMD.test(ymd)) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${d} ${months[m - 1]} ${y}`;
}
