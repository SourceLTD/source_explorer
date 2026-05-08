/**
 * API Route: /api/health-checks/diagnosis-code-groups
 *
 * GET - List diagnosis-code groups (the new family pointer that replaced
 *       the legacy `parent_code_id` self-reference). Groups have no leader
 *       code; a code's siblings are its peers under the same `group_id`.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { HealthDiagnosisCodeGroup } from '@/lib/health-checks/types';

function serialize(g: {
  id: bigint;
  key: string;
  label: string;
  description: string | null;
  created_at: Date;
}): HealthDiagnosisCodeGroup {
  return {
    id: g.id.toString(),
    key: g.key,
    label: g.label,
    description: g.description,
    created_at: g.created_at.toISOString(),
  };
}

export async function GET() {
  try {
    const groups = await prisma.health_diagnosis_code_groups.findMany({
      orderBy: [{ label: 'asc' }],
    });
    return NextResponse.json({
      groups: groups.map(serialize),
      total: groups.length,
    });
  } catch (error) {
    console.error('Error listing diagnosis code groups:', error);
    return NextResponse.json(
      { error: 'Failed to list diagnosis code groups' },
      { status: 500 },
    );
  }
}
