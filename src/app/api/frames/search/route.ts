import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 50);

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ results: [] });
    }

    const frames = await prisma.frames.findMany({
      where: {
        label: { contains: query, mode: 'insensitive' },
      },
      select: {
        id: true,
        label: true,
        short_definition: true,
      },
      take: limit,
    });

    const results = frames.map(frame => ({
      id: frame.id.toString(),
      label: frame.label,
      gloss: frame.short_definition,
      pos: 'f',
      lemmas: [],
      src_lemmas: [],
      legacy_id: '',
    }));

    return NextResponse.json(results);
  } catch (error) {
    console.error('[API] Error searching frames:', error);
    return NextResponse.json(
      { error: 'Failed to search frames' },
      { status: 500 }
    );
  }
}

