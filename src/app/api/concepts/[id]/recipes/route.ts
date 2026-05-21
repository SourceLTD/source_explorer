import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
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
                sense_concepts: true,
                lexical_unit_senses: {
                  where: { lexical_units: { deleted: false } },
                  include: { lexical_units: true },
                },
              },
            },
          },
          take: 100,
        },
        concept_relations_concept_relations_parent_idToconcepts: {
          where: { concepts_concept_relations_child_idToconcepts: { deleted: false } },
          include: {
            concepts_concept_relations_child_idToconcepts: {
              include: {
                properties: true,
              },
            },
          },
        },
        concept_relations_concept_relations_child_idToconcepts: {
          where: { concepts_concept_relations_parent_idToconcepts: { deleted: false } },
          include: {
            concepts_concept_relations_parent_idToconcepts: {
              include: {
                properties: true,
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

    const conceptRecipeData = {
      concept: {
        id: frame.id.toString(),
        label: frame.label,
        definition: frame.definition,
        short_definition: frame.short_definition,
        flagged: frame.flagged,
        flagged_reason: frame.flagged_reason,
        archetype: frame.archetype,
        subtype: frame.subtype,
        disable_healthcheck: frame.disable_healthcheck,
        vendler: frame.vendler,
        multi_perspective: frame.multi_perspective,
        wikidata_id: frame.wikidata_id,
        recipe: frame.recipe,
      },
      properties: frame.properties.map(role => ({
        id: role.id.toString(),
        label: role.label,
        description: role.description,
        notes: role.notes,
        main: role.main,
        examples: role.examples,
        fillers: role.fillers,
        groups: [],
      })),
      senses: frame.sense_concepts.map(sfLink => {
        const sense = sfLink.senses;
        const senseConceptCount = (sense.sense_concepts ?? []).length;
        const conceptWarning = senseConceptCount === 0
          ? 'none' as const
          : senseConceptCount > 1
            ? 'multiple' as const
            : null;
        return {
          id: sense.id.toString(),
          pos: sense.pos,
          definition: sense.definition,
          archetype: sense.archetype,
          confidence: sense.confidence,
          type_dispute: sense.type_dispute,
          causative: sense.causative,
          inchoative: sense.inchoative,
          perspectival: sense.perspectival,
          conceptWarning,
          lexical_units: (sense.lexical_unit_senses ?? []).map(lus => ({
            id: lus.lexical_units.id.toString(),
            code: lus.lexical_units.code,
            lemmas: lus.lexical_units.lemmas,
            gloss: lus.lexical_units.gloss,
            pos: lus.lexical_units.pos,
            vendler_class: lus.lexical_units.vendler_class,
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
        lemmas: lu.lemmas,
        gloss: lu.gloss,
        pos: lu.pos,
        vendler_class: lu.vendler_class,
        roles: [],
        role_groups: [],
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
        lemmas: verb.lemmas,
        gloss: verb.gloss,
        vendler_class: verb.vendler_class,
        roles: [],
        role_groups: [],
      })),
      relations: {
        parent_of: frame.concept_relations_concept_relations_parent_idToconcepts
          .filter(rel => rel.type === 'parent_of')
          .map(rel => ({
            id: rel.concepts_concept_relations_child_idToconcepts.id.toString(),
            label: rel.concepts_concept_relations_child_idToconcepts.label,
            short_definition: rel.concepts_concept_relations_child_idToconcepts.short_definition,
            roles: rel.concepts_concept_relations_child_idToconcepts.properties.map(r => ({
              id: r.id.toString(),
              label: r.label,
              description: r.description,
              main: r.main,
            })),
          })),
        child_of: frame.concept_relations_concept_relations_child_idToconcepts
          .filter(rel => rel.type === 'parent_of')
          .map(rel => ({
            id: rel.concepts_concept_relations_parent_idToconcepts.id.toString(),
            label: rel.concepts_concept_relations_parent_idToconcepts.label,
            short_definition: rel.concepts_concept_relations_parent_idToconcepts.short_definition,
          })),
      },
    };

    const { searchParams } = new URL(request.url);
    const skipCache = searchParams.has('t');

    if (skipCache) {
      return NextResponse.json(conceptRecipeData, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
    }

    return NextResponse.json(conceptRecipeData, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error('[API] Error fetching concept recipes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch concept recipe data' },
      { status: 500 }
    );
  }
}
