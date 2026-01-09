/**
 * API Route: /api/field-changes/[id]
 * 
 * DELETE - Delete a single field change (used when reverting to original value)
 */

import { NextRequest, NextResponse } from 'next/server';
import { deleteFieldChange } from '@/lib/version-control';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// DELETE /api/field-changes/[id] - Delete a field change
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const fieldChangeId = BigInt(id);

    const result = await deleteFieldChange(fieldChangeId);

    if (!result.deleted) {
      return NextResponse.json(
        { error: 'Field change not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      changesetDiscarded: result.changesetDiscarded,
    });
  } catch (error) {
    console.error('Error deleting field change:', error);
    return NextResponse.json(
      { error: 'Failed to delete field change' },
      { status: 500 }
    );
  }
}

