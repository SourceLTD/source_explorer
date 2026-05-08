/**
 * API Route: /api/health-checks/diagnosis-codes
 *
 * GET  - List diagnosis codes (filterable by check_definition_id, enabled)
 * POST - Create a new diagnosis code
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { parseIdParam } from '@/lib/issues/validation';
import {
  isHealthRemediationStrategy,
  isIssuePriority,
  normalizeCode,
  sanitizeExamples,
  sanitizeFrameSubtypeList,
  sanitizeFrameTypeList,
  sanitizeNullableString,
} from '@/lib/health-checks/validation';
import type {
  FrameSubtype,
  FrameType,
  HealthDiagnosisCode,
  HealthDiagnosisCodeGroup,
  HealthRemediationStrategy,
} from '@/lib/health-checks/types';

type DiagnosisGroupRow = {
  id: bigint;
  key: string;
  label: string;
  description: string | null;
  created_at: Date;
};

type DiagnosisRow = {
  id: bigint;
  check_definition_id: bigint | null;
  code: string;
  label: string;
  quick_summary: string | null;
  description: string | null;
  examples: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string | null;
  enabled: boolean;
  applies_to_frame_types: FrameType[];
  applies_to_frame_subtypes: FrameSubtype[];
  match_null_subtype: boolean;
  remediation_strategy: string | null;
  remediation_notes: string | null;
  group_id: bigint | null;
  created_at: Date;
  health_diagnosis_code_groups?: DiagnosisGroupRow | null;
};

function serializeGroup(g: DiagnosisGroupRow): HealthDiagnosisCodeGroup {
  return {
    id: g.id.toString(),
    key: g.key,
    label: g.label,
    description: g.description,
    created_at: g.created_at.toISOString(),
  };
}

function serialize(c: DiagnosisRow): HealthDiagnosisCode {
  return {
    id: c.id.toString(),
    check_definition_id: c.check_definition_id ? c.check_definition_id.toString() : null,
    code: c.code,
    label: c.label,
    quick_summary: c.quick_summary,
    description: c.description,
    examples: c.examples ?? [],
    severity: c.severity,
    category: c.category,
    enabled: c.enabled,
    applies_to_frame_types: c.applies_to_frame_types ?? [],
    applies_to_frame_subtypes: c.applies_to_frame_subtypes ?? [],
    match_null_subtype: c.match_null_subtype ?? false,
    remediation_strategy: isHealthRemediationStrategy(c.remediation_strategy)
      ? c.remediation_strategy
      : null,
    remediation_notes: c.remediation_notes,
    group_id: c.group_id ? c.group_id.toString() : null,
    group: c.health_diagnosis_code_groups
      ? serializeGroup(c.health_diagnosis_code_groups)
      : null,
    created_at: c.created_at.toISOString(),
  };
}

/**
 * Parse a `group_id` field from a request body.
 *
 * Returns:
 * - `undefined` when the field is absent (caller should leave the column unchanged).
 * - `null`      when the caller explicitly cleared the group.
 * - a `bigint`  when the caller set a new group.
 *
 * Throws when the value is invalid.
 */
function parseGroupId(value: unknown): bigint | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '' || value === 'null') return null;
  const id = parseIdParam(value);
  if (id === null) {
    throw new Error('group_id must be a positive integer or null');
  }
  return id;
}

function parseRemediationStrategy(
  value: unknown,
): HealthRemediationStrategy | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '' || value === 'null') return null;
  if (!isHealthRemediationStrategy(value)) {
    throw new Error('Unsupported remediation_strategy');
  }
  return value;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const where: Record<string, unknown> = {};

    const defParam = searchParams.get('definition_id');
    if (defParam !== null) {
      if (defParam === 'null' || defParam === '') {
        where.check_definition_id = null;
      } else {
        const defId = parseIdParam(defParam);
        if (defId === null) {
          return NextResponse.json(
            { error: 'Invalid definition_id filter' },
            { status: 400 },
          );
        }
        where.check_definition_id = defId;
      }
    }

    const enabledParam = searchParams.get('enabled');
    if (enabledParam === 'true') where.enabled = true;
    else if (enabledParam === 'false') where.enabled = false;

    const codes = await prisma.health_diagnosis_codes.findMany({
      where,
      include: { health_diagnosis_code_groups: true },
      orderBy: [{ enabled: 'desc' }, { code: 'asc' }],
    });

    return NextResponse.json({
      diagnosis_codes: codes.map(serialize),
      total: codes.length,
    });
  } catch (error) {
    console.error('Error listing diagnosis codes:', error);
    return NextResponse.json(
      { error: 'Failed to list diagnosis codes' },
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

    const severity = body.severity ?? 'medium';
    if (!isIssuePriority(severity)) {
      return NextResponse.json(
        { error: 'severity must be one of low|medium|high|critical' },
        { status: 400 },
      );
    }

    let definitionId: bigint | null = null;
    if (body.check_definition_id !== undefined && body.check_definition_id !== null) {
      definitionId = parseIdParam(body.check_definition_id);
      if (definitionId === null) {
        return NextResponse.json(
          { error: 'check_definition_id must be a positive integer' },
          { status: 400 },
        );
      }
      const definition = await prisma.health_check_definitions.findUnique({
        where: { id: definitionId },
        select: { execution_kind: true },
      });
      if (!definition) {
        return NextResponse.json(
          { error: 'Linked health check definition does not exist' },
          { status: 400 },
        );
      }
      if (definition.execution_kind === 'programmatic') {
        return NextResponse.json(
          { error: 'Programmatic health check diagnosis codes are managed by code' },
          { status: 403 },
        );
      }
    }

    let groupId: bigint | null | undefined;
    try {
      groupId = parseGroupId(body.group_id);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Invalid group_id' },
        { status: 400 },
      );
    }

    let appliesToFrameTypes: FrameType[];
    let appliesToFrameSubtypes: FrameSubtype[];
    let remediationStrategy: HealthRemediationStrategy | null | undefined;
    try {
      appliesToFrameTypes = sanitizeFrameTypeList(body.applies_to_frame_types);
      appliesToFrameSubtypes = sanitizeFrameSubtypeList(body.applies_to_frame_subtypes);
      remediationStrategy = parseRemediationStrategy(body.remediation_strategy);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Invalid diagnosis code input' },
        { status: 400 },
      );
    }

    try {
      const created = await prisma.health_diagnosis_codes.create({
        data: {
          code,
          label,
          description:
            typeof body.description === 'string' && body.description.trim()
              ? body.description.trim()
              : null,
          examples: sanitizeExamples(body.examples),
          severity,
          category:
            typeof body.category === 'string' && body.category.trim()
              ? body.category.trim()
              : null,
          enabled: body.enabled === undefined ? true : Boolean(body.enabled),
          applies_to_frame_types: appliesToFrameTypes,
          applies_to_frame_subtypes: appliesToFrameSubtypes,
          match_null_subtype: Boolean(body.match_null_subtype),
          remediation_strategy:
            remediationStrategy === undefined ? undefined : remediationStrategy,
          remediation_notes: sanitizeNullableString(body.remediation_notes),
          check_definition_id: definitionId ?? undefined,
          group_id: groupId === undefined ? undefined : groupId,
        },
        include: { health_diagnosis_code_groups: true },
      });
      return NextResponse.json(serialize(created), { status: 201 });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          return NextResponse.json(
            { error: 'A diagnosis code with this code already exists' },
            { status: 409 },
          );
        }
        if (err.code === 'P2003') {
          return NextResponse.json(
            { error: 'Linked health check definition or group does not exist' },
            { status: 400 },
          );
        }
      }
      throw err;
    }
  } catch (error) {
    console.error('Error creating diagnosis code:', error);
    return NextResponse.json(
      { error: 'Failed to create diagnosis code' },
      { status: 500 },
    );
  }
}
