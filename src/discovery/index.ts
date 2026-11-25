/**
 * Discovery foundation: a read-only view of discoveries and their relationships over the
 * Weekly Drop's existing content. See graph.ts for availability and relationship semantics.
 * Only the unlisted #/preview/living route (src/preview/living) imports it, as a lazy chunk
 * (tests/discovery-graph.test.ts checks that).
 */
export { fromDiscoveryRecord, fromDropItem, fromThreadNode } from './adapters';
export { availableRecords, createDiscoveryGraph, DEFAULT_INNER_LIMIT, DEFAULT_OUTER_LIMIT, MAX_DEPTH, type DiscoveryGraph } from './graph';
export { validateDiscoveryRecord, validateDiscoveryLibrary, type RecordCheckContext } from './validate';
export { publicDiscoveryFile, type PublicDiscoveryFile, type PublicDiscoveryRecord } from './publish';
export { previewDiscoveryFile, previewEligible, type PreviewDiscoveryFile, type PreviewDiscoveryRecord } from './preview';
export type {
  Discovery,
  DiscoveryCredit,
  DiscoveryDestination,
  DiscoveryRecord,
  LinkReview,
  DiscoveryContent,
  DiscoveryGraphOptions,
  DiscoveryKind,
  GraphProblem,
  NeighbourEntry,
  Neighbourhood,
  NeighbourhoodOptions,
  RelationClaim,
  RelationView,
} from './types';
