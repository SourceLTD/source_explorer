import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { ClaimsFillerDetail, ClaimsInstanceDetail, ClaimsMentionDetail } from '@/lib/claims/types';
import { blockLocatorSchema, resolveLocator } from '@/lib/claims/locator-schema';
import type { DocumentIndex } from '@/lib/documents';

function instanceDisplayLabel(metadata: unknown, conceptLabel: string, id: bigint): string {
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
    const instanceId = BigInt(id);

    const instance = await prisma.instances.findUnique({
      where: { id: instanceId },
      include: {
        concepts: {
          select: {
            id: true,
            label: true,
            definition: true,
            short_definition: true,
            archetype: true,
            domain: true,
            code: true,
            concept_relations_concept_relations_child_idToconcepts: {
              select: { concepts_concept_relations_parent_idToconcepts: { select: { id: true, label: true } } },
              take: 3,
            },
          },
        },
        source_texts: {
          select: {
            id: true,
            content: true,
            source_uri: true,
            content_type: true,
            artifact_uri: true,
            document_index: true,
          },
        },
        instance_fillers_instance_fillers_instance_idToinstances: {
          include: {
            properties: { select: { id: true, label: true } },
            instances_instance_fillers_filler_instance_idToinstances: {
              include: { concepts: { select: { label: true } } },
            },
          },
        },
        instance_mentions: {
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }

    const fillers: ClaimsFillerDetail[] =
      instance.instance_fillers_instance_fillers_instance_idToinstances.map((f) => {
        const fillerInst = f.instances_instance_fillers_filler_instance_idToinstances;
        return {
          id: f.id.toString(),
          propertyLabel: f.properties.label,
          propertyId: f.property_id.toString(),
          fillerInstanceId: f.filler_instance_id?.toString() ?? null,
          fillerInstanceLabel: fillerInst
            ? instanceDisplayLabel(fillerInst.metadata, fillerInst.concepts.label, fillerInst.id)
            : null,
          fillerValue: f.filler_value,
          confidence: f.confidence,
          sourceSpanStart: f.source_span_start,
          sourceSpanEnd: f.source_span_end,
        };
      });

    const docIndex = instance.source_texts?.document_index as DocumentIndex | null | undefined;
    const canonicalText = instance.source_texts?.content ?? '';

    const mentions: ClaimsMentionDetail[] = instance.instance_mentions.map((m) => {
      const parsed = blockLocatorSchema.safeParse(m.locator);
      if (!parsed.success) {
        console.warn(`[API] Invalid locator on mention ${m.id}:`, parsed.error.message);
        return {
          id: m.id.toString(),
          locator: m.locator as ClaimsMentionDetail['locator'],
          mentionText: m.mention_text,
          confidence: m.confidence,
          globalStart: null,
          globalEnd: null,
          breadcrumb: null,
          page: null,
        };
      }

      const locator = parsed.data;
      let resolved: ReturnType<typeof resolveLocator> = null;
      if (docIndex) {
        resolved = resolveLocator(locator, docIndex, canonicalText);
      }

      return {
        id: m.id.toString(),
        locator,
        mentionText: m.mention_text ?? resolved?.mentionText ?? null,
        confidence: m.confidence,
        globalStart: resolved?.globalStart ?? null,
        globalEnd: resolved?.globalEnd ?? null,
        breadcrumb: resolved?.breadcrumb ?? null,
        page: resolved?.page ?? locator.page ?? null,
      };
    });

    const conceptParents =
      instance.concepts.concept_relations_concept_relations_child_idToconcepts.map((r) => ({
        id: r.concepts_concept_relations_parent_idToconcepts.id.toString(),
        label: r.concepts_concept_relations_parent_idToconcepts.label,
      }));

    const detail: ClaimsInstanceDetail = {
      id: instance.id.toString(),
      conceptId: instance.concepts.id.toString(),
      conceptLabel: instance.concepts.label,
      conceptDefinition: instance.concepts.short_definition ?? instance.concepts.definition ?? null,
      conceptArchetype: instance.concepts.archetype ?? null,
      conceptDomain: instance.concepts.domain ?? null,
      conceptCode: instance.concepts.code ?? null,
      conceptParents,
      confidence: instance.confidence,
      metadata: (instance.metadata as Record<string, unknown>) ?? null,
      referentialStatus: instance.referential_status,
      knowledgeGraphId: instance.knowledge_graph_id?.toString() ?? null,
      sourceText: instance.source_texts
        ? {
            id: instance.source_texts.id.toString(),
            content: instance.source_texts.content,
            sourceUri: instance.source_texts.source_uri,
            contentType: instance.source_texts.content_type ?? null,
            artifactUri: instance.source_texts.artifact_uri ?? null,
            documentIndex: docIndex ?? null,
          }
        : null,
      fillers,
      mentions,
    };

    return NextResponse.json(detail);
  } catch (error) {
    console.error('[API] GET /api/claims/instances/[id]:', error);
    return NextResponse.json({ error: 'Failed to load instance detail' }, { status: 500 });
  }
}
