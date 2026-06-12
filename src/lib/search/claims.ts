import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { UnifiedSearchResult } from '@/lib/types';

/**
 * Fast DB search over claim instances (no LLM). Matches an instance by its
 * concept label or by its referent's canonical label / aliases, case
 * insensitive. Only instances that live in a knowledge graph are returned,
 * since the claims explorer is graph-scoped (?graph=…&highlight=…).
 */
export function buildClaimSearchWhere(search: string): Prisma.instancesWhereInput {
  return {
    knowledge_graph_id: { not: null },
    OR: [
      { concepts: { label: { contains: search, mode: 'insensitive' } } },
      { referents: { canonical_label: { contains: search, mode: 'insensitive' } } },
      {
        referents: {
          referent_aliases: {
            some: { alias: { contains: search, mode: 'insensitive' } },
          },
        },
      },
    ],
  };
}

/** Claim (instance) search in the unified cross-entity shape. */
export async function searchClaims(query: string, limit: number): Promise<UnifiedSearchResult[]> {
  const search = query.trim();
  if (search.length < 2) return [];

  const instances = await prisma.instances.findMany({
    where: buildClaimSearchWhere(search),
    take: limit,
    orderBy: { id: 'asc' },
    select: {
      id: true,
      knowledge_graph_id: true,
      concepts: { select: { label: true } },
      referents: { select: { canonical_label: true } },
      knowledge_graphs: { select: { label: true } },
    },
  });

  return instances.map(instance => {
    const id = instance.id.toString();
    const graphId = instance.knowledge_graph_id?.toString() ?? '';
    const conceptLabel = instance.concepts?.label || `Instance #${id}`;
    return {
      type: 'claim' as const,
      id,
      label: conceptLabel,
      sublabel: instance.referents?.canonical_label || undefined,
      badge: instance.knowledge_graphs?.label ?? undefined,
      href: `/claims?graph=${encodeURIComponent(graphId)}&highlight=${encodeURIComponent(id)}`,
    };
  });
}
