import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSensesForLexicalUnit } from '@/lib/db/senses';
import { stageSenseAttachment } from '@/lib/version-control';
import { getCurrentUserName } from '@/utils/supabase/server';

async function resolveLexicalUnitId(idOrCode: string): Promise<bigint | null> {
  if (/^\d+$/.test(idOrCode)) return BigInt(idOrCode);
  const lu = await prisma.lexical_units.findUnique({
    where: { code: idOrCode },
    select: { id: true },
  });
  return lu?.id ?? null;
}

/**
 * GET /api/lexical-units/[id]/senses
 * Returns all frame_senses attached to this lexical unit, including each sense's frame(s).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const luId = await resolveLexicalUnitId(id);
    if (luId === null) {
      return NextResponse.json({ error: 'Lexical unit not found' }, { status: 404 });
    }
    const senses = await getSensesForLexicalUnit(luId);
    return NextResponse.json({ senses });
  } catch (error) {
    console.error('[API] GET /api/lexical-units/[id]/senses failed:', error);
    return NextResponse.json({ error: 'Failed to load senses' }, { status: 500 });
  }
}

/**
 * POST /api/lexical-units/[id]/senses
 *
 * Stages an attach of an existing frame_sense to this lexical unit via the
 * changeset/audit system. The link change is recorded as a subfield change
 * (`senses.<senseId>.__exists = true`) on the LU's changeset and applied at
 * commit time.
 *
 * Body: { sense_id: number | string }.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const luId = await resolveLexicalUnitId(id);
    if (luId === null) {
      return NextResponse.json({ error: 'Lexical unit not found' }, { status: 404 });
    }
    const body = await request.json().catch(() => null);
    const rawSenseId = body?.sense_id;
    const senseId = Number(rawSenseId);
    if (!Number.isFinite(senseId) || !Number.isInteger(senseId)) {
      return NextResponse.json({ error: 'sense_id is required' }, { status: 400 });
    }

    // Defensive: ensure the sense exists before staging, so we surface a 404
    // rather than blowing up at commit time.
    const senseExists = await prisma.frame_senses.findUnique({
      where: { id: senseId },
      select: { id: true },
    });
    if (!senseExists) {
      return NextResponse.json({ error: 'Frame sense not found' }, { status: 404 });
    }

    const userId = await getCurrentUserName();
    const response = await stageSenseAttachment(String(luId), senseId, true, userId);

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[API] POST /api/lexical-units/[id]/senses failed:', error);
    return NextResponse.json({ error: 'Failed to stage sense attachment' }, { status: 500 });
  }
}

/**
 * DELETE /api/lexical-units/[id]/senses?sense_id=N
 *
 * Stages a detach of `sense_id` from this lexical unit via the changeset/audit
 * system (`senses.<senseId>.__exists = false`).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const luId = await resolveLexicalUnitId(id);
    if (luId === null) {
      return NextResponse.json({ error: 'Lexical unit not found' }, { status: 404 });
    }
    const { searchParams } = new URL(request.url);
    const senseId = Number(searchParams.get('sense_id'));
    if (!Number.isFinite(senseId) || !Number.isInteger(senseId)) {
      return NextResponse.json({ error: 'sense_id is required' }, { status: 400 });
    }

    const userId = await getCurrentUserName();
    const response = await stageSenseAttachment(String(luId), senseId, false, userId);

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[API] DELETE /api/lexical-units/[id]/senses failed:', error);
    return NextResponse.json({ error: 'Failed to stage sense detachment' }, { status: 500 });
  }
}
