import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/frames/[id]/lexical-units
 * Returns ALL lexical units for the specified frame (no limit).
 * Used when copying a frame row to include all relations, not just the sample.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const frameId = BigInt(idParam);

    // Check if frame exists
    const frame = await prisma.frames.findUnique({
      where: { id: frameId },
      select: { id: true },
    });

    if (!frame) {
      return NextResponse.json(
        { error: 'Frame not found' },
        { status: 404 }
      );
    }

    // Fetch lexical units via the sense chain: frame → frame_sense_frames →
    // frame_senses → lexical_unit_senses → lexical_units. Deduplicate by LU id
    // because multiple senses on the frame may reference the same LU.
    const senseFrameLinks = await prisma.frame_sense_frames.findMany({
      where: { frame_id: frameId },
      select: {
        frame_senses: {
          select: {
            lexical_unit_senses: {
              where: { lexical_units: { deleted: false } },
              select: {
                lexical_units: {
                  select: {
                    id: true,
                    code: true,
                    lemmas: true,
                    src_lemmas: true,
                    pos: true,
                    gloss: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const deduped = new Map<string, {
      id: string;
      code: string;
      lemmas: string[];
      src_lemmas: string[];
      pos: string;
      gloss: string;
    }>();
    for (const sfLink of senseFrameLinks) {
      for (const lus of sfLink.frame_senses.lexical_unit_senses) {
        const lu = lus.lexical_units;
        const key = lu.id.toString();
        if (!deduped.has(key)) {
          deduped.set(key, {
            id: key,
            code: lu.code,
            lemmas: lu.lemmas,
            src_lemmas: lu.src_lemmas,
            pos: lu.pos,
            gloss: lu.gloss,
          });
        }
      }
    }

    const serialized = Array.from(deduped.values()).sort((a, b) => a.code.localeCompare(b.code));

    return NextResponse.json({
      entries: serialized,
      totalCount: serialized.length,
    });
  } catch (error) {
    console.error('[API] Error fetching lexical units for frame:', error);
    return NextResponse.json(
      { error: 'Failed to fetch lexical units' },
      { status: 500 }
    );
  }
}
