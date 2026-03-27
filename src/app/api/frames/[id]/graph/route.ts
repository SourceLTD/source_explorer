import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applyPendingToEntity, getPendingRelationChanges } from '@/lib/version-control';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
        frame_lexical_units: {
          where: { lexical_units: { deleted: false } },
          include: {
            lexical_units: {
              select: {
                id: true,
                code: true,
                gloss: true,
                lemmas: true,
                examples: true,
                flagged: true,
                flagged_reason: true,
                pos: true,
              },
            },
          },
          take: 100,
        },
        frame_relations_frame_relations_source_idToframes: {
          where: {
            frames_frame_relations_target_idToframes: {
              deleted: false,
            },
          },
          include: {
            frames_frame_relations_target_idToframes: {
              select: {
                id: true,
                label: true,
                short_definition: true,
              },
            },
          },
        },
        frame_relations_frame_relations_target_idToframes: {
          where: {
            frames_frame_relations_source_idToframes: {
              deleted: false,
            },
          },
          include: {
            frames_frame_relations_source_idToframes: {
              select: {
                id: true,
                label: true,
                short_definition: true,
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

    const graphNode = {
      id: frame.id.toString(),
      numericId: frame.id.toString(),
      pos: 'frames' as const,
      label: frame.label,
      gloss: frame.definition,
      short_definition: frame.short_definition,
      frame_type: frame.frame_type,
      vendler: frame.vendler,
      multi_perspective: frame.multi_perspective,
      wikidata_id: frame.wikidata_id,
      recipe: frame.recipe,
      recipe_graph: frame.recipe_graph,
      roles: frame.frame_roles.map(role => ({
        id: role.id.toString(),
        frame_id: role.frame_id.toString(),
        description: role.description,
        notes: role.notes,
        main: role.main,
        examples: role.examples,
        label: role.label,
        fillers: role.fillers,
      })),
      lexical_units: frame.frame_lexical_units.map((flu: any) => flu.lexical_units).map((lu: any) => ({
        id: lu.id.toString(),
        code: lu.code,
        gloss: lu.gloss,
        lemmas: lu.lemmas,
        examples: lu.examples,
        flagged: lu.flagged,
        flagged_reason: lu.flagged_reason,
        pos: lu.pos,
      })),
      // Legacy verbs alias
      verbs: frame.frame_lexical_units.map((flu: any) => flu.lexical_units).filter((lu: any) => lu.pos === 'verb').map((verb: any) => ({
        id: verb.id.toString(),
        code: verb.code,
        gloss: verb.gloss,
        lemmas: verb.lemmas,
        examples: verb.examples,
        flagged: verb.flagged,
        flagged_reason: verb.flagged_reason,
      })),
      relations: [
        ...frame.frame_relations_frame_relations_source_idToframes.map(rel => ({
          type: rel.type,
          direction: 'outgoing' as const,
          target: {
            id: rel.frames_frame_relations_target_idToframes.id.toString(),
            label: rel.frames_frame_relations_target_idToframes.label,
            short_definition: rel.frames_frame_relations_target_idToframes.short_definition,
          },
        })),
        ...frame.frame_relations_frame_relations_target_idToframes.map(rel => ({
          type: rel.type,
          direction: 'incoming' as const,
          source: {
            id: rel.frames_frame_relations_source_idToframes.id.toString(),
            label: rel.frames_frame_relations_source_idToframes.label,
            short_definition: rel.frames_frame_relations_source_idToframes.short_definition,
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
    console.error('[API] Error fetching frame graph:', error);
    return NextResponse.json(
      { error: 'Failed to fetch frame graph' },
      { status: 500 }
    );
  }
}
