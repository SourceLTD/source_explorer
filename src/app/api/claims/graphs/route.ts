import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { KnowledgeGraphSummary } from '@/lib/claims/types';

export async function GET() {
  try {
    const graphs = await prisma.knowledge_graphs.findMany({
      orderBy: { label: 'asc' },
      include: {
        _count: { select: { instances: true } },
      },
    });

    const result: KnowledgeGraphSummary[] = graphs.map((g) => ({
      id: g.id.toString(),
      label: g.label,
      description: g.description,
      instanceCount: g._count.instances,
    }));

    return NextResponse.json({ graphs: result });
  } catch (error) {
    console.error('[API] GET /api/claims/graphs:', error);
    return NextResponse.json({ error: 'Failed to load knowledge graphs' }, { status: 500 });
  }
}
