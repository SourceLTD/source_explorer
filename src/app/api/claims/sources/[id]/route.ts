import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { blockLocatorSchema, resolveLocator } from '@/lib/claims/locator-schema';
import type { DocumentIndex } from '@/lib/documents';

export interface ResolvedMentionForSource {
  id: string;
  globalStart: number;
  globalEnd: number;
  mentionText: string;
  breadcrumb: string | null;
  page: number | null;
}

export interface SourceInstance {
  id: string;
  label: string;
  conceptLabel: string;
  confidence: number | null;
  mentions: ResolvedMentionForSource[];
}

export interface SourceDetail {
  id: string;
  content: string;
  sourceUri: string | null;
  contentType: string | null;
  artifactUri: string | null;
  documentIndex: DocumentIndex | null;
  instances: SourceInstance[];
}

function instanceLabel(metadata: unknown, conceptLabel: string, id: bigint): string {
  const meta = metadata as Record<string, unknown> | null;
  if (meta?.label && typeof meta.label === 'string') return meta.label;
  return `${conceptLabel} #${id}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sourceId = BigInt(id);

    const source = await prisma.source_texts.findUnique({
      where: { id: sourceId },
      include: {
        instances: {
          include: {
            concepts: { select: { id: true, label: true } },
            instance_mentions: { orderBy: { id: 'asc' } },
          },
        },
      },
    });

    if (!source) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    const docIndex = source.document_index as DocumentIndex | null;
    const canonicalText = source.content;

    const instances: SourceInstance[] = source.instances.map((inst) => {
      const mentions: ResolvedMentionForSource[] = [];

      for (const m of inst.instance_mentions) {
        const parsed = blockLocatorSchema.safeParse(m.locator);
        if (!parsed.success) continue;

        let resolved: ReturnType<typeof resolveLocator> = null;
        if (docIndex) {
          resolved = resolveLocator(parsed.data, docIndex, canonicalText);
        }

        if (resolved) {
          mentions.push({
            id: m.id.toString(),
            globalStart: resolved.globalStart,
            globalEnd: resolved.globalEnd,
            mentionText: m.mention_text ?? resolved.mentionText,
            breadcrumb: resolved.breadcrumb,
            page: resolved.page ?? null,
          });
        }
      }

      return {
        id: inst.id.toString(),
        label: instanceLabel(inst.metadata, inst.concepts.label, inst.id),
        conceptLabel: inst.concepts.label,
        confidence: inst.confidence,
        mentions,
      };
    });

    const detail: SourceDetail = {
      id: source.id.toString(),
      content: canonicalText,
      sourceUri: source.source_uri,
      contentType: source.content_type ?? null,
      artifactUri: source.artifact_uri ?? null,
      documentIndex: docIndex,
      instances,
    };

    return NextResponse.json(detail);
  } catch (error) {
    console.error('[API] GET /api/claims/sources/[id]:', error);
    return NextResponse.json({ error: 'Failed to load source detail' }, { status: 500 });
  }
}
