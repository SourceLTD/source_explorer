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
                frame_sense_frames: {
                  include: {
                    frames: { select: { id: true, label: true, code: true } },
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
      subtype: frame.subtype,
      disable_healthcheck: frame.disable_healthcheck,
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
      senses: frame.frame_sense_frames.map(sfLink => {
        const sense = sfLink.frame_senses;
        const senseFrames = (sense.frame_sense_frames ?? []).map(fsf => ({
          id: fsf.frames.id.toString(),
          label: fsf.frames.label,
          code: fsf.frames.code,
        }));
        const frameWarning = senseFrames.length === 0
          ? 'none' as const
          : senseFrames.length > 1
            ? 'multiple' as const
            : null;
        return {
          id: sense.id.toString(),
          pos: sense.pos,
          definition: sense.definition,
          frame_type: sense.frame_type,
          lemmas: sense.lemmas,
          confidence: sense.confidence,
          type_dispute: sense.type_dispute,
          causative: sense.causative,
          inchoative: sense.inchoative,
          perspectival: sense.perspectival,
          frames: senseFrames,
          frameWarning,
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
          frame.frame_sense_frames
            .flatMap(sfLink => sfLink.frame_senses.lexical_unit_senses ?? [])
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
          frame.frame_sense_frames
            .flatMap(sfLink => sfLink.frame_senses.lexical_unit_senses ?? [])
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
