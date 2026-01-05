import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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
          include: {
            role_types: true,
          },
          orderBy: {
            id: 'asc',
          },
        },
        verbs: {
          where: {
            deleted: false,
          },
          select: {
            id: true,
            code: true,
            gloss: true,
            lemmas: true,
            examples: true,
            flagged: true,
            flagged_reason: true,
          },
          take: 100,
        },
        frame_relations_frame_relations_source_idToframes: {
          include: {
            frames_frame_relations_target_idToframes: {
              select: {
                id: true,
                frame_name: true,
                short_definition: true,
              },
            },
          },
        },
        frame_relations_frame_relations_target_idToframes: {
          include: {
            frames_frame_relations_source_idToframes: {
              select: {
                id: true,
                frame_name: true,
                short_definition: true,
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

    // Build graph node structure
    const graphNode = {
      id: frame.id.toString(),
      pos: 'frames' as const,
      frame_name: frame.frame_name,
      gloss: frame.definition,
      short_definition: frame.short_definition,
      prototypical_synset: frame.prototypical_synset,
      roles: frame.frame_roles.map(role => ({
        id: role.id.toString(),
        frame_id: role.frame_id.toString(),
        role_type_id: role.role_type_id.toString(),
        role_type_code: role.role_types.code,
        role_type_label: role.role_types.label,
        description: role.description,
        notes: role.notes,
        main: role.main,
        examples: role.examples,
        nickname: role.nickname,
      })),
      verbs: frame.verbs.map(verb => ({
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
            frame_name: rel.frames_frame_relations_target_idToframes.frame_name,
            short_definition: rel.frames_frame_relations_target_idToframes.short_definition,
          },
        })),
        ...frame.frame_relations_frame_relations_target_idToframes.map(rel => ({
          type: rel.type,
          direction: 'incoming' as const,
          source: {
            id: rel.frames_frame_relations_source_idToframes.id.toString(),
            frame_name: rel.frames_frame_relations_source_idToframes.frame_name,
            short_definition: rel.frames_frame_relations_source_idToframes.short_definition,
          },
        })),
      ],
    };

    return NextResponse.json(graphNode);
  } catch (error) {
    console.error('[API] Error fetching frame graph:', error);
    return NextResponse.json(
      { error: 'Failed to fetch frame graph' },
      { status: 500 }
    );
  }
}

