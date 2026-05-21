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
    WITH RECURSIVE hierarchy(root_id, frame_id) AS (
      SELECT f.id, f.id
      FROM frames f
      WHERE f.id IN (${Prisma.join(rootIdValues)})
        AND f.deleted = false

      UNION

      SELECT h.root_id, fr.target_id
      FROM hierarchy h
      JOIN frame_relations fr
        ON fr.source_id = h.frame_id
        AND fr.type = 'parent_of'::frame_relation_type
      JOIN frames child
        ON child.id = fr.target_id
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
  ['frame-hierarchy-counts'],
  { revalidate: 3600, tags: ['frame-hierarchy-counts'] }
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
    console.error('Error fetching frame hierarchy counts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch frame hierarchy counts' },
      { status: 500 }
    );
  }
}
