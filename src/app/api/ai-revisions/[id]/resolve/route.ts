/**
 * API Route: /api/ai-revisions/[id]/resolve
 * 
 * POST - Resolve an AI revision by accepting or rejecting suggested changes
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getChangeset, upsertFieldChange, valuesAreEqual } from '@/lib/version-control';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ResolveRequest {
  /** Fields to accept (apply to the changeset) */
  accepted_fields: string[];
  /** Fields to reject (do not apply) */
  rejected_fields: string[];
}

interface ModificationItem {
  field: string;
  old_value: unknown;
  new_value: unknown;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const revisionId = BigInt(id);
    const body = await request.json() as ResolveRequest;
    const { accepted_fields = [], rejected_fields = [] } = body;

    // Fetch the AI revision
    const revision = await prisma.ai_revisions.findUnique({
      where: { id: revisionId },
      include: {
        changesets: true,
      },
    });

    if (!revision) {
      return NextResponse.json(
        { error: 'AI revision not found' },
        { status: 404 }
      );
    }

    if (revision.status !== 'pending') {
      return NextResponse.json(
        { error: 'AI revision has already been resolved' },
        { status: 400 }
      );
    }

    // Get the changeset to apply modifications
    const changeset = await getChangeset(revision.changeset_id);
    if (!changeset) {
      return NextResponse.json(
        { error: 'Associated changeset not found' },
        { status: 404 }
      );
    }

    // Parse modifications from the revision
    const modifications = (revision.modifications as ModificationItem[] | null) ?? [];
    
    // Apply accepted fields
    const appliedFields: string[] = [];
    const skippedFields: string[] = [];
    let changesetDiscarded = false;
    
    for (const fieldName of accepted_fields) {
      const mod = modifications.find(m => m.field === fieldName);
      if (mod) {
        // Find the original old_value from the changeset
        const existingFieldChange = changeset.field_changes.find(
          fc => fc.field_name === fieldName
        );
        const originalOldValue = existingFieldChange 
          ? existingFieldChange.old_value 
          : (changeset.before_snapshot as Record<string, unknown> | null)?.[fieldName];

        // Skip if the new value equals the original old value (no-op)
        if (valuesAreEqual(originalOldValue, mod.new_value)) {
          skippedFields.push(fieldName);
          continue;
        }

        // Upsert the field change with the AI's suggested value
        const result = await upsertFieldChange(
          revision.changeset_id,
          fieldName,
          originalOldValue,
          mod.new_value
        );
        
        if (result.action === 'skipped') {
          skippedFields.push(fieldName);
        } else if (result.changesetDiscarded) {
          changesetDiscarded = true;
        } else {
          appliedFields.push(fieldName);
        }
      }
    }

    // Determine the final status
    const totalFields = modifications.length;
    const acceptedCount = accepted_fields.length;
    const rejectedCount = rejected_fields.length;
    
    let finalStatus: 'accepted' | 'rejected' | 'partial';
    if (acceptedCount === totalFields && totalFields > 0) {
      finalStatus = 'accepted';
    } else if (rejectedCount === totalFields || acceptedCount === 0) {
      finalStatus = 'rejected';
    } else {
      finalStatus = 'partial';
    }

    // Update the revision status
    await prisma.ai_revisions.update({
      where: { id: revisionId },
      data: {
        status: finalStatus,
        accepted_fields: accepted_fields,
        rejected_fields: rejected_fields,
        resolved_at: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      status: finalStatus,
      applied_fields: appliedFields,
      skipped_fields: skippedFields,
      accepted_count: acceptedCount,
      rejected_count: rejectedCount,
      changeset_discarded: changesetDiscarded,
    });
  } catch (error) {
    console.error('Error resolving AI revision:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to resolve AI revision' },
      { status: 500 }
    );
  }
}
