import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { JobTargetType } from '@/lib/llm/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const targetType = searchParams.get('pos') as JobTargetType | null;
  const limitParam = searchParams.get('limit');
  const exact = searchParams.get('exact') === 'true';
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10), 1), 50) : 20;

  if (!query || query.trim().length === 0) {
    return NextResponse.json({ results: [] });
  }

  const searchTerm = query.trim().toLowerCase();

  try {
    let results: Array<{ code: string; gloss: string }> = [];

    if (!targetType) {
      return NextResponse.json({ results: [] });
    }

    if (targetType === 'frames') {
      const frames = await prisma.frames.findMany({
        where: {
          deleted: false,
          ...(exact
            ? { label: { equals: searchTerm, mode: 'insensitive' } }
            : {
                OR: [
                  { label: { contains: searchTerm, mode: 'insensitive' } },
                  { definition: { contains: searchTerm, mode: 'insensitive' } },
                ],
              }),
        },
        select: { label: true, definition: true },
        take: limit,
        orderBy: { label: 'asc' },
      });

      results = frames.map(f => ({ code: f.label, gloss: f.definition ?? '' }));
    } else {
      const entries = await prisma.lexical_units.findMany({
        where: {
          deleted: false,
          pos: targetType as any,
          AND: [
            exact
              ? { code: { equals: searchTerm, mode: 'insensitive' } }
              : {
                  OR: [
                    { code: { contains: searchTerm, mode: 'insensitive' } },
                    { gloss: { contains: searchTerm, mode: 'insensitive' } },
                  ],
                },
          ],
        },
        select: { code: true, gloss: true },
        take: limit,
        orderBy: { code: 'asc' },
      });

      results = entries.map(e => ({ code: e.code, gloss: e.gloss }));
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('[LLM] Failed to search IDs:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to search IDs' },
      { status: 500 }
    );
  }
}

