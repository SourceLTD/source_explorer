import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/frames/[id]/dag-context
 *
 * Returns the immediate DAG neighborhood for a frame:
 * - The frame itself (label, short_definition)
 * - Its parent_of parents
 * - Its child_of children (siblings under each parent)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const id = BigInt(idParam);

    const frame = await prisma.frames.findUnique({
      where: { id },
      select: {
        id: true,
        label: true,
        short_definition: true,
        deleted: true,
      },
    });

    if (!frame || frame.deleted) {
      return NextResponse.json({ error: 'Frame not found' }, { status: 404 });
    }

    // Parents (frames this frame inherits from) - current frame is target/child
    const parentRels = await prisma.frame_relations.findMany({
      where: { target_id: id, type: 'parent_of' },
      include: {
        frames_frame_relations_source_idToframes: {
          select: { id: true, label: true, short_definition: true },
        },
      },
    });

    // Children (frames that inherit from this frame) - current frame is source/parent
    const childRels = await prisma.frame_relations.findMany({
      where: { source_id: id, type: 'parent_of' },
      include: {
        frames_frame_relations_target_idToframes: {
          select: { id: true, label: true, short_definition: true },
        },
      },
    });

    const parents = parentRels.map(r => ({
      id: r.frames_frame_relations_source_idToframes.id.toString(),
      label: r.frames_frame_relations_source_idToframes.label,
      short_definition: r.frames_frame_relations_source_idToframes.short_definition,
    }));

    const children = childRels.map(r => ({
      id: r.frames_frame_relations_target_idToframes.id.toString(),
      label: r.frames_frame_relations_target_idToframes.label,
      short_definition: r.frames_frame_relations_target_idToframes.short_definition,
    }));

    return NextResponse.json({
      id: frame.id.toString(),
      label: frame.label,
      short_definition: frame.short_definition,
      parents,
      children,
    });
  } catch (error) {
    console.error('[API] Error fetching frame DAG context:', error);
    return NextResponse.json(
      { error: 'Failed to fetch frame DAG context' },
      { status: 500 }
    );
  }
}
