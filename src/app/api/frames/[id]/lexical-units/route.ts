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

    // Fetch all lexical units for this frame via junction table (no limit)
    const frameLexicalUnits = await prisma.frame_lexical_units.findMany({
      where: {
        frame_id: frameId,
        lexical_units: {
          deleted: false,
        },
      },
      include: {
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
      orderBy: {
        lexical_units: { code: 'asc' },
      },
    });

    // Extract lexical units from junction table results
    const lexicalUnits = frameLexicalUnits.map(flu => flu.lexical_units);

    // Serialize BigInt ids to strings
    const serialized = lexicalUnits.map((lu) => ({
      ...lu,
      id: lu.id.toString(),
    }));

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
