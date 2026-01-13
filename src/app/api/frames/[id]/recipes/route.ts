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
          include: {
            role_types: true,
          },
          orderBy: {
            id: 'asc',
          },
        },
        lexical_units: {
          where: {
            deleted: false,
          },
          take: 50,
        },
        frame_relations_frame_relations_source_idToframes: {
          include: {
            frames_frame_relations_target_idToframes: {
              include: {
                frame_roles: {
                  include: {
                    role_types: true,
                  },
                },
              },
            },
          },
        },
        frame_relations_frame_relations_target_idToframes: {
          include: {
            frames_frame_relations_source_idToframes: {
              include: {
                frame_roles: {
                  include: {
                    role_types: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!frame) {
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
        prototypical_synset: frame.prototypical_synset,
        flagged: frame.flagged,
        flagged_reason: frame.flagged_reason,
      },
      roles: frame.frame_roles.map(role => ({
        id: role.id.toString(),
        role_type: {
          id: role.role_types.id.toString(),
          code: role.role_types.code,
          label: role.role_types.label,
          generic_description: role.role_types.generic_description,
        },
        description: role.description,
        notes: role.notes,
        main: role.main,
        examples: role.examples,
        label: role.label,
        groups: [], // role_groups were deleted from DB
      })),
      lexical_units: frame.lexical_units.map(lu => ({
        id: lu.id.toString(),
        code: lu.code,
        lemmas: lu.lemmas,
        gloss: lu.gloss,
        pos: lu.pos,
        vendler_class: lu.vendler_class,
        roles: [], // verb roles were deleted from DB
        role_groups: [],
      })),
      // Legacy verbs alias
      verbs: frame.lexical_units.filter(lu => lu.pos === 'verb').map(verb => ({
        id: verb.id.toString(),
        code: verb.code,
        lemmas: verb.lemmas,
        gloss: verb.gloss,
        vendler_class: verb.vendler_class,
        roles: [],
        role_groups: [],
      })),
      relations: {
        inherits_from: frame.frame_relations_frame_relations_source_idToframes
          .filter(rel => rel.type === 'inherits_from')
          .map(rel => ({
            id: rel.frames_frame_relations_target_idToframes.id.toString(),
            label: rel.frames_frame_relations_target_idToframes.label,
            short_definition: rel.frames_frame_relations_target_idToframes.short_definition,
            roles: rel.frames_frame_relations_target_idToframes.frame_roles.map(r => ({
              id: r.id.toString(),
              role_type_label: r.role_types.label,
              description: r.description,
              main: r.main,
            })),
          })),
        inherited_by: frame.frame_relations_frame_relations_target_idToframes
          .filter(rel => rel.type === 'inherits_from')
          .map(rel => ({
            id: rel.frames_frame_relations_source_idToframes.id.toString(),
            label: rel.frames_frame_relations_source_idToframes.label,
            short_definition: rel.frames_frame_relations_source_idToframes.short_definition,
          })),
        uses: frame.frame_relations_frame_relations_source_idToframes
          .filter(rel => rel.type === 'uses')
          .map(rel => ({
            id: rel.frames_frame_relations_target_idToframes.id.toString(),
            label: rel.frames_frame_relations_target_idToframes.label,
            short_definition: rel.frames_frame_relations_target_idToframes.short_definition,
          })),
        used_by: frame.frame_relations_frame_relations_target_idToframes
          .filter(rel => rel.type === 'uses')
          .map(rel => ({
            id: rel.frames_frame_relations_source_idToframes.id.toString(),
            label: rel.frames_frame_relations_source_idToframes.label,
            short_definition: rel.frames_frame_relations_source_idToframes.short_definition,
          })),
        other: [
          ...frame.frame_relations_frame_relations_source_idToframes
            .filter(rel => !['inherits_from', 'uses'].includes(rel.type))
            .map(rel => ({
              type: rel.type,
              direction: 'outgoing' as const,
              frame: {
                id: rel.frames_frame_relations_target_idToframes.id.toString(),
                label: rel.frames_frame_relations_target_idToframes.label,
                short_definition: rel.frames_frame_relations_target_idToframes.short_definition,
              },
            })),
          ...frame.frame_relations_frame_relations_target_idToframes
            .filter(rel => !['inherits_from', 'uses'].includes(rel.type))
            .map(rel => ({
              type: rel.type,
              direction: 'incoming' as const,
              frame: {
                id: rel.frames_frame_relations_source_idToframes.id.toString(),
                label: rel.frames_frame_relations_source_idToframes.label,
                short_definition: rel.frames_frame_relations_source_idToframes.short_definition,
              },
            })),
        ],
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
