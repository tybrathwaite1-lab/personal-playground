/**
 * The discovery graph: which discoveries are available, how they relate, and a bounded
 * neighbourhood around any one of them. Pure and deterministic: the same content, the same
 * `today` and the same options always give the same answer, in the same order.
 *
 * Availability follows the Weekly Drop's own publication rule (visibleEditions): a Drop item is
 * available once its edition is published on or before `today`; drafts never are. Thread
 * nodes are always available, as in the Drop's thread panel. Anything unavailable is absent
 * from the graph entirely, so it can't be reached directly, by relation, or through any number
 * of steps, and no claim authored on it is seen.
 *
 * Relationship semantics:
 *  - A claim is stored once, exactly as authored (from, to, relation, note, basis).
 *  - Traversal works in both directions: relationsFor() lists claims a discovery made
 *    (outgoing) and claims made about it (incoming). Direction is about traversal only; the
 *    meaning always reads claim.from → claim.to and is never reversed.
 *  - A genuine duplicate is the same from, to, relation (trimmed, case-insensitive) and basis.
 *    Only the first is kept. A reciprocal claim (B → A beside A → B) or a different relation
 *    between the same pair is a distinct claim and is kept.
 *  - Self-links are ignored. Targets that don't exist anywhere are ignored and reported as
 *    problems; targets that exist but aren't available yet are ignored silently (that's
 *    ordinary scheduling, and the diagnostic list mustn't reveal scheduled content).
 */
import type { DropEdition, DropItem } from '../types/drop';
import { visibleEditions } from '../utils/dropValidate';
import { fromDropItem, fromThreadNode } from './adapters';
import type {
  Discovery,
  DiscoveryContent,
  DiscoveryGraphOptions,
  GraphProblem,
  NeighbourEntry,
  Neighbourhood,
  NeighbourhoodOptions,
  RelationClaim,
  RelationView,
} from './types';

export const DEFAULT_INNER_LIMIT = 6;
export const DEFAULT_OUTER_LIMIT = 12;
/** The deepest neighbourhood the foundation computes. */
export const MAX_DEPTH = 2;

const YMD = /^\d{4}-\d{2}-\d{2}$/;
function isYmd(s: unknown): s is string {
  if (typeof s !== 'string' || !YMD.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
/** Plain code-unit order: independent of locale, so every machine sorts the same way. */
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const limit = (v: number | undefined, fallback: number, name: string) => {
  if (v === undefined) return fallback;
  if (!Number.isInteger(v) || v < 0) throw new RangeError(`${name} must be a whole number ≥ 0 (got ${v})`);
  return v;
};

export interface DiscoveryGraph {
  /** Available discoveries, in a stable order: Drop items by issue then position, then thread nodes. */
  all(): readonly Discovery[];
  /** An available discovery, or null (unknown, scheduled, draft or never published). */
  get(id: string): Discovery | null;
  has(id: string): boolean;
  /** Every claim involving an available discovery and another available one. Empty for unknown ids. */
  relationsFor(id: string): readonly RelationView[];
  /** A bounded neighbourhood around `id`, or null if it isn't available. */
  neighbourhood(id: string, options?: NeighbourhoodOptions): Neighbourhood | null;
  /** Content problems found while building (diagnostic only). */
  readonly problems: readonly GraphProblem[];
}

export function createDiscoveryGraph(content: DiscoveryContent, options: DiscoveryGraphOptions): DiscoveryGraph {
  if (!isYmd(options?.today)) throw new RangeError(`today must be a YYYY-MM-DD date (got ${String(options?.today)})`);
  const problems: GraphProblem[] = [];

  // Every id that exists anywhere (any status), to tell "not yet available" from "doesn't exist".
  const known = new Set<string>();
  for (const e of content.editions) for (const it of e.items) known.add(it.id);
  for (const n of content.nodes) known.add(n.id);

  // Available records, oldest issue first so the earliest publication wins an id collision.
  const published = [...visibleEditions([...content.editions] as DropEdition[], options.today)].reverse();
  const byId = new Map<string, Discovery>();
  const order: Discovery[] = [];
  const add = (d: Discovery) => {
    if (byId.has(d.id)) {
      problems.push({ kind: 'id-collision', id: d.id, detail: `a second ${d.kind} uses this id; the first is kept and the second is ignored` });
      return;
    }
    byId.set(d.id, d);
    order.push(d);
  };
  for (const e of published) for (const it of e.items) add(fromDropItem(it, e));
  for (const n of content.nodes) add(fromThreadNode(n));

  // Claims, authored on available records only (a scheduled record's claims stay unseen).
  const outgoing = new Map<string, RelationClaim[]>();
  const incoming = new Map<string, RelationClaim[]>();
  const seen = new Set<string>();
  for (const d of order) {
    for (const r of (d.record as DropItem).related ?? []) {
      if (r.to === d.id) {
        problems.push({ kind: 'self-link', id: d.id, detail: `relates to itself ("${r.relation}"); ignored` });
        continue;
      }
      const key = JSON.stringify([d.id, r.to, r.relation.trim().toLowerCase(), r.basis]);
      if (seen.has(key)) {
        problems.push({ kind: 'duplicate-claim', id: d.id, detail: `repeats "${r.relation}" (${r.basis}) → ${r.to}; the first is kept` });
        continue;
      }
      seen.add(key);
      if (!byId.has(r.to)) {
        if (!known.has(r.to)) problems.push({ kind: 'unresolved-target', id: d.id, detail: `relates to "${r.to}", which doesn't exist` });
        continue;
      }
      const claim: RelationClaim = Object.freeze({ from: d.id, to: r.to, relation: r.relation, note: r.note, basis: r.basis });
      (outgoing.get(d.id) ?? outgoing.set(d.id, []).get(d.id)!).push(claim);
      (incoming.get(r.to) ?? incoming.set(r.to, []).get(r.to)!).push(claim);
    }
  }

  const views = new Map<string, readonly RelationView[]>();
  const relationsFor = (id: string): readonly RelationView[] => {
    if (!byId.has(id)) return Object.freeze([]);
    const cached = views.get(id);
    if (cached) return cached;
    // Outgoing in authored order (the editor's order), then incoming by author id; a stable sort
    // keeps each author's own order.
    const out = (outgoing.get(id) ?? []).map((claim) => Object.freeze({ other: claim.to, direction: 'outgoing' as const, claim }));
    const inc = [...(incoming.get(id) ?? [])]
      .sort((a, b) => byCodeUnit(a.from, b.from))
      .map((claim) => Object.freeze({ other: claim.from, direction: 'incoming' as const, claim }));
    const list = Object.freeze([...out, ...inc]);
    views.set(id, list);
    return list;
  };

  /** Groups views by the discovery at the other end, in first-appearance order. */
  const group = (list: readonly RelationView[], skip: (other: string) => boolean) => {
    const groups = new Map<string, RelationView[]>();
    for (const v of list) {
      if (skip(v.other)) continue;
      (groups.get(v.other) ?? groups.set(v.other, []).get(v.other)!).push(v);
    }
    return groups;
  };

  const neighbourhood = (id: string, opts: NeighbourhoodOptions = {}): Neighbourhood | null => {
    const depth = opts.depth ?? MAX_DEPTH;
    if (depth !== 1 && depth !== 2) throw new RangeError(`depth must be 1 or 2 (got ${String(depth)})`);
    const innerLimit = limit(opts.innerLimit, DEFAULT_INNER_LIMIT, 'innerLimit');
    const outerLimit = limit(opts.outerLimit, DEFAULT_OUTER_LIMIT, 'outerLimit');
    const centre = byId.get(id);
    if (!centre) return null;

    const direct = group(relationsFor(id), (o) => o === id);
    const entry = (other: string, via: string, relations: RelationView[]): NeighbourEntry =>
      Object.freeze({ discovery: byId.get(other)!, via, relations: Object.freeze(relations) });
    const inner = [...direct].slice(0, innerLimit).map(([other, rel]) => entry(other, id, rel));

    // The outer ring grows only from the inner ring that's shown, and never repeats the centre or
    // any direct relation (even one the inner limit left out): it's strictly second-degree.
    const outerGroups = new Map<string, NeighbourEntry>();
    if (depth === 2)
      for (const i of inner) {
        const from = i.discovery.id;
        for (const [other, rel] of group(relationsFor(from), (o) => o === id || direct.has(o))) {
          if (!outerGroups.has(other)) outerGroups.set(other, entry(other, from, rel));
        }
      }
    const outer = [...outerGroups.values()].slice(0, outerLimit);
    return Object.freeze({
      centre,
      inner: Object.freeze(inner),
      outer: Object.freeze(outer),
      omitted: Object.freeze({ inner: direct.size - inner.length, outer: outerGroups.size - outer.length }),
    });
  };

  const all = Object.freeze([...order]);
  return Object.freeze({
    all: () => all,
    get: (id: string) => byId.get(id) ?? null,
    has: (id: string) => byId.has(id),
    relationsFor,
    neighbourhood,
    problems: Object.freeze(problems.map((p) => Object.freeze(p))),
  });
}
