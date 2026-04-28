import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getFrameSenseById } from '@/lib/db/senses';
import { stageUpdate, stageDelete } from '@/lib/version-control';
import { getCurrentUserName } from '@/utils/supabase/server';

function parseSenseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const senseId = parseSenseId(id);
    if (senseId === null) {
      return NextResponse.json({ error: 'Invalid sense id' }, { status: 400 });
    }
    const sense = await getFrameSenseById(senseId);
    if (!sense) {
      return NextResponse.json({ error: 'Sense not found' }, { status: 404 });
    }
    return NextResponse.json(sense);
  } catch (error) {
    console.error('[API] GET /api/frame-senses/[id] failed:', error);
    return NextResponse.json({ error: 'Failed to load sense' }, { status: 500 });
  }
}

/**
 * PATCH /api/frame-senses/[id]
 *
 * Stages an update to a frame_sense via the changeset/audit system.
 *
 * Body: any subset of { pos, definition, frame_type, confidence, type_dispute,
 *   causative, inchoative, perspectival, frame_id }.
 *
 * When `frame_id` is provided, it is staged as a field change and applied at
 * commit time by rewriting the single frame_sense_frames link (the 1:1 invariant
 * is enforced in commit.ts).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const senseId = parseSenseId(id);
    if (senseId === null) {
      return NextResponse.json({ error: 'Invalid sense id' }, { status: 400 });
    }

    // Confirm the sense exists before staging (fetchEntityByCode in stage.ts also
    // validates, but returning a clean 404 from here is nicer than a 500 from staging).
    const exists = await prisma.frame_senses.findUnique({
      where: { id: senseId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ error: 'Sense not found' }, { status: 404 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    for (const key of [
      'pos',
      'definition',
      'frame_type',
      'confidence',
      'type_dispute',
      'causative',
      'inchoative',
      'perspectival',
    ]) {
      if (key in body) updates[key] = body[key];
    }
    if ('frame_id' in body) {
      // A sense must anchor to exactly one frame — null/empty is not a valid
      // re-parent target and would fail at commit with a cryptic error. Reject here.
      if (body.frame_id === null || body.frame_id === undefined || body.frame_id === '') {
        return NextResponse.json(
          { error: 'frame_id must be a valid frame id; detaching a sense from all frames is not supported' },
          { status: 400 }
        );
      }
      // Pass as string — commit.ts coerces to BigInt via toBigIntSafe.
      updates.frame_id = String(body.frame_id);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const userId = await getCurrentUserName();
    const response = await stageUpdate('frame_sense', String(senseId), updates, userId);

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[API] PATCH /api/frame-senses/[id] failed:', error);
    return NextResponse.json({ error: 'Failed to stage sense update' }, { status: 500 });
  }
}

/**
 * DELETE /api/frame-senses/[id]
 * Stages a delete of the frame_sense. Commit time hard-deletes the sense along
 * with its frame_sense_frames and lexical_unit_senses rows.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const senseId = parseSenseId(id);
    if (senseId === null) {
      return NextResponse.json({ error: 'Invalid sense id' }, { status: 400 });
    }

    const exists = await prisma.frame_senses.findUnique({
      where: { id: senseId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json({ error: 'Sense not found' }, { status: 404 });
    }

    const userId = await getCurrentUserName();
    const response = await stageDelete('frame_sense', String(senseId), userId);

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[API] DELETE /api/frame-senses/[id] failed:', error);
    return NextResponse.json({ error: 'Failed to stage sense deletion' }, { status: 500 });
  }
}
