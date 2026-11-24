/**
 * Adapters: existing records → Discovery. They copy references and rename nothing that
 * matters: ids are kept exactly, and attribution is carried only where the record has it.
 * Nothing is invented: a node has no creators or sources, so its Discovery has none either.
 */
import type { DropEdition, DropItem, ThreadNode } from '../types/drop';
import type { Discovery } from './types';

const frozen = <T>(a: readonly T[] | undefined): readonly T[] => Object.freeze([...(a ?? [])]);

export function fromDropItem(item: DropItem, edition: Pick<DropEdition, 'issue' | 'slug' | 'title' | 'publishDate'>): Discovery {
  return Object.freeze({
    id: item.id,
    kind: 'drop-item' as const,
    title: item.title,
    context: item.dek,
    ...(item.year !== undefined && { year: item.year }),
    creators: frozen(item.creators),
    sources: frozen(item.sources),
    ...(item.image !== undefined && { image: item.image }),
    tags: frozen(item.tags),
    column: item.column,
    edition: Object.freeze({ issue: edition.issue, slug: edition.slug, title: edition.title, publishDate: edition.publishDate }),
    record: item,
  });
}

export function fromThreadNode(node: ThreadNode): Discovery {
  return Object.freeze({
    id: node.id,
    kind: 'thread-node' as const,
    title: node.title,
    context: node.summary,
    ...(node.year !== undefined && { year: node.year }),
    creators: frozen<string>([]),
    sources: frozen<never>([]),
    ...(node.url !== undefined && { url: node.url }),
    tags: frozen<string>([]),
    nodeType: node.type,
    record: node,
  });
}
