/**
 * Discovery foundation (Creative Blueprint V2; PR 1 in collaboration/ARCHITECTURE_ASSESSMENT_V2.md).
 *
 * A read-only view over content that already exists: Weekly Drop items and thread-library nodes.
 * Nothing here is stored, migrated or duplicated. Each Discovery points back at its original
 * record, and carries only the attribution that record actually has.
 *
 * Not used by any route yet. Presentation (pages, the constellation's geometry) lives elsewhere.
 */
import type { DropColumn, DropEdition, DropItem, DropRelation, DropSource, ThreadNode } from '../types/drop';

export type DiscoveryKind = 'drop-item' | 'thread-node' | 'standalone';

// ─── Standalone discovery records (content/discoveries/*.json) ───────
/** A credited person or group and what they did, as the original project states it. */
export interface DiscoveryCredit {
  name: string;
  role: string;
}

/**
 * Where a visitor goes for the original work or the primary source: distinct from the research
 * sources that support the editorial text.
 */
export interface DiscoveryDestination {
  url: string;
  label: string;
  /** When an editor last confirmed it was the right destination and reachable (YYYY-MM-DD). */
  verifiedAt: string;
  /**
   * Known, intentional conditions, so a link check doesn't mistake them for failure:
   * 'intermittent' (offline by design at times, e.g. solar-powered), 'javascript-required'
   * (content renders only in a browser with JavaScript).
   */
  availability?: 'intermittent' | 'javascript-required';
}

/** An editor's recorded decision about a link that failed a check. */
export interface LinkReview {
  url: string;
  finding: 'permanent-failure' | 'transient-failure' | 'blocked' | 'intentional-unavailability';
  /** keep: the link stays (e.g. a temporary outage); replace/remove: unresolved until done. */
  decision: 'keep' | 'replace' | 'remove';
  note: string;
  reviewedAt: string;
}

/**
 * One standalone discovery, as stored. `draft`: still being verified; `ready`: verified,
 * awaiting a publication decision; `published`: public from `publishDate` (New York).
 * Only published records on or after their date are ever shipped or traversed.
 */
export interface DiscoveryRecord {
  schemaVersion: 1;
  id: string;
  status: 'draft' | 'ready' | 'published';
  publishDate?: string;
  title: string;
  /** What it is about, plainly ("Japanese jazz kissa", "Return of the Obra Dinn"). */
  subject: string;
  /** The editorial introduction. */
  context: string;
  /** 'work': something specific people made (credits required); 'subject': a place, practice or culture. */
  nature: 'work' | 'subject';
  credits: DiscoveryCredit[];
  year?: string;
  tags: string[];
  destination: DiscoveryDestination;
  sources: DropSource[];
  /** Editorial associations and documented links, authored on this record (DropRelation rules). */
  related?: DropRelation[];
  /** An image id from the editorial image registry (src/data/images.ts); optional. */
  image?: string;
  linkReviews?: LinkReview[];
  /** Notes for editors (open questions, cautions). Never shown to visitors. */
  editorialNotes?: string[];
}

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
  /** Standalone discoveries: what it's about, credits with roles, where to go for the original. */
  readonly subject?: string;
  readonly credits?: readonly DiscoveryCredit[];
  readonly destination?: DiscoveryDestination;
  readonly publishDate?: string;
  /** Drop items: the edition it was published in. */
  readonly edition?: { readonly issue: number; readonly slug: string; readonly title: string; readonly publishDate: string };
  /** The original record, for anything else it holds. Read-only: never modify it. */
  readonly record: DropItem | ThreadNode | DiscoveryRecord;
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
  /** Standalone discovery records (validated); only published ones on or after their date count. */
  readonly discoveries?: readonly DiscoveryRecord[];
}

export interface DiscoveryGraphOptions {
  /**
   * The New York date (YYYY-MM-DD) that decides which editions are published, as the Weekly
   * Drop decides (visibleEditions). Always explicit: the module never reads the clock.
   */
  today: string;
}
