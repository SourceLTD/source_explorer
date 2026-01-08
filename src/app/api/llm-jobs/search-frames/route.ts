import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10), 1), 50) : 20;

  if (!query || query.trim().length === 0) {
    return NextResponse.json({ results: [] });
  }

  const searchTerm = query.trim().toLowerCase();

  try {
    // Only search by label or numeric id (not framebank_id or code)
    const frames = await prisma.frames.findMany({
      where: {
        OR: [
          { label: { contains: searchTerm, mode: 'insensitive' } },
          ...(searchTerm.match(/^\d+$/) ? [{ id: BigInt(searchTerm) }] : []),
        ],
      },
      select: {
        id: true,
        label: true,
      },
      take: limit,
      orderBy: {
        label: 'asc',
      },
    });

    const results = frames.map(frame => ({
      id: frame.id.toString(),
      label: frame.label,
      pos: 'f',
      gloss: '', // Basic search doesn't include definition here
      lemmas: [],
      src_lemmas: [],
      legacy_id: '',
    }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error('[LLM] Failed to search frames:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to search frames' },
      { status: 500 }
    );
  }
}

