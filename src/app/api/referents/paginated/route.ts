import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/referents/paginated
 *
 * Paginated listing of referents (stable named entities sitting between
 * concepts and claims) for tabular exploration. Each row returns the referent's
 * scalar fields, its type concept, its knowledge graph, and its aliases and
 * external ids from the child tables.
 *
 * Query params:
 *   - page (default 1)
 *   - limit (default 100, max 2000)
 *   - search: matched against referent id, canonical_label, aliases, and
 *     external ids
 *   - sortBy: one of id | canonical_label | createdAt | updatedAt
 *   - sortOrder: asc | desc
 */

const VALID_SORT_FIELDS: Record<string, keyof Prisma.referentsOrderByWithRelationInput> = {
  id: 'id',
  canonical_label: 'canonical_label',
  createdAt: 'created_at',
  created_at: 'created_at',
  updatedAt: 'updated_at',
  updated_at: 'updated_at',
};

function toEndOfDay(value: string): Date {
  return new Date(`${value}T23:59:59.999Z`);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const pageParam = parseInt(searchParams.get('page') || '1', 10);
    const limitParam = parseInt(searchParams.get('limit') || '100', 10);
    const page = Number.isFinite(pageParam) && pageParam >= 1 ? pageParam : 1;
    const limit =
      Number.isFinite(limitParam) && limitParam >= 1 && limitParam <= 2000
        ? limitParam
        : 100;
    const skip = (page - 1) * limit;

    const rawSortBy = searchParams.get('sortBy') || 'id';
    const sortBy = VALID_SORT_FIELDS[rawSortBy];
    if (!sortBy) {
      return NextResponse.json(
        { error: `Invalid sortBy column: ${rawSortBy}` },
        { status: 400 }
      );
    }
    const sortOrder = searchParams.get('sortOrder') === 'desc' ? 'desc' : 'asc';

    const search = searchParams.get('search')?.trim() || '';
    const createdAfter = searchParams.get('createdAfter')?.trim() || '';
    const createdBefore = searchParams.get('createdBefore')?.trim() || '';
    const updatedAfter = searchParams.get('updatedAfter')?.trim() || '';
    const updatedBefore = searchParams.get('updatedBefore')?.trim() || '';

    const and: Prisma.referentsWhereInput[] = [];

    if (search) {
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
      and.push({ OR: or });
    }

    if (createdAfter) {
      and.push({ created_at: { gte: new Date(createdAfter) } });
    }
    if (createdBefore) {
      and.push({ created_at: { lte: toEndOfDay(createdBefore) } });
    }
    if (updatedAfter) {
      and.push({ updated_at: { gte: new Date(updatedAfter) } });
    }
    if (updatedBefore) {
      and.push({ updated_at: { lte: toEndOfDay(updatedBefore) } });
    }

    const where: Prisma.referentsWhereInput = and.length > 0 ? { AND: and } : {};

    const [totalCount, referents] = await Promise.all([
      prisma.referents.count({ where }),
      prisma.referents.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ [sortBy]: sortOrder }, { id: sortOrder }],
        include: {
          concepts: { select: { id: true, label: true, code: true } },
          knowledge_graphs: { select: { id: true, label: true } },
          referent_aliases: {
            select: { alias: true },
            orderBy: { alias: 'asc' },
          },
          referent_external_ids: {
            select: { vocabulary: true, external_id: true },
            orderBy: [{ vocabulary: 'asc' }, { external_id: 'asc' }],
          },
        },
      }),
    ]);

    const data = referents.map(referent => ({
      id: referent.id.toString(),
      canonical_label: referent.canonical_label,
      type_concept: referent.concepts
        ? {
            id: referent.concepts.id.toString(),
            label: referent.concepts.label,
            code: referent.concepts.code,
          }
        : null,
      knowledge_graph: referent.knowledge_graphs
        ? {
            id: referent.knowledge_graphs.id.toString(),
            label: referent.knowledge_graphs.label,
          }
        : null,
      aliases: referent.referent_aliases.map(a => a.alias),
      external_ids: referent.referent_external_ids.map(e => ({
        vocabulary: e.vocabulary,
        external_id: e.external_id,
      })),
      metadata: (referent.metadata ?? null) as Record<string, unknown> | null,
      createdAt: referent.created_at?.toISOString() ?? null,
      updatedAt: referent.updated_at?.toISOString() ?? null,
    }));

    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      data,
      total: totalCount,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    });
  } catch (error) {
    console.error('[API] GET /api/referents/paginated failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch referents' },
      { status: 500 }
    );
  }
}
