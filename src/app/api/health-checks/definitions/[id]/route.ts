/**
 * API Route: /api/health-checks/definitions/[id]
 *
 * GET    - Fetch a definition with its diagnosis codes
 * PATCH  - Update fields on a definition
 * DELETE - Delete a definition
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isPrismaNotFound, parseIdParam } from '@/lib/issues/validation';
import { normalizeCode, sanitizeTargetTypes } from '@/lib/health-checks/validation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const defId = parseIdParam(id);
    if (defId === null) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const def = await prisma.health_check_definitions.findUnique({
      where: { id: defId },
      include: {
        diagnosis_codes: {
          include: { health_diagnosis_code_groups: true },
          orderBy: [{ enabled: 'desc' }, { code: 'asc' }],
        },
      },
    });

    if (!def) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: def.id.toString(),
      code: def.code,
      label: def.label,
      description: def.description,
      target_types: def.target_types,
      rule_version: def.rule_version,
      enabled: def.enabled,
      execution_kind:
        def.execution_kind === 'programmatic' ? 'programmatic' : 'llm_batch',
      config: (def.config as Record<string, unknown> | null) ?? null,
      created_at: def.created_at.toISOString(),
      updated_at: def.updated_at.toISOString(),
      diagnosis_codes: def.diagnosis_codes.map((c) => ({
        id: c.id.toString(),
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
        remediation_strategy: c.remediation_strategy,
        remediation_notes: c.remediation_notes,
        group_id: c.group_id ? c.group_id.toString() : null,
        group: c.health_diagnosis_code_groups
          ? {
              id: c.health_diagnosis_code_groups.id.toString(),
              key: c.health_diagnosis_code_groups.key,
              label: c.health_diagnosis_code_groups.label,
              description: c.health_diagnosis_code_groups.description,
              created_at: c.health_diagnosis_code_groups.created_at.toISOString(),
            }
          : null,
        check_definition_id: c.check_definition_id ? c.check_definition_id.toString() : null,
        created_at: c.created_at.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Error fetching health check definition:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const defId = parseIdParam(id);
    if (defId === null) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const existing = await prisma.health_check_definitions.findUnique({
      where: { id: defId },
      select: { execution_kind: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (existing.execution_kind === 'programmatic') {
      return NextResponse.json(
        { error: 'Programmatic health check definitions are managed by code' },
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
    if ('target_types' in body) {
      try {
        updates.target_types = sanitizeTargetTypes(body.target_types) as never;
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Invalid target_types' },
          { status: 400 },
        );
      }
    }
    if ('rule_version' in body) {
      const v = Number(body.rule_version);
      if (!Number.isInteger(v) || v < 1) {
        return NextResponse.json(
          { error: 'rule_version must be a positive integer' },
          { status: 400 },
        );
      }
      updates.rule_version = v;
    }
    if ('enabled' in body) {
      updates.enabled = Boolean(body.enabled);
    }
    if ('execution_kind' in body) {
      if (body.execution_kind !== 'llm_batch' && body.execution_kind !== 'programmatic') {
        return NextResponse.json(
          { error: 'execution_kind must be "llm_batch" or "programmatic"' },
          { status: 400 },
        );
      }
      if (body.execution_kind === 'programmatic') {
        return NextResponse.json(
          { error: 'Programmatic health check definitions are managed by code' },
          { status: 403 },
        );
      }
      updates.execution_kind = body.execution_kind;
    }
    if ('config' in body) {
      updates.config =
        body.config && typeof body.config === 'object'
          ? (body.config as Prisma.InputJsonValue)
          : Prisma.JsonNull;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    try {
      const def = await prisma.health_check_definitions.update({
        where: { id: defId },
        data: updates,
      });
      return NextResponse.json({
        id: def.id.toString(),
        code: def.code,
        label: def.label,
        description: def.description,
        target_types: def.target_types,
        rule_version: def.rule_version,
        enabled: def.enabled,
        execution_kind:
          def.execution_kind === 'programmatic' ? 'programmatic' : 'llm_batch',
        config: (def.config as Record<string, unknown> | null) ?? null,
        created_at: def.created_at.toISOString(),
        updated_at: def.updated_at.toISOString(),
      });
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
    if (isPrismaNotFound(error)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error('Error updating health check definition:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const defId = parseIdParam(id);
    if (defId === null) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    const existing = await prisma.health_check_definitions.findUnique({
      where: { id: defId },
      select: { execution_kind: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (existing.execution_kind === 'programmatic') {
      return NextResponse.json(
        { error: 'Programmatic health check definitions are managed by code' },
        { status: 403 },
      );
    }

    await prisma.health_check_definitions.delete({ where: { id: defId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (isPrismaNotFound(error)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    console.error('Error deleting health check definition:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
