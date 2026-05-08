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

    const frame = await prisma.frames.findUnique({
      where: { id },
      include: {
        frame_roles: {
          orderBy: {
            id: 'asc',
          },
        },
        frame_sense_frames: {
          include: {
            frame_senses: {
              include: {
                frame_sense_frames: true,
                lexical_unit_senses: {
                  where: { lexical_units: { deleted: false } },
                  include: { lexical_units: true },
                },
              },
            },
          },
          take: 100,
        },
        frame_relations_frame_relations_source_idToframes: {
          where: { frames_frame_relations_target_idToframes: { deleted: false } },
          include: {
            frames_frame_relations_target_idToframes: {
              include: {
                frame_roles: true,
              },
            },
          },
        },
        frame_relations_frame_relations_target_idToframes: {
          where: { frames_frame_relations_source_idToframes: { deleted: false } },
          include: {
            frames_frame_relations_source_idToframes: {
              include: {
                frame_roles: true,
              },
            },
          },
        },
      },
    });

    if (!frame || frame.deleted) {
      return NextResponse.json(
        { error: 'Frame not found' },
        { status: 404 }
      );
    }

    const frameRecipeData = {
      frame: {
        id: frame.id.toString(),
        label: frame.label,
        definition: frame.definition,
        short_definition: frame.short_definition,
        flagged: frame.flagged,
        flagged_reason: frame.flagged_reason,
        frame_type: frame.frame_type,
        subtype: frame.subtype,
        disable_healthcheck: frame.disable_healthcheck,
        vendler: frame.vendler,
        multi_perspective: frame.multi_perspective,
        wikidata_id: frame.wikidata_id,
        recipe: frame.recipe,
      },
      roles: frame.frame_roles.map(role => ({
        id: role.id.toString(),
        label: role.label,
        description: role.description,
        notes: role.notes,
        main: role.main,
        examples: role.examples,
        fillers: role.fillers,
        groups: [],
      })),
      senses: frame.frame_sense_frames.map(sfLink => {
        const sense = sfLink.frame_senses;
        const senseFrameCount = (sense.frame_sense_frames ?? []).length;
        const frameWarning = senseFrameCount === 0
          ? 'none' as const
          : senseFrameCount > 1
            ? 'multiple' as const
            : null;
        return {
          id: sense.id.toString(),
          pos: sense.pos,
          definition: sense.definition,
          frame_type: sense.frame_type,
          confidence: sense.confidence,
          type_dispute: sense.type_dispute,
          causative: sense.causative,
          inchoative: sense.inchoative,
          perspectival: sense.perspectival,
          frameWarning,
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
          frame.frame_sense_frames
            .flatMap(sfLink => sfLink.frame_senses.lexical_unit_senses ?? [])
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
          frame.frame_sense_frames
            .flatMap(sfLink => sfLink.frame_senses.lexical_unit_senses ?? [])
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
        parent_of: frame.frame_relations_frame_relations_source_idToframes
          .filter(rel => rel.type === 'parent_of')
          .map(rel => ({
            id: rel.frames_frame_relations_target_idToframes.id.toString(),
            label: rel.frames_frame_relations_target_idToframes.label,
            short_definition: rel.frames_frame_relations_target_idToframes.short_definition,
            roles: rel.frames_frame_relations_target_idToframes.frame_roles.map(r => ({
              id: r.id.toString(),
              label: r.label,
              description: r.description,
              main: r.main,
            })),
          })),
        child_of: frame.frame_relations_frame_relations_target_idToframes
          .filter(rel => rel.type === 'parent_of')
          .map(rel => ({
            id: rel.frames_frame_relations_source_idToframes.id.toString(),
            label: rel.frames_frame_relations_source_idToframes.label,
            short_definition: rel.frames_frame_relations_source_idToframes.short_definition,
          })),
      },
    };

    const { searchParams } = new URL(request.url);
    const skipCache = searchParams.has('t');

    if (skipCache) {
      return NextResponse.json(frameRecipeData, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
    }

    return NextResponse.json(frameRecipeData, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error('[API] Error fetching frame recipes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch frame recipe data' },
      { status: 500 }
    );
  }
}
