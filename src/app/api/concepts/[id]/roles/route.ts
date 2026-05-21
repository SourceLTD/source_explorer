import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stagePropertiesUpdate } from '@/lib/version-control';
import { getCurrentUserName } from '@/utils/supabase/server';
import { sortRolesByPrecedence } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/concepts/[id]/roles
 *
 * Lightweight properties list for a concept, designed to back the property
 * Before/After panel in the pending-changes inbox. Returns the parent
 * concept's identity (so the panel header can render without a second
 * round-trip to `/summary`) and an ordered, precedence-sorted list of
 * the concept's properties with the editable user-facing fields.
 *
 * Intentionally separate from `/api/concepts/[id]/route.ts` (which is
 * the heavy editor payload that also bakes in pending overlays); this
 * one is a tight read with bounded fan-out and short-lived cache.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idParam } = await params;

    if (!/^\d+$/.test(idParam)) {
      return NextResponse.json({ error: 'Invalid concept id' }, { status: 400 });
    }

    const id = BigInt(idParam);

    const frame = await prisma.concepts.findUnique({
      where: { id },
      select: {
        id: true,
        label: true,
        code: true,
        archetype: true,
        deleted: true,
      },
    });

    if (!frame || frame.deleted) {
      return NextResponse.json({ error: 'Concept not found' }, { status: 404 });
    }

    const rolesRaw = await prisma.properties.findMany({
      where: { concept_id: id },
      select: {
        id: true,
        label: true,
        description: true,
        notes: true,
        main: true,
        examples: true,
      },
    });

    const roles = sortRolesByPrecedence(
      rolesRaw.map((r) => ({
        id: r.id.toString(),
        label: r.label,
        description: r.description,
        notes: r.notes,
        main: Boolean(r.main),
        examples: Array.isArray(r.examples)
          ? r.examples.filter((x): x is string => typeof x === 'string')
          : [],
      })),
    );

    return NextResponse.json(
      {
        id: frame.id.toString(),
        label: frame.label,
        code: frame.code,
        archetype: frame.archetype,
        roles,
      },
      {
        headers: {
          // Same-session reuse only — role edits are committed via
          // changesets that the inbox already polls for, so a short
          // window keeps the panel snappy without showing stale data.
          'Cache-Control': 'private, max-age=30',
        },
      },
    );
  } catch (error) {
    console.error('[API] Error fetching concept properties:', error);
    return NextResponse.json(
      { error: 'Failed to fetch concept properties' },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const frameId = BigInt(idParam);
    const body = await request.json();
    
    const { roles } = body;

    if (!Array.isArray(roles)) {
      return NextResponse.json(
        { error: 'roles must be an array' },
        { status: 400 }
      );
    }

    // Check if concept exists
    const existingFrame = await prisma.concepts.findUnique({
      where: { id: frameId },
    });

    if (!existingFrame) {
      return NextResponse.json(
        { error: 'Concept not found' },
        { status: 404 }
      );
    }

    const userId = await getCurrentUserName();

    const response = await stagePropertiesUpdate(idParam, roles, userId);

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[API] Error staging concept properties update:', error);
    return NextResponse.json(
      { error: 'Failed to stage concept properties update' },
      { status: 500 }
    );
  }
}
