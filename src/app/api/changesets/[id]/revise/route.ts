/**
 * API Route: /api/changesets/[id]/revise
 *
 * POST — Accept user natural language feedback and create a revised changeset
 * using the LLM revision agent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserName } from '@/utils/supabase/server';
import { reviseChangeset, type ChangesetContext } from '@/lib/agents/changeset-revision-agent';

const MAX_REVISIONS_PER_CHAIN = 10;
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

    if (changeset.superseded_by_id) {
      return NextResponse.json(
        { error: 'This changeset has already been superseded. Revise the latest version instead.' },
        { status: 400 },
      );
    }

    const revisionNumber = (changeset.revision_number ?? 1) + 1;
    if (revisionNumber > MAX_REVISIONS_PER_CHAIN) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_REVISIONS_PER_CHAIN} revisions per changeset reached` },
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
      return NextResponse.json(
        { error: 'The AI agent could not determine how to revise this changeset. Please try a more specific prompt.' },
        { status: 422 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
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
          revision_parent_id: changeset.id,
          revision_number: revisionNumber,
          revision_prompt: user_prompt.trim(),
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

      await (tx.changesets.update as any)({
        where: { id: changeset.id },
        data: {
          superseded_by_id: newChangeset.id,
          status: 'discarded',
        },
      });

      return newChangeset;
    });

    return NextResponse.json(
      {
        new_changeset_id: result.id.toString(),
        revision_number: revisionNumber,
        reasoning: revision.reasoning,
        field_changes: revision.field_changes,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[API] Error revising changeset:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to revise changeset' },
      { status: 500 },
    );
  }
}
