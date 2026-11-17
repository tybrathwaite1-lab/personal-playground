/**
 * Weekly Drop validation — used by the build (scripts/drop/build.ts), the tests,
 * and the in-app import preview. Errors block publication; warnings don't.
 */
import type { DropEdition, ThreadNode } from '../types/drop';
import { COLUMN_META } from '../types/drop';

export interface Issue {
  path: string;
  message: string;
}
export interface ValidationResult {
  errors: Issue[];
  warnings: Issue[];
}

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

function validDate(s: unknown): boolean {
  if (typeof s !== 'string' || !YMD.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function validateEdition(raw: unknown, ctx: { knownImages?: Set<string>; knownPlaces?: Set<string>; knownCommunities?: Set<string> } = {}): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  const warn = (path: string, message: string) => warnings.push({ path, message });

  if (!isObj(raw)) return { errors: [{ path: '', message: 'Edition must be a JSON object' }], warnings };
  const e = raw as Partial<DropEdition> & Record<string, unknown>;
  if (e.schemaVersion !== 1) err('schemaVersion', 'must be 1');
  if (!Number.isInteger(e.issue) || (e.issue as number) < 1) err('issue', 'must be a positive whole number');
  if (!str(e.slug) || !KEBAB.test(e.slug as string)) err('slug', 'must be kebab-case, e.g. "after-hours"');
  for (const k of ['title', 'theme', 'intro'] as const) if (!str(e[k])) err(k, 'is required');
  if (!['draft', 'scheduled', 'published'].includes(e.status as string)) err('status', 'must be draft, scheduled or published');
  if (!validDate(e.publishDate)) err('publishDate', 'must be a real date as YYYY-MM-DD');
  else if (new Date(`${e.publishDate}T12:00:00Z`).getUTCDay() !== 5) warn('publishDate', 'is not a Friday (allowed, but the Drop normally lands on Fridays)');
  if (str(e.intro) && words(e.intro as string) > 160) warn('intro', 'is long — aim for under ~120 words');

  const items = Array.isArray(e.items) ? e.items : [];
  if (!Array.isArray(e.items)) err('items', 'must be an array');
  if (items.length < 3) err('items', 'needs at least 3 discoveries');
  if (items.length && (items.length < 5 || items.length > 8)) warn('items', `has ${items.length} discoveries — 5–7 is the usual range`);

  const ids = new Set<string>();
  items.forEach((it: unknown, i: number) => {
    const p = `items[${i}]`;
    if (!isObj(it)) return err(p, 'must be an object');
    const item = it as Record<string, unknown>;
    if (!str(item.id) || !KEBAB.test(item.id as string)) err(`${p}.id`, 'must be kebab-case');
    else if (ids.has(item.id as string)) err(`${p}.id`, `duplicate id "${item.id}"`);
    else ids.add(item.id as string);
    if (!(item.column as string in COLUMN_META)) err(`${p}.column`, `unknown column "${item.column}"`);
    if (!['brief', 'feature'].includes(item.format as string)) err(`${p}.format`, 'must be brief or feature');
    for (const k of ['title', 'dek', 'why']) if (!str(item[k])) err(`${p}.${k}`, 'is required');
    const body = Array.isArray(item.body) ? (item.body as unknown[]) : null;
    if (!body || !body.length || !body.every(str)) err(`${p}.body`, 'must be a non-empty array of paragraphs');
    else {
      const w = body.reduce((n: number, para) => n + words(para as string), 0);
      if (item.format === 'brief' && (w < 25 || w > 140)) warn(`${p}.body`, `brief is ${w} words (aim 40–100)`);
      if (item.format === 'feature' && (w < 220 || w > 800)) warn(`${p}.body`, `feature is ${w} words (aim 300–700)`);
      if (body.some((para) => /<[a-z][^>]*>/i.test(para as string))) err(`${p}.body`, 'must be plain text (no HTML)');
    }
    if (!['archive', 'timeless', 'contemporary', 'emerging'].includes(item.freshness as string)) err(`${p}.freshness`, 'must be archive, timeless, contemporary or emerging');
    if (!['accessible', 'lesser-known', 'obscure'].includes(item.depth as string)) err(`${p}.depth`, 'must be accessible, lesser-known or obscure');
    if (['contemporary', 'emerging'].includes(item.freshness as string) && !str(item.year))
      err(`${p}.year`, 'is required for contemporary/emerging items so recency is verifiable');
    if (!Array.isArray(item.tags) || !(item.tags as unknown[]).every(str)) err(`${p}.tags`, 'must be an array of strings');
    const sources = Array.isArray(item.sources) ? (item.sources as unknown[]) : [];
    if (!sources.length) err(`${p}.sources`, 'needs at least one source');
    sources.forEach((s, j) => {
      const sp = `${p}.sources[${j}]`;
      if (!isObj(s)) return err(sp, 'must be an object');
      if (!str(s.label)) err(`${sp}.label`, 'is required');
      if (typeof s.url !== 'string' || !/^https:\/\/[^\s]+$/.test(s.url)) err(`${sp}.url`, 'must be an https URL');
      if (!['official', 'reference', 'archive', 'press', 'listen', 'watch', 'read'].includes(s.kind as string)) err(`${sp}.kind`, 'unknown kind');
      if (!validDate(s.verifiedAt)) err(`${sp}.verifiedAt`, 'must be YYYY-MM-DD');
    });
    const urls = sources.map((s) => (isObj(s) ? s.url : '')).filter(Boolean);
    if (new Set(urls).size !== urls.length) warn(`${p}.sources`, 'repeats a URL');
    if (item.exploreMinutes !== undefined && !(Number.isInteger(item.exploreMinutes) && (item.exploreMinutes as number) > 0))
      err(`${p}.exploreMinutes`, 'must be a positive whole number');
    if (item.image !== undefined && ctx.knownImages && !ctx.knownImages.has(item.image as string)) warn(`${p}.image`, `image "${item.image}" isn't in the image registry — a typographic placeholder will show`);
    if (Array.isArray(item.related))
      (item.related as unknown[]).forEach((r, j) => {
        const rp = `${p}.related[${j}]`;
        if (!isObj(r) || !str(r.to) || !str(r.relation) || !str(r.note)) return err(rp, 'needs to, relation and note');
        if (!['fact', 'editorial'].includes(r.basis as string)) err(`${rp}.basis`, 'must be fact or editorial');
      });
    if (isObj(item.local)) {
      const l = item.local as { placeId?: string; communityId?: string };
      if (l.placeId && ctx.knownPlaces && !ctx.knownPlaces.has(l.placeId)) err(`${p}.local.placeId`, `unknown place "${l.placeId}"`);
      if (l.communityId && ctx.knownCommunities && !ctx.knownCommunities.has(l.communityId)) err(`${p}.local.communityId`, `unknown community "${l.communityId}"`);
    }
  });
  if (str(e.featured) && !ids.has(e.featured as string)) err('featured', `must be the id of one of this edition's items (got "${e.featured}")`);
  if (!str(e.featured)) err('featured', 'is required');
  if (Array.isArray(e.corrections))
    e.corrections.forEach((c, i) => {
      if (!isObj(c) || !validDate(c.date) || !str(c.note)) err(`corrections[${i}]`, 'needs date (YYYY-MM-DD) and note');
    });
  return { errors, warnings };
}

/** Checks across all editions + thread nodes: unique issues/slugs/ids and resolvable relations. */
export function validateLibrary(editions: DropEdition[], nodes: ThreadNode[]): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const issues = new Map<number, string>();
  const slugs = new Map<string, string>();
  const itemIds = new Map<string, string>();
  for (const ed of editions) {
    const where = `issue ${ed.issue}`;
    if (issues.has(ed.issue)) errors.push({ path: where, message: `issue number ${ed.issue} is used twice` });
    issues.set(ed.issue, ed.slug);
    if (slugs.has(ed.slug)) errors.push({ path: where, message: `slug "${ed.slug}" is used twice` });
    slugs.set(ed.slug, where);
    for (const it of ed.items) {
      if (itemIds.has(it.id)) errors.push({ path: `${where} · ${it.id}`, message: `item id also used in ${itemIds.get(it.id)}` });
      itemIds.set(it.id, where);
    }
  }
  const nodeIds = new Set<string>();
  for (const n of nodes) {
    if (nodeIds.has(n.id) || itemIds.has(n.id)) errors.push({ path: `node ${n.id}`, message: 'id collides with another node or item' });
    nodeIds.add(n.id);
  }
  const known = (id: string) => itemIds.has(id) || nodeIds.has(id);
  for (const ed of editions)
    for (const it of ed.items)
      for (const r of it.related ?? []) if (!known(r.to)) warnings.push({ path: `issue ${ed.issue} · ${it.id}`, message: `related "${r.to}" doesn't exist yet` });
  for (const n of nodes) for (const r of n.related ?? []) if (!known(r.to)) warnings.push({ path: `node ${n.id}`, message: `related "${r.to}" doesn't exist yet` });
  return { errors, warnings };
}

/** Which editions are visible on a given New York date. Drafts never are. */
export function visibleEditions(editions: DropEdition[], todayYmd: string): DropEdition[] {
  return editions
    .filter((e) => e.status !== 'draft' && e.publishDate <= todayYmd)
    .sort((a, b) => b.issue - a.issue);
}
