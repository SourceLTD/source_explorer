import type { llm_job_items } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { FlaggingResponse, EditResponse, ReallocationResponse, AllocationResponse, SplitResponse, ChangeReviewResponse } from './schema';
import type { JobScope, LexicalUnitSummary } from './types';
import {
  createChangesetFromUpdate,
  createChangesetFromCreate,
  EntityType,
  ENTITY_TYPE_TO_TABLE,
  addComment,
} from '@/lib/version-control';

/**
 * Apply job result by creating changesets (version control).
 */
export async function applyJobResult(
  item: llm_job_items,
  entry: LexicalUnitSummary,
  result: FlaggingResponse | EditResponse | ReallocationResponse | AllocationResponse | SplitResponse | ChangeReviewResponse,
  jobLabel: string | null,
  submittedBy: string,
  jobType: 'moderation' | 'editing' | 'reallocation' | 'allocate' | 'split' | 'review',
  jobScope?: JobScope,
  jobConfig?: Record<string, unknown>
): Promise<void> {
  const llmJobId = item.job_id;

  if (jobType === 'reallocation') {
    await applyReallocationResult(item, result as ReallocationResponse, submittedBy, llmJobId, jobConfig);
  } else if (jobType === 'editing') {
    await applyEditingResult(item, entry, result as EditResponse, submittedBy, llmJobId);
  } else if (jobType === 'allocate') {
    await applyAllocationResult(item, entry, result as AllocationResponse, submittedBy, llmJobId);
  } else if (jobType === 'split') {
    await applySplitResult(item, result as SplitResponse, llmJobId);
  } else if (jobType === 'review') {
    // Review jobs are handled by Lambda webhooks - they post comments with AI revisions
    // This handler just marks the item as succeeded
    await applyReviewResult(item, result as ChangeReviewResponse, llmJobId);
  } else {
    await applyModerationResult(item, result as FlaggingResponse, jobLabel, submittedBy, llmJobId, jobScope);
  }
}

/**
 * Apply reallocation job result - reallocate units to different frames.
 */
async function applyReallocationResult(
  item: llm_job_items,
  result: ReallocationResponse,
  submittedBy: string,
  llmJobId: bigint,
  jobConfig?: Record<string, unknown>
): Promise<void> {
  const { reallocations, confidence, notes } = result;
  let hasEdits = false;

  // Get the reallocation entity types from config
  const entityTypes = (jobConfig?.reallocationEntityTypes as string[] | undefined) ?? ['verb', 'noun', 'adjective', 'adverb'];

  const createdChangesets: { id: bigint }[] = [];

  if (reallocations && Object.keys(reallocations).length > 0) {
    let reallocationCount = 0;

    for (const [entryCode, targetFrameId] of Object.entries(reallocations)) {
      const targetFrame = await prisma.frames.findFirst({
        where: { id: BigInt(targetFrameId), deleted: false },
        select: { id: true },
      });

      if (!targetFrame) {
        console.warn(`[LLM] Job ${item.job_id} suggested non-existent or deleted target frame ${targetFrameId} for entry ${entryCode}`);
        continue;
      }

      // Find the entry by code in lexical_units
      const lu = await prisma.lexical_units.findFirst({ 
        where: { 
          code: entryCode, 
          deleted: false,
          pos: { in: entityTypes.map(t => (t.endsWith('s') ? t.slice(0, -1) : t) as 'verb' | 'noun' | 'adjective' | 'adverb') },
        } 
      });

      if (lu && lu.frame_id !== BigInt(targetFrameId)) {
        const changeset = await createChangesetFromUpdate(
          'lexical_unit',
          lu.id,
          lu as unknown as Record<string, unknown>,
          { frame_id: BigInt(targetFrameId) },
          submittedBy,
          llmJobId,
        );
        createdChangesets.push(changeset);
        reallocationCount++;
        hasEdits = true;
      } else if (!lu) {
        console.warn(`[LLM] Job ${item.job_id} suggested reallocation for unknown entry ${entryCode}`);
      }
    }

    if (reallocationCount > 0) {
      console.log(`[LLM] Job ${item.job_id} created ${reallocationCount} reallocation changesets`);
    }
  }

  // Post AI notes as discussion comments
  if (notes && notes.trim() && createdChangesets.length > 0) {
    for (const changeset of createdChangesets) {
      await addComment({
        changeset_id: changeset.id,
        author: 'system:llm-agent',
        content: notes.trim(),
      });
    }
  }

  await prisma.llm_job_items.update({
    where: { id: item.id },
    data: {
      status: 'succeeded',
      has_edits: hasEdits,
      flags: {
        confidence,
        notes,
        staged_at: new Date().toISOString(),
        llm_job_id: llmJobId.toString(),
        reallocations: reallocations,
      },
      completed_at: new Date(),
    },
  });
}

/**
 * Apply editing job result - edit fields and optionally reallocate.
 */
async function applyEditingResult(
  item: llm_job_items,
  entry: LexicalUnitSummary,
  result: EditResponse,
  submittedBy: string,
  llmJobId: bigint
): Promise<void> {
  const { edits, frame_id, entry_reallocations, relations, confidence, notes } = result;
  let hasEdits = false;

  const entityType: EntityType | null = item.lexical_unit_id ? 'lexical_unit' : 
                   item.frame_id ? 'frame' : null;
  const entityId = item.lexical_unit_id || item.frame_id;

  if (entityType && entityId) {
    const table = ENTITY_TYPE_TO_TABLE[entityType];
    const currentEntity = await (prisma[table as keyof typeof prisma] as any).findUnique({
      where: { id: entityId },
    });

    if (currentEntity) {
      const validUpdates: Record<string, unknown> = {};

      // 1. Handle field edits
      if (edits && Object.keys(edits).length > 0) {
        for (const [field, newValue] of Object.entries(edits)) {
          if (field in currentEntity && JSON.stringify(currentEntity[field]) !== JSON.stringify(newValue)) {
            validUpdates[field] = newValue;
          }
        }
      }

      // 2. Handle frame_id reallocation (for lexical unit jobs)
      if (frame_id !== undefined && frame_id !== null && entityType !== 'frame') {
        const targetFrame = await prisma.frames.findFirst({
          where: { id: BigInt(frame_id), deleted: false },
          select: { id: true },
        });

        if (targetFrame) {
          const currentFrameId = (currentEntity as any).frame_id;
          if (currentFrameId === null || BigInt(currentFrameId) !== BigInt(frame_id)) {
            validUpdates['frame_id'] = BigInt(frame_id);
          }
        } else {
          console.warn(`[LLM] Job ${item.job_id} suggested non-existent or deleted frame_id: ${frame_id}`);
        }
      }

      // 3. Handle entry_reallocations for frame jobs
      if (entityType === 'frame' && entry_reallocations && Object.keys(entry_reallocations).length > 0) {
        let reallocationCount = 0;
        
        for (const [entryCode, targetFrameId] of Object.entries(entry_reallocations)) {
          const targetFrame = await prisma.frames.findFirst({
            where: { id: BigInt(targetFrameId), deleted: false },
            select: { id: true },
          });

          if (!targetFrame) {
            console.warn(`[LLM] Job ${item.job_id} suggested non-existent or deleted target frame ${targetFrameId} for entry ${entryCode}`);
            continue;
          }

          const lu = await prisma.lexical_units.findFirst({ 
            where: { code: entryCode, frame_id: entityId, deleted: false } 
          });

          if (lu) {
            await createChangesetFromUpdate(
              'lexical_unit',
              lu.id,
              lu as unknown as Record<string, unknown>,
              { frame_id: BigInt(targetFrameId) },
              submittedBy,
              llmJobId,
            );
            reallocationCount++;
            hasEdits = true;
          } else {
            console.warn(`[LLM] Job ${item.job_id} suggested reallocation for unknown entry ${entryCode} in frame ${entityId}`);
          }
        }

        if (reallocationCount > 0) {
          console.log(`[LLM] Job ${item.job_id} created ${reallocationCount} entry reallocation changesets for frame ${entityId}`);
        }
      }

      if (Object.keys(validUpdates).length > 0) {
        const changeset = await createChangesetFromUpdate(
          entityType as EntityType,
          entityId,
          currentEntity as Record<string, unknown>,
          validUpdates,
          submittedBy,
          llmJobId,
        );
        hasEdits = true;

        if (notes && notes.trim()) {
          await addComment({
            changeset_id: changeset.id,
            author: 'system:llm-agent',
            content: notes.trim(),
          });
        }
      }

      // 4. Handle relations
      if (entityType === 'lexical_unit' && relations && Object.keys(relations).length > 0) {
        for (const [relType, targetCodes] of Object.entries(relations)) {
          for (const targetCode of targetCodes) {
            const targetLu = await prisma.lexical_units.findFirst({
              where: { code: targetCode, deleted: false },
              select: { id: true }
            });

            if (targetLu) {
              // Check if relation already exists in the main table
              const existingRel = await prisma.lexical_unit_relations.findUnique({
                where: {
                  source_id_type_target_id: {
                    source_id: entityId,
                    target_id: targetLu.id,
                    type: relType as any
                  }
                }
              });

              if (!existingRel) {
                // Stage a new relation creation
                await createChangesetFromCreate(
                  'lexical_unit_relation',
                  {
                    source_id: entityId,
                    target_id: targetLu.id,
                    type: relType
                  },
                  submittedBy,
                  llmJobId
                );
                hasEdits = true;
                console.log(`[LLM] Job ${item.job_id} staged new ${relType} relation from ${entry.code} to ${targetCode}`);
              }
            } else {
              console.warn(`[LLM] Job ${item.job_id} suggested relation to non-existent or deleted entry ${targetCode}`);
            }
          }
        }
      }
    }
  }

  await prisma.llm_job_items.update({
    where: { id: item.id },
    data: {
      status: 'succeeded',
      has_edits: hasEdits,
      flags: {
        confidence,
        notes,
        staged_at: new Date().toISOString(),
        llm_job_id: llmJobId.toString(),
        suggested_relations: relations,
        suggested_frame_id: frame_id,
        entry_reallocations: entry_reallocations,
      },
      completed_at: new Date(),
    },
  });
}

/**
 * Apply allocation job result - recommend the best frame for a lexical unit.
 */
async function applyAllocationResult(
  item: llm_job_items,
  entry: LexicalUnitSummary,
  result: AllocationResponse,
  submittedBy: string,
  llmJobId: bigint
): Promise<void> {
  const { recommended_frame_id, keep_current, confidence, reasoning } = result;
  let hasEdits = false;

  const entityId = item.lexical_unit_id;

  if (!keep_current && recommended_frame_id !== null && entityId) {
    const targetFrame = await prisma.frames.findFirst({
      where: { id: BigInt(recommended_frame_id), deleted: false },
      select: { id: true, label: true },
    });

    if (targetFrame) {
      const currentEntity = await prisma.lexical_units.findFirst({
        where: { id: entityId, deleted: false },
      });

      if (currentEntity) {
        const currentFrameId = currentEntity.frame_id;
        if (currentFrameId === null || BigInt(currentFrameId) !== BigInt(recommended_frame_id)) {
          const changeset = await createChangesetFromUpdate(
            'lexical_unit',
            entityId,
            currentEntity as unknown as Record<string, unknown>,
            { frame_id: BigInt(recommended_frame_id) },
            submittedBy,
            llmJobId,
          );
          hasEdits = true;

          if (reasoning && reasoning.trim()) {
            await addComment({
              changeset_id: changeset.id,
              author: 'system:llm-agent',
              content: reasoning.trim(),
            });
          }
        }
      }
    } else {
      console.warn(`[LLM] Allocation job ${item.job_id} suggested non-existent or deleted frame_id: ${recommended_frame_id}`);
    }
  }

  await prisma.llm_job_items.update({
    where: { id: item.id },
    data: {
      status: 'succeeded',
      has_edits: hasEdits,
      flags: {
        recommended_frame_id,
        keep_current,
        confidence,
        reasoning,
        staged_at: new Date().toISOString(),
        llm_job_id: llmJobId.toString(),
      },
      completed_at: new Date(),
    },
  });
}

/**
 * Apply moderation/flagging job result.
 */
async function applyModerationResult(
  item: llm_job_items,
  result: FlaggingResponse,
  jobLabel: string | null,
  submittedBy: string,
  llmJobId: bigint,
  jobScope?: JobScope
): Promise<void> {
  const flagged = Boolean(result.flagged);
  const rawReason = (result.flagged_reason ?? '').trim();
  const prefixedReason = rawReason
    ? (jobLabel ? `Via ${jobLabel}: ${rawReason}` : rawReason)
    : null;

  let flagTarget: 'frame' | 'lexical_unit' | 'both' = 'lexical_unit';
  if (jobScope?.kind === 'frame_ids') {
    flagTarget = jobScope.flagTarget ?? 'lexical_unit';
  }

  const createModerationChangeset = async (
    entityType: EntityType,
    entityId: bigint,
    currentEntity: Record<string, unknown>
  ) => {
    const updates: Record<string, unknown> = {
      flagged,
      flagged_reason: prefixedReason,
    };

    await createChangesetFromUpdate(
      entityType,
      entityId,
      currentEntity,
      updates,
      submittedBy,
      llmJobId,
    );
  };

  if (item.lexical_unit_id) {
    const lu = await prisma.lexical_units.findUnique({
      where: { id: item.lexical_unit_id },
    });
    if (lu) {
      await createModerationChangeset('lexical_unit', item.lexical_unit_id, lu as unknown as Record<string, unknown>);
    }
  } else if (item.frame_id) {
    const frameId = item.frame_id;
    
    // Flag the frame if target is 'frame' or 'both'
    if (flagTarget === 'frame' || flagTarget === 'both') {
      const frame = await prisma.frames.findFirst({
        where: { id: frameId, deleted: false },
      }) as any;
      if (frame) {
        await createModerationChangeset('frame', frameId, frame as Record<string, unknown>);
      }
    }
    
    // Flag associated lexical units if target is 'lexical_unit' or 'both'
    if (flagTarget === 'lexical_unit' || flagTarget === 'both') {
      const lexicalUnits = await prisma.lexical_units.findMany({
        where: { 
          frame_id: frameId,
          deleted: false,
        },
      });
      for (const lu of lexicalUnits) {
        await createModerationChangeset('lexical_unit', lu.id, lu as unknown as Record<string, unknown>);
      }
    }
  }

  await prisma.llm_job_items.update({
    where: { id: item.id },
    data: {
      status: 'succeeded',
      flagged,
      flags: {
        flagged,
        flagged_reason: prefixedReason,
        confidence: result.confidence ?? null,
        notes: result.notes ?? null,
        staged_at: new Date().toISOString(),
        llm_job_id: llmJobId.toString(),
      },
      completed_at: new Date(),
    },
  });
}

/**
 * Apply split job result - log the summary of the split operation.
 * 
 * Split jobs are agentic - the AI uses MCP tools (create_frame, edit_frames, 
 * edit_lexical_units) to perform the actual split. The changesets are created
 * by those tools directly, so this handler just logs the summary.
 */
async function applySplitResult(
  item: llm_job_items,
  result: SplitResponse,
  llmJobId: bigint
): Promise<void> {
  const { 
    split_completed, 
    new_frames, 
    original_frame_deleted, 
    delete_changeset_id,
    reallocation_changeset_ids,
    confidence, 
    reasoning 
  } = result;

  const hasEdits = split_completed && new_frames.length > 0;

  if (split_completed) {
    console.log(
      `[LLM] Split job ${item.job_id} completed: created ${new_frames.length} new frames, ` +
      `${reallocation_changeset_ids?.length ?? 0} reallocations, ` +
      `original deleted: ${original_frame_deleted}`
    );
  } else {
    console.warn(`[LLM] Split job ${item.job_id} did not complete successfully`);
  }

  await prisma.llm_job_items.update({
    where: { id: item.id },
    data: {
      status: split_completed ? 'succeeded' : 'failed',
      has_edits: hasEdits,
      flags: {
        split_completed,
        new_frames: new_frames.map((f: SplitResponse['new_frames'][number]) => ({
          label: f.label,
          changeset_id: f.changeset_id,
          definition: f.definition,
          assigned_items_count: f.assigned_items_count,
        })),
        original_frame_deleted,
        delete_changeset_id,
        reallocation_changeset_ids,
        confidence,
        reasoning,
        staged_at: new Date().toISOString(),
        llm_job_id: llmJobId.toString(),
      },
      completed_at: new Date(),
    },
  });
}

/**
 * Apply review job result - store the AI's recommendation.
 * 
 * Review jobs provide recommendations for pending changesets. The Lambda webhook
 * handles posting comments with AI revisions. This handler just stores the result
 * and marks the job item as complete.
 */
async function applyReviewResult(
  item: llm_job_items,
  result: ChangeReviewResponse,
  llmJobId: bigint
): Promise<void> {
  const { action, modifications, justification, confidence } = result;

  await prisma.llm_job_items.update({
    where: { id: item.id },
    data: {
      status: 'succeeded',
      has_edits: action === 'modify' && !!modifications && Object.keys(modifications).length > 0,
      flags: {
        action,
        modifications,
        justification,
        confidence,
        processed_at: new Date().toISOString(),
        llm_job_id: llmJobId.toString(),
      },
      completed_at: new Date(),
    },
  });
}
