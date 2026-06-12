import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { UnifiedSearchResult } from '@/lib/types';

/**
 * Build the same free-text OR clause used by /api/referents/paginated so the
 * unified search matches referents identically (canonical_label / aliases /
 * external_ids / numeric id).
 */
export function buildReferentSearchWhere(search: string): Prisma.referentsWhereInput {
  const or: Prisma.referentsWhereInput[] = [
    { canonical_label: { contains: search, mode: 'insensitive' } },
    {
      referent_aliases: {
        some: {
          OR: [
            { alias: { contains: search, mode: 'insensitive' } },
            { normalized: { contains: search, mode: 'insensitive' } },
          ],
        },
      },
    },
    {
      referent_external_ids: {
        some: { external_id: { contains: search, mode: 'insensitive' } },
      },
    },
  ];
  if (/^\d+$/.test(search)) {
    or.push({ id: BigInt(search) });
  }
  return { OR: or };
}

/** Referent search in the unified cross-entity shape. */
export async function searchReferents(query: string, limit: number): Promise<UnifiedSearchResult[]> {
  const search = query.trim();
  if (search.length < 2) return [];

  const referents = await prisma.referents.findMany({
    where: buildReferentSearchWhere(search),
    take: limit,
    orderBy: { canonical_label: 'asc' },
    select: {
      id: true,
      canonical_label: true,
      concepts: { select: { label: true } },
      referent_aliases: { select: { alias: true }, take: 3 },
    },
  });

  return referents.map(referent => {
    const id = referent.id.toString();
    const aliases = referent.referent_aliases.map(a => a.alias).filter(Boolean);
    return {
      type: 'referent' as const,
      id,
      label: referent.canonical_label || `Referent #${id}`,
      sublabel: aliases.length > 0 ? `aka ${aliases.join(', ')}` : undefined,
      badge: referent.concepts?.label ?? undefined,
      href: `/table/referents?search=${encodeURIComponent(id)}&highlightId=${encodeURIComponent(id)}`,
    };
  });
}
