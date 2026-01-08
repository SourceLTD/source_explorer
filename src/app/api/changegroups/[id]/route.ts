/**
 * API Route: /api/changegroups/[id]
 * 
 * GET - Get a single changegroup with its changesets
 * PATCH - Update changegroup (approve/reject all changesets)
 * DELETE - Discard the changegroup
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { 
  approveAllFieldChanges, 
  rejectAllFieldChanges,
  discardChangegroup,
} from '@/lib/version-control';
import { getCurrentUserName } from '@/utils/supabase/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/changegroups/[id] - Get changegroup with changesets
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const changegroupId = BigInt(id);

    const changegroup = await prisma.changegroups.findUnique({
      where: { id: changegroupId },
      include: {
        llm_jobs: {
          select: {
            id: true,
            label: true,
            status: true,
          },
        },
        changesets: {
          orderBy: { created_at: 'desc' },
          include: {
            field_changes: true,
          },
        },
      },
    });

    if (!changegroup) {
      return NextResponse.json(
        { error: 'Changegroup not found' },
        { status: 404 }
      );
    }

    // Convert BigInt to string for JSON serialization
    return NextResponse.json({
      ...changegroup,
      id: changegroup.id.toString(),
      llm_job_id: changegroup.llm_job_id?.toString() ?? null,
      changesets: changegroup.changesets.map(cs => ({
        ...cs,
        id: cs.id.toString(),
        changegroup_id: cs.changegroup_id?.toString() ?? null,
        entity_id: cs.entity_id?.toString() ?? null,
        field_changes: cs.field_changes.map(fc => ({
          ...fc,
          id: fc.id.toString(),
          changeset_id: fc.changeset_id.toString(),
        })),
      })),
    });
  } catch (error) {
    console.error('Error getting changegroup:', error);
    return NextResponse.json(
      { error: 'Failed to get changegroup' },
      { status: 500 }
    );
  }
}

// PATCH /api/changegroups/[id] - Update changegroup (approve/reject all)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const changegroupId = BigInt(id);
    const body = await request.json();
    
    const { action } = body;
    const userId = await getCurrentUserName();

    if (!action || !['approve_all', 'reject_all'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "approve_all" or "reject_all"' },
        { status: 400 }
      );
    }

    // Get all changesets in this group
    const changesets = await prisma.changesets.findMany({
      where: { 
        changegroup_id: changegroupId,
        status: 'pending',
      },
      select: { id: true },
    });

    // Apply action to all changesets
    let totalAffected = 0;
    for (const cs of changesets) {
      if (action === 'approve_all') {
        totalAffected += await approveAllFieldChanges(cs.id, userId);
      } else {
        totalAffected += await rejectAllFieldChanges(cs.id, userId);
      }
    }

    return NextResponse.json({
      success: true,
      changesets_affected: changesets.length,
      field_changes_affected: totalAffected,
    });
  } catch (error) {
    console.error('Error updating changegroup:', error);
    return NextResponse.json(
      { error: 'Failed to update changegroup' },
      { status: 500 }
    );
  }
}

// DELETE /api/changegroups/[id] - Discard the changegroup
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const changegroupId = BigInt(id);

    await discardChangegroup(changegroupId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting changegroup:', error);
    return NextResponse.json(
      { error: 'Failed to delete changegroup' },
      { status: 500 }
    );
  }
}

