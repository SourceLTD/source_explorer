import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RouteParams {
  params: Promise<{ id: string }>;
}

const ROOT_FRAME_IDS = new Set([257982n, 257983n, 257984n, 257985n, 257773n, 85483n]);

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: idParam } = await params;

  try {
    const startId = BigInt(idParam);
    const { searchParams } = new URL(request.url);
    const invalidateCache = searchParams.has('t');

    const path: Array<{ id: string; label: string; short_definition: string | null }> = [];
    let currentId: bigint | null = startId;
    const seen = new Set<string>();

    while (currentId) {
      if (seen.has(currentId.toString())) break;
      seen.add(currentId.toString());

      const frame = await prisma.frames.findUnique({
        where: { id: currentId },
        select: { id: true, label: true, short_definition: true, deleted: true },
      });

      if (!frame || frame.deleted) break;

      path.push({
        id: frame.id.toString(),
        label: frame.label,
        short_definition: frame.short_definition,
      });

      if (ROOT_FRAME_IDS.has(frame.id)) break;

      const parentRel: { source_id: bigint } | null = await prisma.frame_relations.findFirst({
        where: { target_id: currentId, type: 'parent_of' },
        select: { source_id: true },
      });

      currentId = parentRel?.source_id ?? null;
    }

    path.reverse();

    const breadcrumbs = path.map(f => ({
      id: f.id,
      legacy_id: f.id,
      lemma: f.label,
      gloss: f.short_definition || '',
    }));

    const cacheHeaders: Record<string, string> = invalidateCache
      ? { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Pragma': 'no-cache', 'Expires': '0' }
      : { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' };

    return NextResponse.json(breadcrumbs, { headers: cacheHeaders });
  } catch (error) {
    console.error('Error fetching frame breadcrumbs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
