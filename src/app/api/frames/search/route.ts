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
        OR: [
          { frame_name: { contains: query, mode: 'insensitive' } },
          { code: { contains: query, mode: 'insensitive' } },
          { framebank_id: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        code: true,
        frame_name: true,
        short_definition: true,
      },
      take: limit,
    });

    const results = frames.map(frame => ({
      id: frame.code,
      code: frame.code,
      frame_name: frame.frame_name,
      gloss: frame.short_definition,
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

