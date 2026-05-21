import { NextRequest, NextResponse } from 'next/server';
import { createChangesetFromCreate } from '@/lib/version-control';
import { getCurrentUserName } from '@/utils/supabase/server';

/**
 * POST /api/senses
 * Stages the creation of a new sense via the changeset/audit system.
 * Approval + commit happens through the Pending Changes flow; at commit time
 * commit.ts inserts the row, creates the single sense_concepts link, and
 * optionally attaches the sense to the provided lexical_unit_ids.
 *
 * Body:
 *   {
 *     pos: string,
 *     definition: string,
 *     archetype: string,
 *     concept_id: string | number,                  // required — 1:1 sense:concept
 *     confidence?: string | null,
 *     type_dispute?: string | null,
 *     causative?: boolean | null,
 *     inchoative?: boolean | null,
 *     perspectival?: boolean | null,
 *     lexical_unit_ids?: Array<string | number>,  // optional — attach at commit
 *   }
 *
 * Response: { staged: true, changeset_id, ... }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const pos = typeof body?.pos === 'string' ? body.pos : null;
    const definition = typeof body?.definition === 'string' ? body.definition : null;
    const frameType = typeof body?.archetype === 'string' ? body.archetype : null;
    const frameIdRaw = body?.concept_id;

    if (!pos || !definition || !frameType || frameIdRaw === undefined || frameIdRaw === null) {
      return NextResponse.json(
        { error: 'pos, definition, archetype, and concept_id are required' },
        { status: 400 }
      );
    }

    // Normalise lexical_unit_ids to strings so JSON serialisation is safe.
    const lexicalUnitIds = Array.isArray(body?.lexical_unit_ids)
      ? body.lexical_unit_ids.map((v: unknown) => String(v))
      : [];

    const entityData: Record<string, unknown> = {
      pos,
      definition,
      archetype: frameType,
      concept_id: String(frameIdRaw),
      confidence: body?.confidence ?? null,
      type_dispute: body?.type_dispute ?? null,
      causative: body?.causative ?? null,
      inchoative: body?.inchoative ?? null,
      perspectival: body?.perspectival ?? null,
      lexical_unit_ids: lexicalUnitIds,
    };

    const userId = await getCurrentUserName();
    const changeset = await createChangesetFromCreate('frame_sense', entityData, userId);

    return NextResponse.json(
      {
        staged: true,
        changeset_id: changeset.id.toString(),
        message: 'Sense creation staged for review',
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('[API] POST /api/senses failed:', error);
    return NextResponse.json({ error: 'Failed to stage sense creation' }, { status: 500 });
  }
}
