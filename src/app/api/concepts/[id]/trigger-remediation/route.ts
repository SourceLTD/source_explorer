/**
 * API Route: /api/frames/[id]/trigger-remediation
 *
 * POST — Schedules a remediation run for a specific frame by creating
 * a finding + remediation run + target directly, bypassing the full
 * health check pipeline.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUserName } from '@/utils/supabase/server';
import { parseIdParam } from '@/lib/issues/validation';
import { isHealthRemediationStrategy } from '@/lib/health-checks/validation';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params;
    const frameId = parseIdParam(rawId);
    if (frameId === null) {
      return NextResponse.json({ error: 'Invalid frame id' }, { status: 400 });
    }

    const body = await request.json();
    const { strategy, description, justification } = body;

    if (!strategy) {
      return NextResponse.json(
        { error: 'strategy is required' },
        { status: 400 },
      );
    }

    if (!isHealthRemediationStrategy(strategy)) {
      return NextResponse.json(
        { error: 'Invalid remediation strategy' },
        { status: 400 },
      );
    }

    const frame = await prisma.frames.findFirst({
      where: { id: frameId, deleted: false },
      select: { id: true, label: true },
    });
    if (!frame) {
      return NextResponse.json({ error: 'Frame not found' }, { status: 404 });
    }

    const userId = await getCurrentUserName();

    let diagnosisCode = await prisma.health_diagnosis_codes.findFirst({
      where: { remediation_strategy: strategy, enabled: true },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (!diagnosisCode) {
      diagnosisCode = await prisma.health_diagnosis_codes.findFirst({
        where: { enabled: true },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
    }
    if (!diagnosisCode) {
      return NextResponse.json(
        { error: 'No diagnosis codes available' },
        { status: 500 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create a health check finding to anchor the remediation
      const checkDef = await tx.health_check_definitions.findFirst({
        where: { enabled: true },
        select: { id: true },
        orderBy: { id: 'asc' },
      });

      let findingId: bigint | null = null;
      if (checkDef) {
        // Find or create a result to attach the finding to
        const run = await tx.health_check_runs.create({
          data: {
            check_definition_id: checkDef.id,
            label: `Manual remediation trigger: ${strategy}`,
            status: 'completed',
            total_items: 1,
            processed_items: 1,
            failed_items: 1,
          },
        });

        const result = await tx.health_check_results.create({
          data: {
            run_id: run.id,
            check_definition_id: checkDef.id,
            entity_type: 'frame',
            entity_id: frameId,
            status: 'failed',
            summary: description || `Manually triggered: ${strategy.replace(/_/g, ' ')}`,
          },
        });

        const finding = await tx.health_check_findings.create({
          data: {
            result_id: result.id,
            diagnosis_code_id: diagnosisCode!.id,
            status: 'open',
            severity: 'medium',
            title: `[Manual] ${strategy.replace(/_/g, ' ')} — ${frame.label}`,
            message: [
              description || `Manually scheduled remediation (strategy: ${strategy}) for frame "${frame.label}" (id: ${frameId}).`,
              justification ? `\n\nJustification: ${justification}` : '',
            ].join(''),
          },
        });
        findingId = finding.id;
      }

      // 2. Create a remediation run
      const remediationRun = await tx.health_remediation_runs.create({
        data: {
          kind: 'manual',
          status: 'queued',
          scope: { frame_ids: [frameId.toString()], strategy },
          config: { triggered_by: userId },
        },
      });

      // 3. Create the remediation target
      const target = await tx.health_remediation_targets.create({
        data: {
          run_id: remediationRun.id,
          finding_id: findingId,
          diagnosis_code_id: diagnosisCode!.id,
          strategy,
          execution_kind: 'llm_batch',
          entity_type: 'frame',
          entity_id: frameId,
          target_fingerprint: `manual:${frameId}:${Date.now()}`,
          context: {
            triggered_by: userId,
            frame_label: frame.label,
            ...(description ? { user_description: description } : {}),
            ...(justification ? { user_justification: justification } : {}),
          },
          status: 'pending',
        },
      });

      return { finding_id: findingId, run: remediationRun, target };
    });

    return NextResponse.json(
      {
        finding_id: result.finding_id?.toString() ?? null,
        run_id: result.run.id.toString(),
        target_id: result.target.id.toString(),
        message: `Remediation scheduled: "${strategy.replace(/_/g, ' ')}" for "${frame.label}"`,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[API] Error scheduling remediation:', error);
    return NextResponse.json(
      { error: 'Failed to schedule remediation' },
      { status: 500 },
    );
  }
}
