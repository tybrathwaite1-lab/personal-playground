/**
 * Discovery foundation: a read-only view of discoveries and their relationships over the
 * Weekly Drop's existing content. See graph.ts for availability and relationship semantics.
 * Not imported by any route yet (tests/discovery-graph.test.ts checks that).
 */
export { fromDropItem, fromThreadNode } from './adapters';
export { createDiscoveryGraph, DEFAULT_INNER_LIMIT, DEFAULT_OUTER_LIMIT, MAX_DEPTH, type DiscoveryGraph } from './graph';
export type {
  Discovery,
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
