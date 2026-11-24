/**
 * Discovery foundation (Creative Blueprint V2; PR 1 in collaboration/ARCHITECTURE_ASSESSMENT_V2.md).
 *
 * A read-only view over content that already exists: Weekly Drop items and thread-library nodes.
 * Nothing here is stored, migrated or duplicated. Each Discovery points back at its original
 * record, and carries only the attribution that record actually has.
 *
 * Not used by any route yet. Presentation (pages, the constellation's geometry) lives elsewhere.
 */
import type { DropColumn, DropEdition, DropItem, DropSource, ThreadNode } from '../types/drop';

export type DiscoveryKind = 'drop-item' | 'thread-node';

/** One discovery: a Drop item or a thread node, seen through the same shape. */
export interface Discovery {
  /** The record's own id, unchanged (saves, feedback and relations already point at it). */
  readonly id: string;
  readonly kind: DiscoveryKind;
  readonly title: string;
  /** Concise context: an item's dek (standfirst) or a node's summary. */
  readonly context: string;
  /** When it's from, if the record says. */
  readonly year?: string;
  /** Credited creators, if the record names any (thread nodes never do). */
  readonly creators: readonly string[];
  /** An item's sources, with their verification dates, exactly as published. Nodes have none. */
  readonly sources: readonly DropSource[];
  /** A thread node's own link, if it has one (validated as https at build). Items use `sources`. */
  readonly url?: string;
  /** Image id in the editorial image registry (src/data/images.ts), if the item names one. */
  readonly image?: string;
  readonly tags: readonly string[];
  /** Drop items: the column it ran in. */
  readonly column?: DropColumn;
  /** Thread nodes: what kind of thing it is. */
  readonly nodeType?: ThreadNode['type'];
  /** Drop items: the edition it was published in. */
  readonly edition?: { readonly issue: number; readonly slug: string; readonly title: string; readonly publishDate: string };
  /** The original record, for anything else it holds. Read-only: never modify it. */
  readonly record: DropItem | ThreadNode;
}

/**
 * One relationship claim, exactly as authored: `from` says `relation` about `to`, for the reason
 * in `note`, on a documented (`fact`) or editorial basis. Meaning always reads from → to.
 */
export interface RelationClaim {
  readonly from: string;
  readonly to: string;
  readonly relation: string;
  readonly note: string;
  readonly basis: 'fact' | 'editorial';
}

/**
 * A claim as seen from one discovery. `direction` is about traversal only: `outgoing` claims
 * were authored on this discovery, `incoming` ones on the other. It never changes what the
 * claim says: that is always `claim.from` → `claim.to`.
 */
export interface RelationView {
  /** The discovery at the other end, from this one's point of view. */
  readonly other: string;
  readonly direction: 'outgoing' | 'incoming';
  readonly claim: RelationClaim;
}

/** A discovery in a neighbourhood ring, with every claim that connects it to the ring inside. */
export interface NeighbourEntry {
  readonly discovery: Discovery;
  /** Which discovery it was reached from: the centre (inner ring) or an inner-ring discovery. */
  readonly via: string;
  /** The claims between `via` and this discovery, in relationsFor order. */
  readonly relations: readonly RelationView[];
}

export interface Neighbourhood {
  readonly centre: Discovery;
  /** Direct relations of the centre. */
  readonly inner: readonly NeighbourEntry[];
  /** Second-degree relations (depth 2 only): related to the inner ring, not to the centre itself. */
  readonly outer: readonly NeighbourEntry[];
  /** How many eligible discoveries the limits left out of each ring. */
  readonly omitted: { readonly inner: number; readonly outer: number };
}

export interface NeighbourhoodOptions {
  /** 1 = inner ring only; 2 = inner and outer (default). The foundation never goes deeper. */
  depth?: 1 | 2;
  /** Most discoveries in the inner ring (default 6). */
  innerLimit?: number;
  /** Most discoveries in the outer ring (default 12). */
  outerLimit?: number;
}

/** Content problems noticed while building the graph. Diagnostic only: never shown to visitors. */
export interface GraphProblem {
  readonly kind: 'duplicate-claim' | 'self-link' | 'unresolved-target' | 'id-collision';
  readonly id: string;
  readonly detail: string;
}

/** The input: the same shape the app loads from public/data/drop.json. */
export interface DiscoveryContent {
  readonly editions: readonly DropEdition[];
  readonly nodes: readonly ThreadNode[];
}

export interface DiscoveryGraphOptions {
  /**
   * The New York date (YYYY-MM-DD) that decides which editions are published, as the Weekly
   * Drop decides (visibleEditions). Always explicit: the module never reads the clock.
   */
  today: string;
}
