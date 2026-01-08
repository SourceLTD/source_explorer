/**
 * API Route: /api/changesets/[id]/apply-ai-suggestion
 * 
 * POST - Apply AI-suggested modifications to pending field changes
 */

import { NextRequest, NextResponse } from 'next/server';
import { getChangeset, upsertFieldChange } from '@/lib/version-control';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ApplySuggestionRequest {
  modifications: Record<string, unknown>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const changesetId = BigInt(id);
    const body = await request.json() as ApplySuggestionRequest;
    const { modifications } = body;

    if (!modifications || typeof modifications !== 'object') {
      return NextResponse.json(
        { error: 'modifications object is required' },
        { status: 400 }
      );
    }

    // Fetch the current changeset to get existing field changes
    const changeset = await getChangeset(changesetId);
    if (!changeset) {
      return NextResponse.json(
        { error: 'Changeset not found' },
        { status: 404 }
      );
    }

    // Apply each modification
    const updatedFields: string[] = [];
    for (const [fieldName, newValue] of Object.entries(modifications)) {
      // Find the existing field change to get the old_value
      const existingFieldChange = changeset.field_changes.find(
        fc => fc.field_name === fieldName
      );
      
      // Use the original old_value from the existing field change,
      // or from before_snapshot if this is a new field being modified
      const oldValue = existingFieldChange 
        ? existingFieldChange.old_value 
        : (changeset.before_snapshot as Record<string, unknown> | null)?.[fieldName];

      // Upsert the field change with the AI's suggested value
      await upsertFieldChange(
        changesetId,
        fieldName,
        oldValue,
        newValue
      );
      
      updatedFields.push(fieldName);
    }

    return NextResponse.json({
      success: true,
      updated_fields: updatedFields,
    });
  } catch (error) {
    console.error('Error applying AI suggestion:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to apply suggestion' },
      { status: 500 }
    );
  }
}

