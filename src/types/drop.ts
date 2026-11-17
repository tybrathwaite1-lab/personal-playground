/**
 * THE WEEKLY DROP — editorial content model.
 *
 * Editions live as JSON in content/drop/editions/ (public, reviewable, versioned).
 * Personal reactions to them live in your private synced data — never in these files.
 * Full guide: EDITORIAL.md. JSON Schema: content/drop/edition.schema.json.
 */

export type DropColumn =
  | 'listen'
  | 'screen'
  | 'select-player'
  | 'blackbook'
  | 'fit'
  | 'archive'
  | 'lab'
  | 'rabbit-hole'
  | 'local-find'
  | 'reset'
  | 'wildcard';

/** archive = from the past and labelled as such; timeless = evergreen; contemporary/emerging must cite a dated source. */
export type Freshness = 'archive' | 'timeless' | 'contemporary' | 'emerging';
export type Depth = 'accessible' | 'lesser-known' | 'obscure';
export type SourceKind = 'official' | 'reference' | 'archive' | 'press' | 'listen' | 'watch' | 'read';

export interface DropSource {
  label: string;
  url: string;
  kind: SourceKind;
  /** YYYY-MM-DD the link was last confirmed working. */
  verifiedAt: string;
}

/** Relationship to another node in the thread graph. */
export interface DropRelation {
  /** Id of a DropItem or a ThreadNode. */
  to: string;
  /** Short verb phrase: "sampled", "scored", "directed by", "influenced", "same studio", … */
  relation: string;
  /** One sentence explaining the connection. */
  note: string;
  /** fact = documented historical link; editorial = our recommendation/comparison. */
  basis: 'fact' | 'editorial';
}

export interface DropItem {
  /** Stable forever — saves, feedback and threads point at it. kebab-case. */
  id: string;
  column: DropColumn;
  format: 'brief' | 'feature';
  title: string;
  /** One-line standfirst. */
  dek: string;
  /** Paragraphs. Briefs ~40–100 words; features ~300–700. Plain text, no HTML. */
  body: string[];
  /** Why it might land for you specifically. */
  why: string;
  freshness: Freshness;
  depth: Depth;
  /** Year (or range) the thing is from, if relevant. */
  year?: string;
  creators?: string[];
  tags: string[];
  exploreMinutes?: number;
  sources: DropSource[];
  /** Image id from src/data/images.ts. */
  image?: string;
  related?: DropRelation[];
  /** Ties to the Local Playground. */
  local?: { placeId?: string; communityId?: string };
}

export type EditionStatus = 'draft' | 'scheduled' | 'published';

export interface DropEdition {
  schemaVersion: 1;
  /** Stable, unique, never reused. */
  issue: number;
  slug: string;
  title: string;
  /** Short theme line, e.g. "Neo-noir cinema, underground music and urban atmosphere". */
  theme: string;
  status: EditionStatus;
  /** YYYY-MM-DD (America/New_York). Editions appear on this date. Normally a Friday. */
  publishDate: string;
  intro: string;
  /** Item id shown as the lead feature. */
  featured: string;
  items: DropItem[];
  corrections?: { date: string; note: string }[];
}

export interface ThreadNode {
  id: string;
  title: string;
  type: 'artist' | 'album' | 'game' | 'film' | 'anime' | 'manga' | 'brand' | 'designer' | 'person' | 'studio' | 'event' | 'website' | 'project' | 'hardware' | 'movement' | 'book';
  year?: string;
  summary: string;
  url?: string;
  related?: DropRelation[];
}

/** What the build ships to the app (public/data/drop.json). Drafts are never included. */
export interface DropFile {
  generatedAt: string;
  editions: DropEdition[];
  nodes: ThreadNode[];
}

export const COLUMN_META: Record<DropColumn, { name: string; jp: string; blurb: string }> = {
  listen: { name: 'The Listen', jp: '聴く', blurb: 'Music and albums' },
  screen: { name: 'The Screen', jp: '観る', blurb: 'Cinema, anime and visual storytelling' },
  'select-player': { name: 'Select Player', jp: '遊ぶ', blurb: 'Gaming and FGC culture' },
  blackbook: { name: 'The Blackbook', jp: '描く', blurb: 'Art, graffiti, illustration and comics' },
  fit: { name: 'The Fit', jp: '着る', blurb: 'Streetwear and sneakers' },
  archive: { name: 'The Archive', jp: '記録', blurb: 'History and cultural movements' },
  lab: { name: 'The Lab', jp: '試す', blurb: 'Technology, photography and DIY' },
  'rabbit-hole': { name: 'The Rabbit Hole', jp: '迷う', blurb: 'Independent websites' },
  'local-find': { name: 'The Local Find', jp: '地元', blurb: 'Tampa Bay experiences and communities' },
  reset: { name: 'The Reset', jp: '休む', blurb: 'Philosophy and relaxed experiences' },
  wildcard: { name: 'The Wildcard', jp: '番外', blurb: 'Unexpected discoveries' },
};
