import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { JobEntityTypeFilter } from '@/lib/llm/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const targetType = searchParams.get('pos') as JobEntityTypeFilter | null;
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

    // Handle frame-related target types (frames, super_frames, frames_only)
    if (targetType === 'frames' || targetType === 'super_frames' || targetType === 'frames_only') {
      // Build super_frame_id filter based on target type:
      // - super_frames: only frames with no parent (super_frame_id is null)
      // - frames_only: only frames with a parent (super_frame_id is not null)
      // - frames: all frames (no super_frame_id filter)
      const superFrameFilter = targetType === 'super_frames' 
        ? { super_frame_id: null } 
        : targetType === 'frames_only' 
          ? { super_frame_id: { not: null } } 
          : {};

      const frames = await prisma.frames.findMany({
        where: {
          deleted: false,
          ...superFrameFilter,
          ...(exact
            ? { label: { equals: searchTerm, mode: 'insensitive' } }
            : {
                OR: [
                  { label: { contains: searchTerm, mode: 'insensitive' } },
                ],
              }),
        },
        select: { id: true, label: true },
        take: limit,
        orderBy: { label: 'asc' },
      });

      // For frames, return id as the gloss (to match FilterPanel display format)
      results = frames.map(f => ({ code: f.label, gloss: String(f.id) }));
    } else {
      // Lexical unit search:
      // - If targetType === 'lexical_units': search across ALL POS
      // - Else: treat targetType as a specific POS (verb/noun/adjective/adverb)
      const posFilter = targetType === 'lexical_units' ? {} : { pos: targetType as any };
      const entries = await prisma.lexical_units.findMany({
        where: {
          deleted: false,
          ...posFilter,
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

