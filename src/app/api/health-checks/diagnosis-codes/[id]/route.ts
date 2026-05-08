/**
 * API Route: /api/health-checks/diagnosis-codes/[id]
 *
 * PATCH  - Update fields on a diagnosis code
 * DELETE - Delete a diagnosis code
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isPrismaNotFound, parseIdParam } from '@/lib/issues/validation';
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
} from '@/lib/health-checks/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

type DiagnosisGroupRow = {
  id: bigint;
  key: string;
  label: string;
  description: string | null;
  created_at: Date;
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

function serialize(c: {
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
}): HealthDiagnosisCode {
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

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const codeId = parseIdParam(id);
    if (codeId === null) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const existing = await prisma.health_diagnosis_codes.findUnique({
      where: { id: codeId },
      include: {
        health_check_definition: {
          select: { execution_kind: true },
        },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (existing.health_check_definition?.execution_kind === 'programmatic') {
      return NextResponse.json(
        { error: 'Programmatic health check diagnosis codes are managed by code' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if ('code' in body) {
      const c = normalizeCode(body.code);
      if (!c) return NextResponse.json({ error: 'code cannot be empty' }, { status: 400 });
      updates.code = c;
    }
    if ('label' in body) {
      if (typeof body.label !== 'string' || !body.label.trim()) {
        return NextResponse.json({ error: 'label cannot be empty' }, { status: 400 });
      }
      updates.label = body.label.trim();
    }
    if ('description' in body) {
      updates.description =
        typeof body.description === 'string' && body.description.trim()
          ? body.description.trim()
          : null;
    }
    if ('examples' in body) {
      updates.examples = sanitizeExamples(body.examples);
    }
    if ('severity' in body) {
      if (!isIssuePriority(body.severity)) {
        return NextResponse.json(
          { error: 'severity must be one of low|medium|high|critical' },
          { status: 400 },
        );
      }
      updates.severity = body.severity;
    }
    if ('category' in body) {
      updates.category =
        typeof body.category === 'string' && body.category.trim()
          ? body.category.trim()
          : null;
    }
    if ('enabled' in body) {
      updates.enabled = Boolean(body.enabled);
    }
    if ('applies_to_frame_types' in body) {
      try {
        updates.applies_to_frame_types = sanitizeFrameTypeList(body.applies_to_frame_types);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Invalid applies_to_frame_types' },
          { status: 400 },
        );
      }
    }
    if ('applies_to_frame_subtypes' in body) {
      try {
        updates.applies_to_frame_subtypes = sanitizeFrameSubtypeList(body.applies_to_frame_subtypes);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Invalid applies_to_frame_subtypes' },
          { status: 400 },
        );
      }
    }
    if ('match_null_subtype' in body) {
      updates.match_null_subtype = Boolean(body.match_null_subtype);
    }
    if ('remediation_strategy' in body) {
      if (
        body.remediation_strategy === null ||
        body.remediation_strategy === '' ||
        body.remediation_strategy === 'null'
      ) {
        updates.remediation_strategy = null;
      } else if (isHealthRemediationStrategy(body.remediation_strategy)) {
        updates.remediation_strategy = body.remediation_strategy;
      } else {
        return NextResponse.json(
          { error: 'Unsupported remediation_strategy' },
          { status: 400 },
        );
      }
    }
    if ('remediation_notes' in body) {
      updates.remediation_notes = sanitizeNullableString(body.remediation_notes);
    }
    if ('check_definition_id' in body) {
      if (body.check_definition_id === null || body.check_definition_id === '') {
        updates.check_definition_id = null;
      } else {
        const defId = parseIdParam(body.check_definition_id);
        if (defId === null) {
          return NextResponse.json(
            { error: 'check_definition_id must be a positive integer or null' },
            { status: 400 },
          );
        }
        const definition = await prisma.health_check_definitions.findUnique({
          where: { id: defId },
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
        updates.check_definition_id = defId;
      }
    }
    if ('group_id' in body) {
      if (
        body.group_id === null ||
        body.group_id === '' ||
        body.group_id === 'null'
      ) {
        updates.group_id = null;
      } else {
        const groupId = parseIdParam(body.group_id);
        if (groupId === null) {
          return NextResponse.json(
            { error: 'group_id must be a positive integer or null' },
            { status: 400 },
          );
        }
        updates.group_id = groupId;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    try {
      const updated = await prisma.health_diagnosis_codes.update({
        where: { id: codeId },
        data: updates,
        include: { health_diagnosis_code_groups: true },
      });
      return NextResponse.json(serialize(updated));
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
    if (isPrismaNotFound(error)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error('Error updating diagnosis code:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const codeId = parseIdParam(id);
    if (codeId === null) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const existing = await prisma.health_diagnosis_codes.findUnique({
      where: { id: codeId },
      include: {
        health_check_definition: {
          select: { execution_kind: true },
        },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (existing.health_check_definition?.execution_kind === 'programmatic') {
      return NextResponse.json(
        { error: 'Programmatic health check diagnosis codes are managed by code' },
        { status: 403 },
      );
    }

    await prisma.health_diagnosis_codes.delete({ where: { id: codeId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (isPrismaNotFound(error)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error('Error deleting diagnosis code:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
