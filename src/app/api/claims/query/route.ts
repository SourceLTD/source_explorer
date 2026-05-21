import { NextRequest, NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { getChatModel } from '@/lib/chat/models';
import { claimsQuerySchema } from '@/lib/claims/query-schema';
import { buildGraphForInstances, executeClaimsQuery } from '@/lib/claims/query-executor';
import { prisma } from '@/lib/prisma';

const QUERY_SYSTEM_PROMPT = `You translate natural language questions about a knowledge graph into structured filters.

The graph contains:
- **Instances**: concrete claims/assertions, each typed by a concept (e.g. Person, Organization, Patient)
- **Fillers**: property slots on instances, either pointing to another instance or a primitive string value
- Common properties: employer, title, headquarters, employee, treated_by, diagnosed_with, specialty

Rules:
- Map concept names to conceptLabels (exact canonical labels when possible)
- Map property references to propertyFilters with propertyLabel
- Use fillerConceptLabel when filtering by what concept fills a property (e.g. "employed by Acme" → propertyLabel: "employer", fillerConceptLabel: "Organization" with context)
- Use fillerValueContains for primitive values (e.g. title contains "CEO")
- Set expandNeighborhood true when the user wants related/connected entities shown
- Always provide a concise explanation of what the query finds`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { graphId, query } = body;

    if (!graphId || typeof graphId !== 'string') {
      return NextResponse.json({ error: 'graphId is required' }, { status: 400 });
    }
    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    const graph = await prisma.knowledge_graphs.findUnique({
      where: { id: BigInt(graphId) },
      include: {
        instances: {
          include: { concepts: { select: { label: true } } },
          take: 20,
        },
      },
    });
    if (!graph) {
      return NextResponse.json({ error: 'Knowledge graph not found' }, { status: 404 });
    }

    const contextSummary = graph.instances
      .map((i) => {
        const meta = i.metadata as Record<string, unknown> | null;
        const label = meta?.label ?? i.concepts.label;
        return `- ${label} (${i.concepts.label})`;
      })
      .join('\n');

    const { object: filter } = await generateObject({
      model: getChatModel(),
      schema: claimsQuerySchema,
      system: QUERY_SYSTEM_PROMPT,
      prompt: `Knowledge graph: "${graph.label}"
${graph.description ? `Description: ${graph.description}` : ''}

Sample instances:
${contextSummary || '(none)'}

User query: ${query.trim()}`,
    });

    const { matchedInstanceIds, explanation } = await executeClaimsQuery(
      BigInt(graphId),
      filter,
    );

    const graphPayload = await buildGraphForInstances(
      BigInt(graphId),
      matchedInstanceIds,
      filter.expandNeighborhood ?? matchedInstanceIds.length > 0,
    );

    return NextResponse.json({
      explanation,
      matchedInstanceIds: matchedInstanceIds.map(String),
      graph: graphPayload,
      filter,
    });
  } catch (error) {
    console.error('[API] POST /api/claims/query:', error);
    return NextResponse.json({ error: 'Failed to execute query' }, { status: 500 });
  }
}
