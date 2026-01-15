/**
 * API Route: /api/changesets/[id]/apply-ai-suggestion
 * 
 * POST - Apply AI-suggested modifications to pending field changes
 */

import { NextRequest, NextResponse } from 'next/server';
import { getChangeset, upsertFieldChange, valuesAreEqual } from '@/lib/version-control';

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
    const skippedFields: string[] = [];
    const deletedFields: string[] = [];
    let changesetDiscarded = false;
    
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

      // Skip if the new value equals the original old value (no-op)
      if (valuesAreEqual(oldValue, newValue)) {
        skippedFields.push(fieldName);
        continue;
      }

      // Upsert the field change with the AI's suggested value
      const result = await upsertFieldChange(
        changesetId,
        fieldName,
        oldValue,
        newValue
      );
      
      switch (result.action) {
        case 'created':
        case 'updated':
          updatedFields.push(fieldName);
          break;
        case 'deleted':
          deletedFields.push(fieldName);
          if (result.changesetDiscarded) {
            changesetDiscarded = true;
          }
          break;
        case 'skipped':
          skippedFields.push(fieldName);
          break;
      }
    }

    // Check if all modifications were no-ops
    if (updatedFields.length === 0 && deletedFields.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No actual changes detected - all values are the same as current values',
        updated_fields: [],
        skipped_fields: skippedFields,
        changeset_discarded: changesetDiscarded,
      });
    }

    return NextResponse.json({
      success: true,
      updated_fields: updatedFields,
      skipped_fields: skippedFields,
      deleted_fields: deletedFields,
      changeset_discarded: changesetDiscarded,
    });
  } catch (error) {
    console.error('Error applying AI suggestion:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to apply suggestion' },
      { status: 500 }
    );
  }
}

