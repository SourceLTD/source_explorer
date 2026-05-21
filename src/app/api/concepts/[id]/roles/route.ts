import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stageFrameRolesUpdate } from '@/lib/version-control';
import { getCurrentUserName } from '@/utils/supabase/server';
import { sortRolesByPrecedence } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/frames/[id]/roles
 *
 * Lightweight roles list for a frame, designed to back the frame-role
 * Before/After panel in the pending-changes inbox. Returns the parent
 * frame's identity (so the panel header can render without a second
 * round-trip to `/summary`) and an ordered, precedence-sorted list of
 * the frame's roles with the editable user-facing fields.
 *
 * Intentionally separate from `/api/frames/[id]/route.ts` (which is
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
      return NextResponse.json({ error: 'Invalid frame id' }, { status: 400 });
    }

    const id = BigInt(idParam);

    const frame = await prisma.frames.findUnique({
      where: { id },
      select: {
        id: true,
        label: true,
        code: true,
        frame_type: true,
        deleted: true,
      },
    });

    if (!frame || frame.deleted) {
      return NextResponse.json({ error: 'Frame not found' }, { status: 404 });
    }

    const rolesRaw = await prisma.frame_roles.findMany({
      where: { frame_id: id },
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
        frame_type: frame.frame_type,
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
    console.error('[API] Error fetching frame roles:', error);
    return NextResponse.json(
      { error: 'Failed to fetch frame roles' },
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

    // Check if frame exists
    const existingFrame = await prisma.frames.findUnique({
      where: { id: frameId },
    });

    if (!existingFrame) {
      return NextResponse.json(
        { error: 'Frame not found' },
        { status: 404 }
      );
    }

    const userId = await getCurrentUserName();

    const response = await stageFrameRolesUpdate(idParam, roles, userId);

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[API] Error staging frame roles update:', error);
    return NextResponse.json(
      { error: 'Failed to stage frame roles update' },
      { status: 500 }
    );
  }
}
