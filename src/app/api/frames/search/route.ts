import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type FrameCandidate = {
  id: bigint;
  label: string;
  definition: string | null;
  short_definition: string | null;
  frame_type: string | null;
};

type ScoredFrame = {
  frame: FrameCandidate;
  score: number;
  matchPosition: number;
};

/**
 * Score a frame's relevance against the normalized lowercase query.
 *
 * Higher scores rank first. Buckets are spaced so that a better bucket
 * always beats a worse one regardless of the tie-breakers below. Ties
 * are then broken by `matchPosition` (earlier match wins) and by
 * shorter label length.
 */
function scoreFrame(frame: FrameCandidate, q: string): ScoredFrame | null {
  const label = frame.label ?? '';
  const labelLower = label.toLowerCase();
  const definition = (frame.definition ?? '').toLowerCase();
  const shortDefinition = (frame.short_definition ?? '').toLowerCase();

  // Split on anything non-alphanumeric so "controlled-anger" and
  // "controlled_anger" both yield ["controlled", "anger"].
  const tokens = labelLower.split(/[^a-z0-9]+/i).filter(Boolean);

  let score = 0;
  let matchPosition = Number.MAX_SAFE_INTEGER;

  if (labelLower === q) {
    score = 1000;
    matchPosition = 0;
  } else if (labelLower.startsWith(q)) {
    score = 500;
    matchPosition = 0;
  } else if (tokens.some(token => token.startsWith(q))) {
    score = 300;
    // Position of the first token that starts with q.
    let idx = 0;
    for (const token of tokens) {
      if (token.startsWith(q)) {
        matchPosition = idx;
        break;
      }
      idx += token.length + 1;
    }
  } else {
    const substringIdx = labelLower.indexOf(q);
    if (substringIdx >= 0) {
      // Prefer matches that sit on a word boundary, e.g. "controlled anger"
      // should still beat "ranger" even though neither starts with q.
      const prevChar = substringIdx > 0 ? labelLower[substringIdx - 1] : '';
      const onWordBoundary = substringIdx === 0 || /[^a-z0-9]/i.test(prevChar);
      score = onWordBoundary ? 150 : 50;
      matchPosition = substringIdx;
    } else if (definition.includes(q) || shortDefinition.includes(q)) {
      score = 10;
      matchPosition = Math.min(
        definition.indexOf(q) >= 0 ? definition.indexOf(q) : Number.MAX_SAFE_INTEGER,
        shortDefinition.indexOf(q) >= 0 ? shortDefinition.indexOf(q) : Number.MAX_SAFE_INTEGER,
      );
    } else {
      return null;
    }
  }

  return { frame, score, matchPosition };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 50);

    if (!query || query.trim().length < 2) {
      return NextResponse.json([]);
    }

    const q = query.trim().toLowerCase();

    // Fetch a larger candidate pool so ranking has meaningful choices.
    // Cap at a reasonable ceiling to protect the DB.
    const candidatePoolSize = Math.min(Math.max(limit * 4, 100), 300);

    const frames = await prisma.frames.findMany({
      where: {
        deleted: false,
        OR: [
          { label: { contains: q, mode: 'insensitive' } },
          { definition: { contains: q, mode: 'insensitive' } },
          { short_definition: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        label: true,
        definition: true,
        short_definition: true,
        frame_type: true,
      },
      take: candidatePoolSize,
    });

    const scored = frames
      .map(frame => scoreFrame(frame, q))
      .filter((item): item is ScoredFrame => item !== null);

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.matchPosition !== b.matchPosition) return a.matchPosition - b.matchPosition;
      if (a.frame.label.length !== b.frame.label.length) {
        return a.frame.label.length - b.frame.label.length;
      }
      return a.frame.label.localeCompare(b.frame.label);
    });

    const results = scored.slice(0, limit).map(({ frame }) => ({
      id: frame.id.toString(),
      label: frame.label,
      gloss: frame.short_definition || frame.definition || '',
      pos: 'f',
      lemmas: [],
      src_lemmas: [],
      legacy_id: '',
      frameDefinition: frame.definition || frame.short_definition || '',
      frameType: frame.frame_type,
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
