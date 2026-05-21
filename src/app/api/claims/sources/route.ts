import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export interface SourceListItem {
  id: string;
  sourceUri: string | null;
  contentType: string | null;
  instanceCount: number;
  mentionCount: number;
  label: string;
}

export async function GET() {
  try {
    const sources = await prisma.source_texts.findMany({
      where: {
        instances: { some: {} },
      },
      include: {
        _count: { select: { instances: true } },
        instances: {
          select: {
            id: true,
            instance_mentions: { select: { id: true } },
            knowledge_graphs: { select: { label: true } },
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    const result: SourceListItem[] = sources.map((st) => {
      const mentionCount = st.instances.reduce(
        (sum, inst) => sum + inst.instance_mentions.length,
        0,
      );
      const graphLabel = st.instances.find((i) => i.knowledge_graphs)?.knowledge_graphs?.label;
      const label =
        graphLabel ??
        (st.source_uri
          ? st.source_uri.replace(/^[a-z-]+:\/\//, '').slice(0, 40)
          : `Source ${st.id}`);

      return {
        id: st.id.toString(),
        sourceUri: st.source_uri,
        contentType: st.content_type ?? null,
        instanceCount: st._count.instances,
        mentionCount,
        label,
      };
    });

    return NextResponse.json({ sources: result });
  } catch (error) {
    console.error('[API] GET /api/claims/sources:', error);
    return NextResponse.json({ error: 'Failed to load sources' }, { status: 500 });
  }
}
