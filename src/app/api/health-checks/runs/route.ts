/**
 * API Route: /api/health-checks/runs
 *
 * GET  - List recent health check runs (most recent first)
 * POST - Queue a new health check run for a definition (worker picks it up)
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { parseIdParam } from '@/lib/issues/validation';
import { isHealthCheckRunStatus } from '@/lib/health-checks/validation';

type RunRow = {
  id: bigint;
  check_definition_id: bigint | null;
  label: string | null;
  status: string;
  worker_id: string | null;
  model: string | null;
  llm_job_id: bigint | null;
  total_items: number;
  processed_items: number;
  passed_items: number;
  warning_items: number;
  failed_items: number;
  error_items: number;
  input_tokens: number;
  output_tokens: number;
  cost_microunits: bigint | null;
  error: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  updated_at: Date;
  check_definition?: {
    code: string;
    label: string;
    execution_kind: string;
  } | null;
};

function serialize(r: RunRow) {
  const execKind = r.check_definition?.execution_kind;
  return {
    id: r.id.toString(),
    check_definition_id: r.check_definition_id ? r.check_definition_id.toString() : null,
    check_definition_code: r.check_definition?.code ?? null,
    check_definition_label: r.check_definition?.label ?? null,
    check_definition_execution_kind:
      execKind === 'programmatic'
        ? 'programmatic'
        : execKind === 'llm_batch'
          ? 'llm_batch'
          : null,
    label: r.label,
    status: r.status,
    worker_id: r.worker_id,
    model: r.model,
    llm_job_id: r.llm_job_id ? r.llm_job_id.toString() : null,
    total_items: r.total_items,
    processed_items: r.processed_items,
    passed_items: r.passed_items,
    warning_items: r.warning_items,
    failed_items: r.failed_items,
    error_items: r.error_items,
    input_tokens: r.input_tokens,
    output_tokens: r.output_tokens,
    cost_microunits: r.cost_microunits ? r.cost_microunits.toString() : null,
    error: r.error,
    created_at: r.created_at.toISOString(),
    started_at: r.started_at ? r.started_at.toISOString() : null,
    completed_at: r.completed_at ? r.completed_at.toISOString() : null,
    updated_at: r.updated_at.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const where: Record<string, unknown> = {};

    const defParam = searchParams.get('definition_id');
    if (defParam) {
      const defId = parseIdParam(defParam);
      if (defId === null) {
        return NextResponse.json(
          { error: 'Invalid definition_id filter' },
          { status: 400 },
        );
      }
      where.check_definition_id = defId;
    }

    const statusParam = searchParams.get('status');
    if (statusParam) {
      if (!isHealthCheckRunStatus(statusParam)) {
        return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 });
      }
      where.status = statusParam;
    }

    const limitParam = searchParams.get('limit');
    let take = 50;
    if (limitParam) {
      const n = Number(limitParam);
      if (Number.isInteger(n) && n > 0 && n <= 200) take = n;
    }

    const runs = await prisma.health_check_runs.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take,
      include: {
        check_definition: {
          select: { code: true, label: true, execution_kind: true },
        },
      },
    });

    return NextResponse.json({
      runs: runs.map(serialize),
      total: runs.length,
    });
  } catch (error) {
    console.error('Error listing health check runs:', error);
    return NextResponse.json({ error: 'Failed to list runs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const definitionId = parseIdParam(body.check_definition_id);
    if (definitionId === null) {
      return NextResponse.json(
        { error: 'check_definition_id is required' },
        { status: 400 },
      );
    }

    const definition = await prisma.health_check_definitions.findUnique({
      where: { id: definitionId },
      select: { id: true, enabled: true },
    });
    if (!definition) {
      return NextResponse.json(
        { error: 'Health check definition not found' },
        { status: 404 },
      );
    }

    const label =
      typeof body.label === 'string' && body.label.trim() ? body.label.trim() : null;
    const scope =
      body.scope && typeof body.scope === 'object'
        ? (body.scope as Prisma.InputJsonValue)
        : Prisma.JsonNull;
    const config =
      body.config && typeof body.config === 'object'
        ? (body.config as Prisma.InputJsonValue)
        : Prisma.JsonNull;

    const run = await prisma.health_check_runs.create({
      data: {
        check_definition_id: definitionId,
        label,
        scope,
        config,
        status: 'queued',
      },
      include: {
        check_definition: {
          select: { code: true, label: true, execution_kind: true },
        },
      },
    });

    return NextResponse.json(serialize(run), { status: 201 });
  } catch (error) {
    console.error('Error queuing health check run:', error);
    return NextResponse.json({ error: 'Failed to queue run' }, { status: 500 });
  }
}
