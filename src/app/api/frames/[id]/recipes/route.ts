import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Force dynamic rendering - no static optimization
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: idParam } = await params;
    const id = BigInt(idParam);

    // Fetch the frame with all related data
    const frame = await prisma.frames.findUnique({
      where: { id },
      include: {
        // Frame roles with their role types
        frame_roles: {
          include: {
            role_types: true,
            role_group_members: {
              include: {
                role_groups: true,
              },
            },
          },
          orderBy: {
            id: 'asc',
          },
        },
        // Verbs using this frame with their roles
        verbs: {
          where: {
            deleted: false,
          },
          include: {
            roles: {
              include: {
                role_types: true,
              },
            },
            role_groups: {
              include: {
                role_group_members: true,
              },
            },
          },
          take: 50, // Limit for performance
        },
        // Frame relations - outgoing (this frame -> other frames)
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
        // Frame relations - incoming (other frames -> this frame)
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

    // Build the frame recipe data structure
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
      // Frame roles with their types and groupings
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
        // Groups this role belongs to
        groups: role.role_group_members.map(rgm => ({
          id: rgm.role_groups.id.toString(),
          description: rgm.role_groups.description,
          require_at_least_one: rgm.role_groups.require_at_least_one,
        })),
      })),
      // Verbs using this frame with their role mappings
      verbs: frame.verbs.map(verb => ({
        id: verb.id.toString(),
        code: verb.code,
        lemmas: verb.lemmas,
        gloss: verb.gloss,
        vendler_class: verb.vendler_class,
        // Verb's specific roles (which should align with frame roles)
        roles: verb.roles.map(role => ({
          id: role.id.toString(),
          role_type: {
            id: role.role_types.id.toString(),
            code: role.role_types.code,
            label: role.role_types.label,
          },
          description: role.description,
          main: role.main,
          example_sentence: role.example_sentence,
        })),
        // Role groups for this verb
        role_groups: verb.role_groups.map(group => ({
          id: group.id.toString(),
          description: group.description,
          require_at_least_one: group.require_at_least_one,
          role_ids: group.role_group_members.map(m => m.role_id.toString()),
        })),
      })),
      // Related frames organized by relation type
      relations: {
        // Frames this frame inherits from
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
        // Frames that inherit from this frame
        inherited_by: frame.frame_relations_frame_relations_target_idToframes
          .filter(rel => rel.type === 'inherits_from')
          .map(rel => ({
            id: rel.frames_frame_relations_source_idToframes.id.toString(),
            label: rel.frames_frame_relations_source_idToframes.label,
            short_definition: rel.frames_frame_relations_source_idToframes.short_definition,
          })),
        // Frames this frame uses
        uses: frame.frame_relations_frame_relations_source_idToframes
          .filter(rel => rel.type === 'uses')
          .map(rel => ({
            id: rel.frames_frame_relations_target_idToframes.id.toString(),
            label: rel.frames_frame_relations_target_idToframes.label,
            short_definition: rel.frames_frame_relations_target_idToframes.short_definition,
          })),
        // Frames that use this frame
        used_by: frame.frame_relations_frame_relations_target_idToframes
          .filter(rel => rel.type === 'uses')
          .map(rel => ({
            id: rel.frames_frame_relations_source_idToframes.id.toString(),
            label: rel.frames_frame_relations_source_idToframes.label,
            short_definition: rel.frames_frame_relations_source_idToframes.short_definition,
          })),
        // Other relations (causes, precedes, see_also, etc.)
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

    // Check for cache invalidation
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


