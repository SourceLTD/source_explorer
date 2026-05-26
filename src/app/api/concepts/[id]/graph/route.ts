import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applyPendingToEntity, getPendingRelationChanges } from '@/lib/version-control';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const id = BigInt(idParam);

    const frame = await prisma.concepts.findUnique({
      where: { id },
      include: {
        properties: {
          orderBy: {
            id: 'asc',
          },
        },
        sense_concepts: {
          include: {
            senses: {
              include: {
                sense_concepts: {
                  include: {
                    concepts: { select: { id: true, label: true, code: true } },
                  },
                },
                lexical_unit_senses: {
                  where: { lexical_units: { deleted: false } },
                  include: {
                    lexical_units: {
                      select: {
                        id: true,
                        code: true,
                        legacy_id: true,
                        gloss: true,
                        lemmas: true,
                        src_lemmas: true,
                        examples: true,
                        flagged: true,
                        flagged_reason: true,
                        pos: true,
                      },
                    },
                  },
                },
              },
            },
          },
          take: 200,
        },
        concept_relations_concept_relations_parent_idToconcepts: {
          where: {
            concepts_concept_relations_child_idToconcepts: {
              deleted: false,
            },
          },
          include: {
            concepts_concept_relations_child_idToconcepts: {
              select: {
                id: true,
                label: true,
                short_definition: true,
                descendant_count: true,
                state_kind: true,
              },
            },
          },
        },
        concept_relations_concept_relations_child_idToconcepts: {
          where: {
            concepts_concept_relations_parent_idToconcepts: {
              deleted: false,
            },
          },
          include: {
            concepts_concept_relations_parent_idToconcepts: {
              select: {
                id: true,
                label: true,
                short_definition: true,
                descendant_count: true,
                state_kind: true,
              },
            },
          },
        },
      },
    });

    if (!frame || frame.deleted) {
      return NextResponse.json(
        { error: 'Concept not found' },
        { status: 404 }
      );
    }

    const graphNode = {
      id: frame.id.toString(),
      numericId: frame.id.toString(),
      pos: 'concepts' as const,
      label: frame.label,
      gloss: frame.definition,
      short_definition: frame.short_definition,
      archetype: frame.archetype,
      subtype: frame.subtype,
      state_kind: frame.state_kind,
      disable_healthcheck: frame.disable_healthcheck,
      vendler: frame.vendler,
      multi_perspective: frame.multi_perspective,
      wikidata_id: frame.wikidata_id,
      recipe: frame.recipe,
      recipe_graph: frame.recipe_graph,
      properties: frame.properties.map(role => ({
        id: role.id.toString(),
        concept_id: role.concept_id.toString(),
        description: role.description,
        notes: role.notes,
        main: role.main,
        examples: role.examples,
        label: role.label,
        fillers: role.fillers,
      })),
      senses: frame.sense_concepts.map(sfLink => {
        const sense = sfLink.senses;
        const senseConcepts = (sense.sense_concepts ?? []).map(sc => ({
          id: sc.concepts.id.toString(),
          label: sc.concepts.label,
          code: sc.concepts.code,
        }));
        const conceptWarning = senseConcepts.length === 0
          ? 'none' as const
          : senseConcepts.length > 1
            ? 'multiple' as const
            : null;
        return {
          id: sense.id.toString(),
          pos: sense.pos,
          definition: sense.definition,
          archetype: sense.archetype,
          lemmas: sense.lemmas,
          confidence: sense.confidence,
          type_dispute: sense.type_dispute,
          causative: sense.causative,
          inchoative: sense.inchoative,
          perspectival: sense.perspectival,
          concepts: senseConcepts,
          conceptWarning,
          lexical_units: (sense.lexical_unit_senses ?? []).map(lus => ({
            id: lus.lexical_units.id.toString(),
            code: lus.lexical_units.code,
            legacy_id: lus.lexical_units.legacy_id,
            gloss: lus.lexical_units.gloss,
            lemmas: lus.lexical_units.lemmas,
            src_lemmas: lus.lexical_units.src_lemmas,
            examples: lus.lexical_units.examples,
            flagged: lus.lexical_units.flagged,
            flagged_reason: lus.lexical_units.flagged_reason,
            pos: lus.lexical_units.pos,
          })),
        };
      }),
      // Legacy flat LUs across senses (deduped), kept for back-compat UIs.
      lexical_units: Array.from(
        new Map(
          frame.sense_concepts
            .flatMap(sfLink => sfLink.senses.lexical_unit_senses ?? [])
            .map(lus => [lus.lexical_units.id.toString(), lus.lexical_units])
        ).values()
      ).map((lu: any) => ({
        id: lu.id.toString(),
        code: lu.code,
        legacy_id: lu.legacy_id,
        gloss: lu.gloss,
        lemmas: lu.lemmas,
        src_lemmas: lu.src_lemmas,
        examples: lu.examples,
        flagged: lu.flagged,
        flagged_reason: lu.flagged_reason,
        pos: lu.pos,
      })),
      verbs: Array.from(
        new Map(
          frame.sense_concepts
            .flatMap(sfLink => sfLink.senses.lexical_unit_senses ?? [])
            .filter(lus => lus.lexical_units.pos === 'verb')
            .map(lus => [lus.lexical_units.id.toString(), lus.lexical_units])
        ).values()
      ).map((verb: any) => ({
        id: verb.id.toString(),
        code: verb.code,
        legacy_id: verb.legacy_id,
        gloss: verb.gloss,
        lemmas: verb.lemmas,
        src_lemmas: verb.src_lemmas,
        examples: verb.examples,
        flagged: verb.flagged,
        flagged_reason: verb.flagged_reason,
      })),
      relations: [
        ...frame.concept_relations_concept_relations_parent_idToconcepts.map(rel => ({
          id: rel.id.toString(),
          type: rel.type,
          locked: rel.locked,
          direction: 'outgoing' as const,
          target: {
            id: rel.concepts_concept_relations_child_idToconcepts.id.toString(),
            label: rel.concepts_concept_relations_child_idToconcepts.label,
            short_definition: rel.concepts_concept_relations_child_idToconcepts.short_definition,
            descendant_count: rel.concepts_concept_relations_child_idToconcepts.descendant_count,
            state_kind: rel.concepts_concept_relations_child_idToconcepts.state_kind,
          },
        })),
        ...frame.concept_relations_concept_relations_child_idToconcepts.map(rel => ({
          id: rel.id.toString(),
          type: rel.type,
          locked: rel.locked,
          direction: 'incoming' as const,
          source: {
            id: rel.concepts_concept_relations_parent_idToconcepts.id.toString(),
            label: rel.concepts_concept_relations_parent_idToconcepts.label,
            short_definition: rel.concepts_concept_relations_parent_idToconcepts.short_definition,
            descendant_count: rel.concepts_concept_relations_parent_idToconcepts.descendant_count,
            state_kind: rel.concepts_concept_relations_parent_idToconcepts.state_kind,
          },
        })),
      ],
    };

    const { entity: graphNodeWithPending, pending: pendingInfo } = await applyPendingToEntity(
      graphNode,
      'frame',
      id
    );

    const pendingRelationChanges = await getPendingRelationChanges(id);

    return NextResponse.json({
      ...graphNodeWithPending,
      pending: pendingInfo,
      pendingRelationChanges,
    });
  } catch (error) {
    console.error('[API] Error fetching concept graph:', error);
    return NextResponse.json(
      { error: 'Failed to fetch concept graph' },
      { status: 500 }
    );
  }
}
