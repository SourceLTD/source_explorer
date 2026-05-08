import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/frames/[id]/dag-context
 *
 * Returns the immediate DAG neighborhood for a frame:
 * - The frame itself (label, short_definition, definition_excerpt)
 * - Its parent_of parents
 * - Its child_of children (siblings under each parent)
 *
 * Both `short_definition` (curated, may be null) and a derived
 * `definition_excerpt` (the first sentence of the long definition)
 * are returned so callers can fall back to whichever exists. Many
 * frames have a long `definition` but no `short_definition`, and
 * the visualization needs *something* to show alongside the label.
 */

/**
 * Extract the first sentence from a definition.
 *
 * Heuristic: match up to the first sentence terminator (.!?) that
 * is followed by either whitespace + an uppercase letter or the
 * end of the string. This skips over common abbreviations like
 * "e.g." or "i.e." that are followed by a lowercase word.
 *
 * Falls back to the whole trimmed string when no clear sentence
 * boundary is found — better to return everything than to chop a
 * word in half with an ellipsis.
 */
function firstSentence(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^[\s\S]+?[.!?](?=\s+[A-Z(]|$)/);
  if (match) return match[0].trim();
  return trimmed;
}

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
        definition: true,
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
          select: { id: true, label: true, short_definition: true, definition: true },
        },
      },
    });

    // Children (frames that inherit from this frame) - current frame is source/parent
    const childRels = await prisma.frame_relations.findMany({
      where: { source_id: id, type: 'parent_of' },
      include: {
        frames_frame_relations_target_idToframes: {
          select: { id: true, label: true, short_definition: true, definition: true },
        },
      },
    });

    const parents = parentRels.map(r => {
      const f = r.frames_frame_relations_source_idToframes;
      return {
        id: f.id.toString(),
        label: f.label,
        short_definition: f.short_definition,
        definition_excerpt: firstSentence(f.definition),
      };
    });

    const children = childRels.map(r => {
      const f = r.frames_frame_relations_target_idToframes;
      return {
        id: f.id.toString(),
        label: f.label,
        short_definition: f.short_definition,
        definition_excerpt: firstSentence(f.definition),
      };
    });

    return NextResponse.json({
      id: frame.id.toString(),
      label: frame.label,
      short_definition: frame.short_definition,
      definition_excerpt: firstSentence(frame.definition),
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
