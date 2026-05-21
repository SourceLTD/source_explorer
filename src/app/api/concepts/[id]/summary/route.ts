import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/frames/[id]/summary
 *
 * Lightweight identity card for a frame, designed to back hover
 * popovers in pending-changes and issue review surfaces. Returns:
 *  - the frame's identity (label, code, type/subtype)
 *  - a short definition (or a definition excerpt fallback)
 *  - the frame's senses (pos, definition, up to 4 lemmas each)
 *
 * Intentionally NOT cached as a Prisma include because the wider
 * `/api/frames/[id]` endpoint is heavy and pulls pending-overlay
 * logic; this one is a tight read with bounded fan-out.
 *
 * NOTE: hierarchy / DAG counts and lexical-unit aggregates were
 * removed from this response on purpose — reviewers found that level
 * of detail noisy in tooltips. If they're needed elsewhere (e.g. the
 * legacy frame detail page), pull them straight from `frame_relations`
 * and `lexical_unit_senses` rather than re-adding them here.
 */
const MAX_LEMMAS_PER_SENSE = 4;
const MAX_SENSES = 6;
const SENSE_DEFINITION_MAX = 240;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idParam } = await params;

    if (!/^\d+$/.test(idParam)) {
      return NextResponse.json({ error: 'Invalid frame id' }, { status: 400 });
    }

    const id = BigInt(idParam);

    const frame = await prisma.frames.findUnique({
      where: { id },
      select: {
        id: true,
        label: true,
        code: true,
        short_definition: true,
        definition: true,
        frame_type: true,
        subtype: true,
        verifiable: true,
        deleted: true,
      },
    });

    if (!frame || frame.deleted) {
      return NextResponse.json({ error: 'Frame not found' }, { status: 404 });
    }

    const senseLinks = await prisma.frame_sense_frames.findMany({
      where: { frame_id: id },
      select: {
        frame_senses: {
          select: {
            id: true,
            pos: true,
            definition: true,
            lemmas: true,
          },
        },
      },
    });

    // Stable order: by pos (alpha) then by id so the popover renders
    // the same list on every fetch. Cap at MAX_SENSES with a count
    // hint so very productive frames don't blow up the tooltip.
    const sensesAll = senseLinks
      .map((link) => link.frame_senses)
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .sort((a, b) => {
        if (a.pos !== b.pos) return a.pos.localeCompare(b.pos);
        return a.id - b.id;
      });

    const senses = sensesAll.slice(0, MAX_SENSES).map((s) => {
      const lemmas = (s.lemmas ?? [])
        .filter((l): l is string => typeof l === 'string' && l.trim().length > 0)
        .map((l) => l.trim())
        .slice(0, MAX_LEMMAS_PER_SENSE);
      const def =
        s.definition.length > SENSE_DEFINITION_MAX
          ? s.definition.slice(0, SENSE_DEFINITION_MAX - 1) + '…'
          : s.definition;
      return {
        id: s.id,
        pos: s.pos,
        definition: def,
        lemmas,
        lemmas_truncated: (s.lemmas?.length ?? 0) > MAX_LEMMAS_PER_SENSE,
      };
    });

    const definitionExcerpt = frame.definition
      ? frame.definition.length > 320
        ? frame.definition.slice(0, 317) + '…'
        : frame.definition
      : null;

    return NextResponse.json(
      {
        id: frame.id.toString(),
        label: frame.label,
        code: frame.code,
        frame_type: frame.frame_type,
        subtype: frame.subtype,
        short_definition: frame.short_definition,
        definition_excerpt: definitionExcerpt,
        verifiable: frame.verifiable,
        senses,
        senses_total: sensesAll.length,
      },
      {
        headers: {
          // Same-session reuse is enough; data is mostly stable but
          // changes can land via commits, so don't pin too long.
          'Cache-Control': 'private, max-age=30',
        },
      },
    );
  } catch (error) {
    console.error('[API] Error fetching frame summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch frame summary' },
      { status: 500 },
    );
  }
}
