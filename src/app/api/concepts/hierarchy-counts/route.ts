import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type HierarchyCountRow = {
  rootId: string;
  count: number;
};

type HierarchyCounts = Record<string, number>;

async function getHierarchyCountsUncached(rootIds: string[]): Promise<HierarchyCounts> {
  const rootIdValues = rootIds.map(id => BigInt(id));

  const rows = await prisma.$queryRaw<HierarchyCountRow[]>(Prisma.sql`
    WITH RECURSIVE hierarchy(root_id, concept_id) AS (
      SELECT f.id, f.id
      FROM concepts f
      WHERE f.id IN (${Prisma.join(rootIdValues)})
        AND f.deleted = false

      UNION

      SELECT h.root_id, fr.child_id
      FROM hierarchy h
      JOIN concept_relations fr
        ON fr.parent_id = h.concept_id
        AND fr.type = 'parent_of'::concept_relation_type
      JOIN concepts child
        ON child.id = fr.child_id
        AND child.deleted = false
    )
    SELECT root_id::text AS "rootId", COUNT(*)::int AS count
    FROM hierarchy
    GROUP BY root_id
  `);

  const counts: HierarchyCounts = Object.fromEntries(rootIds.map(id => [id, 0]));
  for (const row of rows) {
    counts[row.rootId] = Number(row.count);
  }

  return counts;
}

const getHierarchyCounts = unstable_cache(
  async (rootIds: string[]) => getHierarchyCountsUncached(rootIds),
  ['concept-hierarchy-counts'],
  { revalidate: 3600, tags: ['concept-hierarchy-counts'] }
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rootIds = searchParams
      .getAll('rootId')
      .flatMap(value => value.split(','))
      .map(value => value.trim())
      .filter(Boolean);

    if (rootIds.length === 0) {
      return NextResponse.json({ counts: {} });
    }

    const uniqueRootIds = Array.from(new Set(rootIds)).sort((a, b) => a.localeCompare(b));
    if (uniqueRootIds.some(id => !/^\d+$/.test(id))) {
      return NextResponse.json(
        { error: 'rootId values must be numeric' },
        { status: 400 }
      );
    }

    const counts = await getHierarchyCounts(uniqueRootIds);

    return NextResponse.json(
      { counts },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching concept hierarchy counts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch concept hierarchy counts' },
      { status: 500 }
    );
  }
}
