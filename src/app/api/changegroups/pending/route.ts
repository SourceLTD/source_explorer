/**
 * API Route: /api/changegroups/pending
 * 
 * GET - Get all pending changegroups with their changesets and field changes,
 *       plus any ungrouped pending changesets
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Helper to serialize BigInt values
function serializeBigInt(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInt(value);
    }
    return result;
  }
  return obj;
}

// Helper to check if a changeset is non-empty
// UPDATE operations need field_changes, CREATE/DELETE use snapshots
function isNonEmptyChangeset(changeset: { operation: string; field_changes: unknown[] }): boolean {
  if (changeset.operation === 'update') {
    return changeset.field_changes.length > 0;
  }
  // CREATE and DELETE operations don't use field_changes
  return true;
}

// GET /api/changegroups/pending - Get all pending changes for review
export async function GET(request: NextRequest) {
  try {
    // Get all pending changegroups with their changesets and field changes
    const changegroups = await prisma.changegroups.findMany({
      where: {
        status: 'pending',
      },
      orderBy: { created_at: 'desc' },
      include: {
        changesets: {
          where: {
            status: 'pending',
          },
          orderBy: { created_at: 'desc' },
          include: {
            field_changes: {
              orderBy: { field_name: 'asc' },
            },
          },
        },
        llm_jobs: {
          select: {
            id: true,
            label: true,
            status: true,
            submitted_by: true,
          },
        },
      },
    });

    // Filter out empty changesets from each changegroup
    const changegroupsWithNonEmpty = changegroups.map(cg => ({
      ...cg,
      changesets: cg.changesets.filter(isNonEmptyChangeset),
    }));

    // Get ungrouped pending changesets (those without a changegroup)
    const ungroupedChangesets = await prisma.changesets.findMany({
      where: {
        status: 'pending',
        changegroup_id: null,
      },
      orderBy: { created_at: 'desc' },
      include: {
        field_changes: {
          orderBy: { field_name: 'asc' },
        },
      },
    });

    // Filter out empty ungrouped changesets
    const nonEmptyUngroupedChangesets = ungroupedChangesets.filter(isNonEmptyChangeset);

    // Calculate total pending count (using filtered changesets)
    const totalPendingChangesets = changegroupsWithNonEmpty.reduce(
      (sum, cg) => sum + cg.changesets.length,
      0
    ) + nonEmptyUngroupedChangesets.length;

    // Filter out changegroups that have no non-empty changesets
    const nonEmptyChangegroups = changegroupsWithNonEmpty.filter(cg => cg.changesets.length > 0);

    // Transform changegroups to group changesets by entity type
    const transformedChangegroups = nonEmptyChangegroups.map(cg => {
      // Group changesets by entity_type
      const byEntityType: Record<string, typeof cg.changesets> = {};
      for (const cs of cg.changesets) {
        if (!byEntityType[cs.entity_type]) {
          byEntityType[cs.entity_type] = [];
        }
        byEntityType[cs.entity_type].push(cs);
      }

      return {
        id: cg.id.toString(),
        source: cg.source,
        label: cg.label,
        description: cg.description,
        llm_job_id: cg.llm_job_id?.toString() ?? null,
        llm_job: cg.llm_jobs ? {
          id: cg.llm_jobs.id.toString(),
          label: cg.llm_jobs.label,
          status: cg.llm_jobs.status,
          submitted_by: cg.llm_jobs.submitted_by,
        } : null,
        status: cg.status,
        created_by: cg.created_by,
        created_at: cg.created_at,
        committed_by: cg.committed_by,
        committed_at: cg.committed_at,
        total_changesets: cg.total_changesets,
        approved_changesets: cg.approved_changesets,
        rejected_changesets: cg.rejected_changesets,
        changesets_by_type: Object.entries(byEntityType).map(([entityType, changesets]) => ({
          entity_type: entityType,
          count: changesets.length,
          changesets: changesets.map(cs => ({
            id: cs.id.toString(),
            entity_type: cs.entity_type,
            entity_id: cs.entity_id?.toString() ?? null,
            operation: cs.operation,
            entity_version: cs.entity_version,
            before_snapshot: serializeBigInt(cs.before_snapshot),
            after_snapshot: serializeBigInt(cs.after_snapshot),
            status: cs.status,
            created_by: cs.created_by,
            created_at: cs.created_at,
            reviewed_by: cs.reviewed_by,
            reviewed_at: cs.reviewed_at,
            field_changes: cs.field_changes.map(fc => ({
              id: fc.id.toString(),
              changeset_id: fc.changeset_id.toString(),
              field_name: fc.field_name,
              old_value: serializeBigInt(fc.old_value),
              new_value: serializeBigInt(fc.new_value),
              status: fc.status,
              approved_by: fc.approved_by,
              approved_at: fc.approved_at,
              rejected_by: fc.rejected_by,
              rejected_at: fc.rejected_at,
            })),
          })),
        })),
      };
    });

    // Group ungrouped changesets by entity type (using filtered list)
    const ungroupedByType: Record<string, typeof nonEmptyUngroupedChangesets> = {};
    for (const cs of nonEmptyUngroupedChangesets) {
      if (!ungroupedByType[cs.entity_type]) {
        ungroupedByType[cs.entity_type] = [];
      }
      ungroupedByType[cs.entity_type].push(cs);
    }

    const transformedUngrouped = Object.entries(ungroupedByType).map(([entityType, changesets]) => ({
      entity_type: entityType,
      count: changesets.length,
      changesets: changesets.map(cs => ({
        id: cs.id.toString(),
        entity_type: cs.entity_type,
        entity_id: cs.entity_id?.toString() ?? null,
        operation: cs.operation,
        entity_version: cs.entity_version,
        before_snapshot: serializeBigInt(cs.before_snapshot),
        after_snapshot: serializeBigInt(cs.after_snapshot),
        status: cs.status,
        created_by: cs.created_by,
        created_at: cs.created_at,
        reviewed_by: cs.reviewed_by,
        reviewed_at: cs.reviewed_at,
        field_changes: cs.field_changes.map(fc => ({
          id: fc.id.toString(),
          changeset_id: fc.changeset_id.toString(),
          field_name: fc.field_name,
          old_value: serializeBigInt(fc.old_value),
          new_value: serializeBigInt(fc.new_value),
          status: fc.status,
          approved_by: fc.approved_by,
          approved_at: fc.approved_at,
          rejected_by: fc.rejected_by,
          rejected_at: fc.rejected_at,
        })),
      })),
    }));

    return NextResponse.json({
      changegroups: transformedChangegroups,
      ungrouped_changesets_by_type: transformedUngrouped,
      total_pending_changesets: totalPendingChangesets,
      total_changegroups: nonEmptyChangegroups.length,
    });
  } catch (error) {
    console.error('Error getting pending changegroups:', error);
    return NextResponse.json(
      { error: 'Failed to get pending changegroups' },
      { status: 500 }
    );
  }
}

