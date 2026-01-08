/**
 * API Route: /api/changesets/[id]
 * 
 * GET - Get a single changeset with field changes
 * PATCH - Update field change statuses (approve/reject individual fields)
 * DELETE - Discard the changeset
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { 
  getChangeset,
  updateFieldChangeStatus,
  approveAllFieldChanges,
  rejectAllFieldChanges,
  discardChangeset,
  FieldChangeStatus,
} from '@/lib/version-control';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/changesets/[id] - Get changeset with field changes
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const changesetId = BigInt(id);

    const changeset = await getChangeset(changesetId);

    if (!changeset) {
      return NextResponse.json(
        { error: 'Changeset not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...changeset,
      id: changeset.id.toString(),
      changegroup_id: changeset.changegroup_id?.toString() ?? null,
      entity_id: changeset.entity_id?.toString() ?? null,
      field_changes: changeset.field_changes.map(fc => ({
        ...fc,
        id: fc.id.toString(),
        changeset_id: fc.changeset_id.toString(),
      })),
    });
  } catch (error) {
    console.error('Error getting changeset:', error);
    return NextResponse.json(
      { error: 'Failed to get changeset' },
      { status: 500 }
    );
  }
}

// PATCH /api/changesets/[id] - Update field change statuses
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const changesetId = BigInt(id);
    const body = await request.json();
    
    const { action, field_change_id, field_changes_updates, user_id } = body;

    // Option 1: Bulk action on all fields
    if (action) {
      if (!['approve_all', 'reject_all'].includes(action)) {
        return NextResponse.json(
          { error: 'action must be "approve_all" or "reject_all"' },
          { status: 400 }
        );
      }
      
      if (!user_id) {
        return NextResponse.json(
          { error: 'user_id is required for approve/reject actions' },
          { status: 400 }
        );
      }

      let count: number;
      if (action === 'approve_all') {
        count = await approveAllFieldChanges(changesetId, user_id);
      } else {
        count = await rejectAllFieldChanges(changesetId, user_id);
      }

      return NextResponse.json({
        success: true,
        field_changes_affected: count,
      });
    }

    // Option 2: Update a single field change
    if (field_change_id) {
      const { status } = body;
      if (!status || !['pending', 'approved', 'rejected'].includes(status)) {
        return NextResponse.json(
          { error: 'status must be "pending", "approved", or "rejected"' },
          { status: 400 }
        );
      }
      
      // user_id is required for approve/reject, optional for pending
      if (status !== 'pending' && !user_id) {
        return NextResponse.json(
          { error: 'user_id is required for approve/reject actions' },
          { status: 400 }
        );
      }

      const updated = await updateFieldChangeStatus(
        BigInt(field_change_id),
        status as FieldChangeStatus,
        user_id
      );

      return NextResponse.json({
        ...updated,
        id: updated.id.toString(),
        changeset_id: updated.changeset_id.toString(),
      });
    }

    // Option 3: Batch update multiple field changes
    if (field_changes_updates && Array.isArray(field_changes_updates)) {
      const results = [];
      for (const update of field_changes_updates) {
        const { id: fcId, status } = update;
        if (fcId && status && ['pending', 'approved', 'rejected'].includes(status)) {
          // user_id is required for approve/reject, optional for pending
          if (status !== 'pending' && !user_id) {
            return NextResponse.json(
              { error: 'user_id is required for approve/reject actions' },
              { status: 400 }
            );
          }
          
          const updated = await updateFieldChangeStatus(
            BigInt(fcId),
            status as FieldChangeStatus,
            user_id
          );
          results.push({
            ...updated,
            id: updated.id.toString(),
            changeset_id: updated.changeset_id.toString(),
          });
        }
      }

      return NextResponse.json({
        success: true,
        updated: results,
      });
    }

    return NextResponse.json(
      { error: 'Must provide action, field_change_id, or field_changes_updates' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error updating changeset:', error);
    return NextResponse.json(
      { error: 'Failed to update changeset' },
      { status: 500 }
    );
  }
}

// DELETE /api/changesets/[id] - Discard the changeset
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const changesetId = BigInt(id);

    await discardChangeset(changesetId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting changeset:', error);
    return NextResponse.json(
      { error: 'Failed to delete changeset' },
      { status: 500 }
    );
  }
}

