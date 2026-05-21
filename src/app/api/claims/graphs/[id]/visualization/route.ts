import { NextRequest, NextResponse } from 'next/server';
import { buildClaimsGraphPayload, instanceGraphInclude } from '@/lib/claims/graph-builder';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const graphId = BigInt(id);
    const highlightParam = request.nextUrl.searchParams.get('highlight');
    const highlightIds = highlightParam
      ? new Set(highlightParam.split(',').filter(Boolean))
      : new Set<string>();

    const graph = await prisma.knowledge_graphs.findUnique({
      where: { id: graphId },
    });
    if (!graph) {
      return NextResponse.json({ error: 'Knowledge graph not found' }, { status: 404 });
    }

    const instances = await prisma.instances.findMany({
      where: { knowledge_graph_id: graphId },
      include: instanceGraphInclude,
    });

    const payload = buildClaimsGraphPayload(instances, {
      highlightIds: highlightIds.size > 0 ? highlightIds : undefined,
      includeConceptNodes: false,
    });

    return NextResponse.json({
      graphId: graph.id.toString(),
      label: graph.label,
      description: graph.description,
      ...payload,
    });
  } catch (error) {
    console.error('[API] GET /api/claims/graphs/[id]/visualization:', error);
    return NextResponse.json({ error: 'Failed to load graph visualization' }, { status: 500 });
  }
}
