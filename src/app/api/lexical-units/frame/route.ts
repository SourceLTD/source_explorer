/**
 * Senses-centric bulk "set the frame" for a collection of lexical units.
 *
 * The pre-senses architecture let callers PATCH { frame_id } on many LUs at once.
 * Now that frames are assigned via frame_senses, bulk-setting a frame means
 * rewriting the frame link of each LU's sense(s). This route resolves each
 * selected LU to its sense(s), dedupes, and stages one frame_sense update per
 * sense through the changeset/audit system.
 *
 * Request body:
 *   {
 *     lexical_unit_ids: Array<string | number>,  // LUs to re-point
 *     frame_id: string | number,                  // target frame id
 *   }
 *
 * Response:
 *   {
 *     staged_count: number,            // number of sense changesets staged
 *     affected_sense_ids: string[],    // senses whose frame_id was staged
 *     skipped: Array<{
 *       lexical_unit_id: string,
 *       reason: 'no_senses' | 'multiple_senses' | 'not_found',
 *       detail?: string,
 *     }>,
 *     warnings: Array<{
 *       sense_id: string,
 *       kind: 'shared_sense',
 *       affected_lexical_unit_ids: string[], // LUs on this sense that were NOT in the request
 *     }>,
 *   }
 *
 * Callers that need to attach/detach existing senses or create new ones should
 * still use /api/frame-senses and /api/lexical-units/[id]/senses directly.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stageUpdate } from '@/lib/version-control';
import { getCurrentUserName } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface SkipEntry {
  lexical_unit_id: string;
  reason: 'no_senses' | 'multiple_senses' | 'not_found';
  detail?: string;
}

interface WarningEntry {
  sense_id: string;
  kind: 'shared_sense';
  affected_lexical_unit_ids: string[];
}

function toBigIntSafe(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return BigInt(value.trim());
  return null;
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const rawLuIds = Array.isArray(body.lexical_unit_ids) ? body.lexical_unit_ids : null;
    const rawFrameId = body.frame_id;

    if (!rawLuIds || rawLuIds.length === 0) {
      return NextResponse.json(
        { error: 'lexical_unit_ids is required (non-empty array)' },
        { status: 400 }
      );
    }

    const frameId = toBigIntSafe(rawFrameId);
    if (!frameId) {
      return NextResponse.json(
        { error: 'frame_id is required and must be a numeric id' },
        { status: 400 }
      );
    }

    // Normalise + dedupe input LU ids as BigInts.
    const luIds: bigint[] = [];
    const seenLu = new Set<string>();
    for (const raw of rawLuIds) {
      const b = toBigIntSafe(raw);
      if (!b) continue;
      const key = b.toString();
      if (seenLu.has(key)) continue;
      seenLu.add(key);
      luIds.push(b);
    }

    if (luIds.length === 0) {
      return NextResponse.json(
        { error: 'No valid lexical_unit_ids provided' },
        { status: 400 }
      );
    }

    // Confirm the target frame exists and is not deleted — surface a clean error
    // rather than letting the changeset commit fail later.
    const frame = await prisma.frames.findUnique({
      where: { id: frameId },
      select: { id: true, deleted: true },
    });
    if (!frame || frame.deleted) {
      return NextResponse.json({ error: 'Target frame not found' }, { status: 404 });
    }

    // Map each LU to its senses (ordered for determinism). We don't pre-filter on
    // sense count — we want to count skips accurately in the response.
    const luLinks = await prisma.lexical_unit_senses.findMany({
      where: { lexical_unit_id: { in: luIds } },
      select: { lexical_unit_id: true, frame_sense_id: true },
      orderBy: [{ lexical_unit_id: 'asc' }, { frame_sense_id: 'asc' }],
    });

    const luToSenseIds = new Map<string, number[]>();
    for (const key of luIds) luToSenseIds.set(key.toString(), []);
    for (const link of luLinks) {
      const k = link.lexical_unit_id.toString();
      const arr = luToSenseIds.get(k) ?? [];
      arr.push(link.frame_sense_id);
      luToSenseIds.set(k, arr);
    }

    // Figure out which LUs contribute each sense, and which senses to update.
    const skipped: SkipEntry[] = [];
    const sensesToStage = new Set<number>();

    for (const luId of luIds) {
      const senses = luToSenseIds.get(luId.toString()) ?? [];
      if (senses.length === 0) {
        skipped.push({
          lexical_unit_id: luId.toString(),
          reason: 'no_senses',
          detail:
            'Lexical unit has no senses; create one via POST /api/frame-senses with lexical_unit_ids=[...]',
        });
        continue;
      }
      if (senses.length > 1) {
        skipped.push({
          lexical_unit_id: luId.toString(),
          reason: 'multiple_senses',
          detail:
            'Lexical unit has multiple senses; ambiguous which sense to re-point. ' +
            'Edit the desired sense via PATCH /api/frame-senses/[id] instead.',
        });
        continue;
      }
      sensesToStage.add(senses[0]);
    }

    // For each sense to be updated, flag LUs outside the selection that share it.
    const warnings: WarningEntry[] = [];
    if (sensesToStage.size > 0) {
      const allLinks = await prisma.lexical_unit_senses.findMany({
        where: { frame_sense_id: { in: Array.from(sensesToStage) } },
        select: { frame_sense_id: true, lexical_unit_id: true },
      });
      const senseToLus = new Map<number, string[]>();
      for (const link of allLinks) {
        const existing = senseToLus.get(link.frame_sense_id) ?? [];
        existing.push(link.lexical_unit_id.toString());
        senseToLus.set(link.frame_sense_id, existing);
      }
      for (const senseId of sensesToStage) {
        const lus = senseToLus.get(senseId) ?? [];
        const outsideSelection = lus.filter(id => !seenLu.has(id));
        if (outsideSelection.length > 0) {
          warnings.push({
            sense_id: senseId.toString(),
            kind: 'shared_sense',
            affected_lexical_unit_ids: outsideSelection,
          });
        }
      }
    }

    // Stage one update per sense — stageUpdate will dedupe against any pre-existing
    // pending changeset on the same sense.
    const userId = await getCurrentUserName();
    const affectedSenseIds: string[] = [];
    let stagedCount = 0;
    for (const senseId of sensesToStage) {
      const response = await stageUpdate(
        'frame_sense',
        senseId.toString(),
        { frame_id: frameId.toString() },
        userId
      );
      affectedSenseIds.push(senseId.toString());
      if (response.field_changes_count > 0) stagedCount += 1;
    }

    return NextResponse.json(
      {
        staged_count: stagedCount,
        affected_sense_ids: affectedSenseIds,
        skipped,
        warnings,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
        },
      }
    );
  } catch (error) {
    console.error('[API] PATCH /api/lexical-units/frame failed:', error);
    return NextResponse.json(
      { error: 'Failed to stage bulk frame update' },
      { status: 500 }
    );
  }
}
