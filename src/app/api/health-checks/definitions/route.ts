/**
 * API Route: /api/health-checks/definitions
 *
 * GET  - List all health check definitions
 * POST - Create a new health check definition
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { parseIdParam } from '@/lib/issues/validation';
import { normalizeCode, sanitizeTargetTypes } from '@/lib/health-checks/validation';

type DefinitionRow = {
  id: bigint;
  code: string;
  label: string;
  description: string | null;
  target_types: string[];
  rule_version: number;
  enabled: boolean;
  execution_kind: string;
  config: Prisma.JsonValue | null;
  created_at: Date;
  updated_at: Date;
};

const VALID_EXECUTION_KINDS = new Set(['llm_batch', 'programmatic']);

function normalizeExecutionKind(value: unknown): 'llm_batch' | 'programmatic' | null {
  if (typeof value !== 'string') return null;
  return VALID_EXECUTION_KINDS.has(value)
    ? (value as 'llm_batch' | 'programmatic')
    : null;
}

function serialize(def: DefinitionRow) {
  return {
    id: def.id.toString(),
    code: def.code,
    label: def.label,
    description: def.description,
    target_types: def.target_types,
    rule_version: def.rule_version,
    enabled: def.enabled,
    execution_kind: normalizeExecutionKind(def.execution_kind) ?? 'llm_batch',
    config: (def.config as Record<string, unknown> | null) ?? null,
    created_at: def.created_at.toISOString(),
    updated_at: def.updated_at.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const enabledParam = searchParams.get('enabled');

    const where: Record<string, unknown> = {};
    if (enabledParam === 'true') where.enabled = true;
    else if (enabledParam === 'false') where.enabled = false;

    const definitions = await prisma.health_check_definitions.findMany({
      where,
      orderBy: [{ enabled: 'desc' }, { code: 'asc' }],
    });

    return NextResponse.json({
      definitions: definitions.map(serialize),
      total: definitions.length,
    });
  } catch (error) {
    console.error('Error listing health check definitions:', error);
    return NextResponse.json(
      { error: 'Failed to list health check definitions' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const code = normalizeCode(body.code);
    if (!code) {
      return NextResponse.json({ error: 'code is required' }, { status: 400 });
    }

    const label = typeof body.label === 'string' ? body.label.trim() : '';
    if (!label) {
      return NextResponse.json({ error: 'label is required' }, { status: 400 });
    }

    let targetTypes: string[] = [];
    try {
      targetTypes = sanitizeTargetTypes(body.target_types);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Invalid target_types' },
        { status: 400 },
      );
    }

    const ruleVersion = parseIdParam(body.rule_version ?? 1);
    const enabled = body.enabled === undefined ? true : Boolean(body.enabled);
    const description =
      typeof body.description === 'string' && body.description.trim()
        ? body.description.trim()
        : null;
    const executionKind =
      body.execution_kind === undefined
        ? 'llm_batch'
        : normalizeExecutionKind(body.execution_kind);
    if (executionKind === null) {
      return NextResponse.json(
        { error: 'execution_kind must be "llm_batch" or "programmatic"' },
        { status: 400 },
      );
    }
    if (executionKind === 'programmatic') {
      return NextResponse.json(
        { error: 'Programmatic health check definitions are managed by code' },
        { status: 403 },
      );
    }
    const config =
      body.config && typeof body.config === 'object'
        ? (body.config as Prisma.InputJsonValue)
        : Prisma.JsonNull;

    try {
      const def = await prisma.health_check_definitions.create({
        data: {
          code,
          label,
          description,
          target_types: targetTypes as never,
          rule_version: ruleVersion ? Number(ruleVersion) : 1,
          enabled,
          execution_kind: executionKind,
          config,
        },
      });
      return NextResponse.json(serialize(def), { status: 201 });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return NextResponse.json(
          { error: 'A health check definition with this code already exists' },
          { status: 409 },
        );
      }
      throw err;
    }
  } catch (error) {
    console.error('Error creating health check definition:', error);
    return NextResponse.json(
      { error: 'Failed to create health check definition' },
      { status: 500 },
    );
  }
}
