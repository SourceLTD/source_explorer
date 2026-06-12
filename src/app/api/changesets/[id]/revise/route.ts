/**
 * API Route: /api/changesets/[id]/revise
 *
 * POST — Accept user natural language feedback and ADD a new alternative to
 * the changeset's alternative group using the LLM revision agent. The new
 * alternative coexists with the existing one(s) (the source is NOT discarded);
 * the newly-added alternative becomes the selected one.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserName } from '@/utils/supabase/server';
import { reviseChangeset, type ChangesetContext } from '@/lib/agents/changeset-revision-agent';
import {
  getOrCreateAlternativeGroup,
  attachChangesetToGroup,
  countPendingAlternatives,
} from '@/lib/version-control/alternatives';

const MAX_ALTERNATIVES_PER_GROUP = 10;
const MAX_PROMPT_LENGTH = 2000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 5;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  entry.count++;
  return true;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const changesetId = BigInt(id);
    const body = await request.json();
    const { user_prompt } = body;

    if (!user_prompt || typeof user_prompt !== 'string' || !user_prompt.trim()) {
      return NextResponse.json(
        { error: 'user_prompt is required' },
        { status: 400 },
      );
    }

    if (user_prompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json(
        { error: `Prompt must be at most ${MAX_PROMPT_LENGTH} characters` },
        { status: 400 },
      );
    }

    const userId = await getCurrentUserName();

    if (!checkRateLimit(userId)) {
      return NextResponse.json(
        { error: 'Too many revision requests. Please wait a moment before trying again.' },
        { status: 429 },
      );
    }

    const changeset = await prisma.changesets.findUnique({
      where: { id: changesetId },
      include: { field_changes: true },
    }) as any;

    if (!changeset) {
      return NextResponse.json(
        { error: 'Changeset not found' },
        { status: 404 },
      );
    }

    if (changeset.status !== 'pending') {
      return NextResponse.json(
        { error: 'Only pending changesets can be revised' },
        { status: 400 },
      );
    }

    const context: ChangesetContext = {
      changeset_id: changeset.id.toString(),
      entity_type: changeset.entity_type as ChangesetContext['entity_type'],
      entity_id: changeset.entity_id?.toString() ?? null,
      operation: changeset.operation,
      before_snapshot: changeset.before_snapshot as Record<string, unknown> | null,
      after_snapshot: changeset.after_snapshot as Record<string, unknown> | null,
      field_changes: changeset.field_changes.map((fc: any) => ({
        field_name: fc.field_name,
        old_value: fc.old_value,
        new_value: fc.new_value,
        status: fc.status,
      })),
    };

    const revision = await reviseChangeset(context, user_prompt.trim());

    if (!revision.field_changes || revision.field_changes.length === 0) {
      console.warn('[API /revise] Agent returned 0 field_changes for changeset', id);
      console.warn('[API /revise] Context:', JSON.stringify(context, null, 2).slice(0, 1000));
      console.warn('[API /revise] Reasoning:', revision.reasoning);
      return NextResponse.json(
        { error: 'The AI agent could not determine how to revise this changeset. Please try a more specific prompt.' },
        { status: 422 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Resolve (or create) the alternative group for this change. The new
      // revision is ADDED as a coexisting alternative; the original is NOT
      // discarded so reviewers can compare them side-by-side.
      let groupId = changeset.alternative_group_id as bigint | null;
      if (groupId == null) {
        groupId = await getOrCreateAlternativeGroup(tx, {
          entityType: changeset.change_plan_id ? null : changeset.entity_type,
          entityId: changeset.change_plan_id ? null : changeset.entity_id,
          changePlanId: changeset.change_plan_id ?? null,
          findingId: changeset.finding_id ?? null,
          createdBy: userId,
        });
        // Backfill the source changeset into the group (selected by default).
        await attachChangesetToGroup(tx, {
          groupId,
          changesetId: changeset.id,
          origin: (changeset.origin as any) ?? 'manual',
        });
      }

      const pendingCount = await countPendingAlternatives(tx, groupId);
      if (pendingCount >= MAX_ALTERNATIVES_PER_GROUP) {
        throw new MaxAlternativesError(
          `Maximum of ${MAX_ALTERNATIVES_PER_GROUP} alternatives per change reached`,
        );
      }

      const newChangeset = await (tx.changesets.create as any)({
        data: {
          entity_type: changeset.entity_type,
          entity_id: changeset.entity_id,
          operation: changeset.operation,
          entity_version: changeset.entity_version,
          before_snapshot: changeset.before_snapshot ?? undefined,
          after_snapshot: changeset.after_snapshot ?? undefined,
          status: 'pending',
          created_by: userId,
          llm_job_id: changeset.llm_job_id,
          change_plan_id: changeset.change_plan_id,
          finding_id: changeset.finding_id,
          revision_parent_id: changeset.id,
          revision_number: (changeset.revision_number ?? 1) + 1,
          revision_prompt: user_prompt.trim(),
          alternative_group_id: groupId,
          origin: 'revision',
        },
      });

      for (const fc of revision.field_changes) {
        await tx.field_changes.create({
          data: {
            changeset_id: newChangeset.id,
            field_name: fc.field_name,
            old_value: fc.old_value as any,
            new_value: fc.new_value as any,
            status: 'pending',
          },
        });
      }

      // The newly-added alternative becomes the selected one (most recent
      // intent), but the prior alternatives remain pending for comparison.
      await (tx.change_alternatives.update as any)({
        where: { id: groupId },
        data: { selected_changeset_id: newChangeset.id },
      });

      const totalAlternatives = await countPendingAlternatives(tx, groupId);

      return { newChangeset, groupId, totalAlternatives };
    });

    return NextResponse.json(
      {
        new_changeset_id: result.newChangeset.id.toString(),
        alternative_group_id: result.groupId.toString(),
        total_alternatives: result.totalAlternatives,
        reasoning: revision.reasoning,
        field_changes: revision.field_changes,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof MaxAlternativesError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[API] Error revising changeset:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to revise changeset' },
      { status: 500 },
    );
  }
}

class MaxAlternativesError extends Error {}
