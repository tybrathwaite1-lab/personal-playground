/**
 * Validation for standalone discovery records (content/discoveries/*.json). Structural problems
 * are errors (the build fails with --strict and leaves the record out). The rules reuse the
 * Weekly Drop's conventions: the same https-and-isSafeUrl rule for links, the same source shape
 * and kinds, and the same relation rules (checkRelations).
 *
 * Whether a link still *works* is not checked here (no network): see
 * scripts/discoveries/check-links.ts and the record's linkReviews.
 */
import type { SourceKind } from '../types/drop';
import { checkRelations, isHttpsUrl, type Issue, type ValidationResult } from '../utils/dropValidate';
import type { DiscoveryRecord } from './types';

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
function isYmd(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const SOURCE_KINDS: Record<SourceKind, true> = { official: true, reference: true, archive: true, press: true, listen: true, watch: true, read: true };
const FIELDS = new Set(['schemaVersion', 'id', 'status', 'publishDate', 'title', 'subject', 'context', 'nature', 'credits', 'year', 'tags', 'destination', 'sources', 'related', 'image', 'linkReviews', 'editorialNotes']);
/** The editorial introduction stays concise (blueprint §04: context, not exhaustion). */
export const MAX_CONTEXT = 700;

/** What a record is checked against: the image registry, and (optionally) the date for "not in the future". */
export interface RecordCheckContext {
  /** Image registry entries by id (src/data/images.ts). */
  images: ReadonlyMap<string, { license?: unknown; credit?: unknown; sourceUrl?: unknown; alt?: unknown }>;
  /** YYYY-MM-DD; when given, verification dates may not be later than it. */
  today?: string;
}

export function validateDiscoveryRecord(raw: unknown, ctx: RecordCheckContext, path = 'discovery'): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const err = (p: string, message: string) => void errors.push({ path: p, message });
  const warn = (p: string, message: string) => void warnings.push({ path: p, message });
  if (!isObj(raw)) return { errors: [{ path, message: 'must be an object' }], warnings };
  const r = raw;
  const p = `${path}${typeof r.id === 'string' ? ` (${r.id})` : ''}`;
  const dateCheck = (fp: string, v: unknown) => {
    if (!isYmd(v)) return err(fp, 'must be a real YYYY-MM-DD date');
    if (ctx.today && v > ctx.today) err(fp, `is in the future (${v} > ${ctx.today})`);
  };

  if (r.schemaVersion !== 1) err(`${p}.schemaVersion`, 'must be 1');
  if (!str(r.id) || !KEBAB.test(r.id)) err(`${p}.id`, 'must be kebab-case');
  if (!['draft', 'ready', 'published'].includes(r.status as string)) err(`${p}.status`, 'must be draft, ready or published');
  if (r.status === 'published' && r.publishDate === undefined) err(`${p}.publishDate`, 'is required when published');
  if (r.publishDate !== undefined && !isYmd(r.publishDate)) err(`${p}.publishDate`, 'must be a real YYYY-MM-DD date');
  for (const k of ['title', 'subject', 'context']) if (!str(r[k])) err(`${p}.${k}`, 'is required');
  if (str(r.context) && r.context.length > MAX_CONTEXT) err(`${p}.context`, `is ${r.context.length} characters; keep it under ${MAX_CONTEXT}`);
  if (!['work', 'subject'].includes(r.nature as string)) err(`${p}.nature`, 'must be work or subject');

  // Credits: name and role each; a work must credit at least one person or group.
  if (!Array.isArray(r.credits)) err(`${p}.credits`, 'must be an array (empty only for a subject)');
  else {
    r.credits.forEach((c: unknown, i: number) => {
      if (!isObj(c) || !str(c.name) || !str(c.role)) err(`${p}.credits[${i}]`, 'needs a name and a role');
    });
    if (r.nature === 'work' && r.credits.length === 0) err(`${p}.credits`, 'a work must credit its creator');
  }
  if (r.year !== undefined && !str(r.year)) err(`${p}.year`, 'must be text when present');
  if (!Array.isArray(r.tags) || !r.tags.every((t) => str(t))) err(`${p}.tags`, 'must be an array of text');

  // The original destination: separate from research sources.
  const urls = new Set<string>();
  const d = r.destination;
  if (!isObj(d)) err(`${p}.destination`, 'is required: { url, label, verifiedAt }');
  else {
    if (!isHttpsUrl(d.url)) err(`${p}.destination.url`, 'must be an https URL');
    else urls.add(d.url);
    if (!str(d.label)) err(`${p}.destination.label`, 'is required');
    dateCheck(`${p}.destination.verifiedAt`, d.verifiedAt);
    if (d.availability !== undefined && !['intermittent', 'javascript-required'].includes(d.availability as string))
      err(`${p}.destination.availability`, 'must be intermittent or javascript-required');
  }

  if (!Array.isArray(r.sources) || r.sources.length === 0) err(`${p}.sources`, 'needs at least one supporting source');
  else
    r.sources.forEach((s: unknown, i: number) => {
      const sp = `${p}.sources[${i}]`;
      if (!isObj(s)) return err(sp, 'must be an object');
      if (!str(s.label)) err(`${sp}.label`, 'is required');
      if (!isHttpsUrl(s.url)) err(`${sp}.url`, 'must be an https URL');
      else urls.add(s.url); // a source may also be the destination when it is the evidence
      if (typeof s.kind !== 'string' || !Object.prototype.hasOwnProperty.call(SOURCE_KINDS, s.kind)) err(`${sp}.kind`, `unknown kind "${String(s.kind)}"`);
      dateCheck(`${sp}.verifiedAt`, s.verifiedAt);
    });

  // Relations: Drop rules, plus no self-links and no genuine duplicates (including ones whose
  // notes conflict). Reciprocal claims live on the other record and are fine.
  if (r.related !== undefined) {
    if (!Array.isArray(r.related)) err(`${p}.related`, 'must be an array');
    else {
      checkRelations(r.related, p, err);
      const seen = new Map<string, string>();
      r.related.forEach((x: unknown, i: number) => {
        if (!isObj(x) || !str(x.to) || !str(x.relation)) return;
        if (x.to === r.id) err(`${p}.related[${i}]`, 'relates to itself');
        const key = JSON.stringify([x.to, x.relation.trim().toLowerCase(), x.basis]);
        const prior = seen.get(key);
        if (prior === undefined) seen.set(key, String(x.note));
        else if (prior === x.note) err(`${p}.related[${i}]`, `duplicates an earlier claim ("${x.relation}" → ${x.to})`);
        else err(`${p}.related[${i}]`, `repeats an earlier claim ("${x.relation}" → ${x.to}) with a different note; keep one wording`);
      });
    }
  }

  // Optional image: must be in the registry with its rights recorded. No image is fine.
  if (r.image !== undefined) {
    const img = typeof r.image === 'string' ? ctx.images.get(r.image) : undefined;
    if (!img) err(`${p}.image`, `"${String(r.image)}" is not in the image registry`);
    else if (!str(img.license) || !str(img.credit) || !isHttpsUrl(img.sourceUrl) || !str(img.alt)) err(`${p}.image`, 'registry entry lacks license, credit, https source or alt text');
  }

  // Link reviews: about this record's own links; a published record can't carry an unresolved one.
  if (r.linkReviews !== undefined) {
    if (!Array.isArray(r.linkReviews)) err(`${p}.linkReviews`, 'must be an array');
    else
      r.linkReviews.forEach((lr: unknown, i: number) => {
        const lp = `${p}.linkReviews[${i}]`;
        if (!isObj(lr)) return err(lp, 'must be an object');
        if (!str(lr.url) || !urls.has(lr.url)) err(`${lp}.url`, "must be one of this record's links");
        if (!['permanent-failure', 'transient-failure', 'blocked', 'intentional-unavailability'].includes(lr.finding as string)) err(`${lp}.finding`, 'unknown finding');
        if (!['keep', 'replace', 'remove'].includes(lr.decision as string)) err(`${lp}.decision`, 'must be keep, replace or remove');
        if (!str(lr.note)) err(`${lp}.note`, 'is required');
        dateCheck(`${lp}.reviewedAt`, lr.reviewedAt);
        if (r.status === 'published' && (lr.decision === 'replace' || lr.decision === 'remove')) err(lp, `unresolved link review (${String(lr.decision)}); resolve it before publishing`);
      });
  }
  if (r.editorialNotes !== undefined && (!Array.isArray(r.editorialNotes) || !r.editorialNotes.every((n) => str(n)))) err(`${p}.editorialNotes`, 'must be an array of text');
  for (const k of Object.keys(r)) if (!FIELDS.has(k)) warn(`${p}.${k}`, 'unknown field (ignored)');
  return { errors, warnings };
}

/**
 * Checks across all records: ids unique among themselves and in the shared namespace with Drop
 * items and thread nodes; relation targets that exist nowhere are warnings (as in the Drop).
 */
export function validateDiscoveryLibrary(records: readonly DiscoveryRecord[], existing: { itemIds: Iterable<string>; nodeIds: Iterable<string> }): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const items = new Set(existing.itemIds);
  const nodes = new Set(existing.nodeIds);
  const seen = new Set<string>();
  for (const r of records) {
    if (seen.has(r.id)) errors.push({ path: r.id, message: 'id used by two discovery records' });
    if (items.has(r.id)) errors.push({ path: r.id, message: 'id collides with a Weekly Drop item' });
    if (nodes.has(r.id)) errors.push({ path: r.id, message: 'id collides with a thread node' });
    seen.add(r.id);
  }
  for (const r of records)
    for (const x of r.related ?? [])
      if (!seen.has(x.to) && !items.has(x.to) && !nodes.has(x.to)) warnings.push({ path: `${r.id}.related → ${x.to}`, message: "target doesn't exist yet" });
  return { errors, warnings };
}
