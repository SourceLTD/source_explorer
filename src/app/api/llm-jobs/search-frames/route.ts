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
    const frames = await prisma.frames.findMany({
      where: {
        OR: [
          { code: { contains: searchTerm, mode: 'insensitive' } },
          { frame_name: { contains: searchTerm, mode: 'insensitive' } },
          ...(searchTerm.match(/^\d+$/) ? [{ id: BigInt(searchTerm) }] : []),
        ],
      },
      select: {
        id: true,
        code: true,
        frame_name: true,
      },
      take: limit,
      orderBy: {
        frame_name: 'asc',
      },
    });

    const results = frames.map(frame => ({
      id: frame.code || frame.id.toString(),
      code: frame.code || frame.id.toString(),
      frame_name: frame.frame_name,
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

