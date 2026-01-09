import type { llm_job_items } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { FlaggingResponse, EditResponse, ReallocationResponse, AllocationResponse } from './schema';
import type { JobScope, LexicalEntrySummary } from './types';
import {
  createChangesetFromUpdate,
  EntityType,
  ENTITY_TYPE_TO_TABLE,
  addComment,
} from '@/lib/version-control';

/**
 * Apply job result by creating changesets (version control).
 * 
 * Instead of directly updating entities, this creates changesets that
 * must be reviewed and committed by an admin before they take effect.
 */
export async function applyJobResult(
  item: llm_job_items,
  entry: LexicalEntrySummary,
  result: FlaggingResponse | EditResponse | ReallocationResponse | AllocationResponse,
  jobLabel: string | null,
  submittedBy: string,
  jobType: 'moderation' | 'editing' | 'reallocation' | 'allocate',
  jobScope?: JobScope,
  jobConfig?: Record<string, unknown>
): Promise<void> {
  // Use the job ID directly for linking changesets to this LLM job
  const llmJobId = item.job_id;

  if (jobType === 'reallocation') {
    await applyReallocationResult(item, result as ReallocationResponse, submittedBy, llmJobId, jobConfig);
  } else if (jobType === 'editing') {
    await applyEditingResult(item, entry, result as EditResponse, submittedBy, llmJobId);
  } else if (jobType === 'allocate') {
    await applyAllocationResult(item, entry, result as AllocationResponse, submittedBy, llmJobId);
  } else {
    await applyModerationResult(item, result as FlaggingResponse, jobLabel, submittedBy, llmJobId, jobScope);
  }
}

/**
 * Apply reallocation job result - reallocate entries to different frames.
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

  // Get the reallocation entity types from config (defaults to all)
  const entityTypes = (jobConfig?.reallocationEntityTypes as string[] | undefined) ?? ['verbs', 'nouns', 'adjectives', 'adverbs'];

  // Track created changesets to post notes as comments
  const createdChangesets: { id: bigint }[] = [];

  if (reallocations && Object.keys(reallocations).length > 0) {
    let reallocationCount = 0;

    for (const [entryCode, targetFrameId] of Object.entries(reallocations)) {
      // Validate the target frame exists
      const targetFrame = await prisma.frames.findUnique({
        where: { id: BigInt(targetFrameId) },
        select: { id: true },
      });

      if (!targetFrame) {
        console.warn(`[LLM] Job ${item.job_id} suggested non-existent target frame ${targetFrameId} for entry ${entryCode}`);
        continue;
      }

      // Find the entry by code - only check entity types that are enabled
      const [verb, noun, adjective, adverb] = await Promise.all([
        entityTypes.includes('verbs') ? prisma.verbs.findFirst({ where: { code: entryCode, deleted: false } }) : null,
        entityTypes.includes('nouns') ? prisma.nouns.findFirst({ where: { code: entryCode, deleted: false } }) : null,
        entityTypes.includes('adjectives') ? prisma.adjectives.findFirst({ where: { code: entryCode, deleted: false } }) : null,
        entityTypes.includes('adverbs') ? prisma.adverbs.findFirst({ where: { code: entryCode, deleted: false } }) : null,
      ]);

      if (verb && verb.frame_id !== BigInt(targetFrameId)) {
        const changeset = await createChangesetFromUpdate(
          'verb',
          verb.id,
          verb as unknown as Record<string, unknown>,
          { frame_id: BigInt(targetFrameId) },
          submittedBy,
          llmJobId,
        );
        createdChangesets.push(changeset);
        reallocationCount++;
        hasEdits = true;
      } else if (noun && noun.frame_id !== BigInt(targetFrameId)) {
        const changeset = await createChangesetFromUpdate(
          'noun',
          noun.id,
          noun as unknown as Record<string, unknown>,
          { frame_id: BigInt(targetFrameId) },
          submittedBy,
          llmJobId,
        );
        createdChangesets.push(changeset);
        reallocationCount++;
        hasEdits = true;
      } else if (adjective && adjective.frame_id !== BigInt(targetFrameId)) {
        const changeset = await createChangesetFromUpdate(
          'adjective',
          adjective.id,
          adjective as unknown as Record<string, unknown>,
          { frame_id: BigInt(targetFrameId) },
          submittedBy,
          llmJobId,
        );
        createdChangesets.push(changeset);
        reallocationCount++;
        hasEdits = true;
      } else if (adverb && adverb.frame_id !== BigInt(targetFrameId)) {
        const changeset = await createChangesetFromUpdate(
          'adverb',
          adverb.id,
          adverb as unknown as Record<string, unknown>,
          { frame_id: BigInt(targetFrameId) },
          submittedBy,
          llmJobId,
        );
        createdChangesets.push(changeset);
        reallocationCount++;
        hasEdits = true;
      } else if (!verb && !noun && !adjective && !adverb) {
        console.warn(`[LLM] Job ${item.job_id} suggested reallocation for unknown entry ${entryCode}`);
      }
    }

    if (reallocationCount > 0) {
      console.log(`[LLM] Job ${item.job_id} created ${reallocationCount} reallocation changesets`);
    }
  }

  // Post AI notes as discussion comments on each created changeset
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
  entry: LexicalEntrySummary,
  result: EditResponse,
  submittedBy: string,
  llmJobId: bigint
): Promise<void> {
  const { edits, frame_id, entry_reallocations, relations, confidence, notes } = result;
  let hasEdits = false;

  const entityType = item.verb_id ? 'verb' : 
                   item.noun_id ? 'noun' :
                   item.adjective_id ? 'adjective' :
                   item.adverb_id ? 'adverb' :
                   item.frame_id ? 'frame' : null;
  const entityId = item.verb_id || item.noun_id || item.adjective_id || item.adverb_id || item.frame_id;

  if (entityType && entityId) {
    const table = ENTITY_TYPE_TO_TABLE[entityType as EntityType];
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

      // 2. Handle frame_id reallocation (for verb/noun/adjective/adverb jobs)
      if (frame_id !== undefined && frame_id !== null && entityType !== 'frame') {
        // Validate the frame exists
        const targetFrame = await prisma.frames.findUnique({
          where: { id: BigInt(frame_id) },
          select: { id: true },
        });

        if (targetFrame) {
          // Check if it's different from current
          const currentFrameId = (currentEntity as any).frame_id;
          if (currentFrameId === null || BigInt(currentFrameId) !== BigInt(frame_id)) {
            validUpdates['frame_id'] = BigInt(frame_id);
          }
        } else {
          console.warn(`[LLM] Job ${item.job_id} suggested non-existent frame_id: ${frame_id}`);
        }
      }

      // 3. Handle entry_reallocations for frame jobs (reallocate specific entries to different frames)
      if (entityType === 'frame' && entry_reallocations && Object.keys(entry_reallocations).length > 0) {
        let reallocationCount = 0;
        
        for (const [entryCode, targetFrameId] of Object.entries(entry_reallocations)) {
          // Validate the target frame exists
          const targetFrame = await prisma.frames.findUnique({
            where: { id: BigInt(targetFrameId) },
            select: { id: true },
          });

          if (!targetFrame) {
            console.warn(`[LLM] Job ${item.job_id} suggested non-existent target frame ${targetFrameId} for entry ${entryCode}`);
            continue;
          }

          // Find the entry by code - check verbs, nouns, adjectives, adverbs
          const [verb, noun, adjective, adverb] = await Promise.all([
            prisma.verbs.findFirst({ where: { code: entryCode, frame_id: entityId, deleted: false } }),
            prisma.nouns.findFirst({ where: { code: entryCode, frame_id: entityId, deleted: false } }),
            prisma.adjectives.findFirst({ where: { code: entryCode, frame_id: entityId, deleted: false } }),
            prisma.adverbs.findFirst({ where: { code: entryCode, frame_id: entityId, deleted: false } }),
          ]);

          if (verb) {
            await createChangesetFromUpdate(
              'verb',
              verb.id,
              verb as unknown as Record<string, unknown>,
              { frame_id: BigInt(targetFrameId) },
              submittedBy,
              llmJobId,
            );
            reallocationCount++;
            hasEdits = true;
          } else if (noun) {
            await createChangesetFromUpdate(
              'noun',
              noun.id,
              noun as unknown as Record<string, unknown>,
              { frame_id: BigInt(targetFrameId) },
              submittedBy,
              llmJobId,
            );
            reallocationCount++;
            hasEdits = true;
          } else if (adjective) {
            await createChangesetFromUpdate(
              'adjective',
              adjective.id,
              adjective as unknown as Record<string, unknown>,
              { frame_id: BigInt(targetFrameId) },
              submittedBy,
              llmJobId,
            );
            reallocationCount++;
            hasEdits = true;
          } else if (adverb) {
            await createChangesetFromUpdate(
              'adverb',
              adverb.id,
              adverb as unknown as Record<string, unknown>,
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

        // Post AI notes as the first discussion comment
        if (notes && notes.trim()) {
          await addComment({
            changeset_id: changeset.id,
            author: 'system:llm-agent',
            content: notes.trim(),
          });
        }
      }

      // 4. Handle relations (simplified)
      if (relations && Object.keys(relations).length > 0) {
        console.log(`[LLM] Job ${item.job_id} suggested relations for ${entry.code}:`, relations);
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
 * Apply allocation job result - recommend the best frame for a lexical entry.
 */
async function applyAllocationResult(
  item: llm_job_items,
  entry: LexicalEntrySummary,
  result: AllocationResponse,
  submittedBy: string,
  llmJobId: bigint
): Promise<void> {
  const { recommended_frame_id, keep_current, confidence, reasoning } = result;
  let hasEdits = false;

  const entityType = item.verb_id ? 'verb' : 
                   item.noun_id ? 'noun' :
                   item.adjective_id ? 'adjective' :
                   item.adverb_id ? 'adverb' : null;
  const entityId = item.verb_id || item.noun_id || item.adjective_id || item.adverb_id;

  // Only create a changeset if we're not keeping current and have a recommendation
  if (!keep_current && recommended_frame_id !== null && entityType && entityId) {
    // Validate the target frame exists
    const targetFrame = await prisma.frames.findUnique({
      where: { id: BigInt(recommended_frame_id) },
      select: { id: true, label: true },
    });

    if (targetFrame) {
      const table = ENTITY_TYPE_TO_TABLE[entityType as EntityType];
      const currentEntity = await (prisma[table as keyof typeof prisma] as any).findUnique({
        where: { id: entityId },
      });

      if (currentEntity) {
        // Check if it's different from current frame
        const currentFrameId = currentEntity.frame_id;
        if (currentFrameId === null || BigInt(currentFrameId) !== BigInt(recommended_frame_id)) {
          const changeset = await createChangesetFromUpdate(
            entityType as EntityType,
            entityId,
            currentEntity as Record<string, unknown>,
            { frame_id: BigInt(recommended_frame_id) },
            submittedBy,
            llmJobId,
          );
          hasEdits = true;

          // Post AI reasoning as the first discussion comment
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
      console.warn(`[LLM] Allocation job ${item.job_id} suggested non-existent frame_id: ${recommended_frame_id}`);
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

  // Determine the flagging target for frame jobs
  let flagTarget: 'frame' | 'verb' | 'both' = 'frame';
  if (jobScope?.kind === 'frame_ids') {
    flagTarget = jobScope.flagTarget ?? 'frame';
  }

  // Helper to create a changeset for an entity update
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

  if (item.verb_id) {
    const verb = await prisma.verbs.findUnique({
      where: { id: item.verb_id },
    });
    if (verb) {
      await createModerationChangeset('verb', item.verb_id, verb as unknown as Record<string, unknown>);
    }
  } else if (item.noun_id) {
    const noun = await prisma.nouns.findUnique({
      where: { id: item.noun_id },
    });
    if (noun) {
      await createModerationChangeset('noun', item.noun_id, noun as unknown as Record<string, unknown>);
    }
  } else if (item.adjective_id) {
    const adjective = await prisma.adjectives.findUnique({
      where: { id: item.adjective_id },
    });
    if (adjective) {
      await createModerationChangeset('adjective', item.adjective_id, adjective as unknown as Record<string, unknown>);
    }
  } else if (item.adverb_id) {
    const adverb = await prisma.adverbs.findUnique({
      where: { id: item.adverb_id },
    });
    if (adverb) {
      await createModerationChangeset('adverb', item.adverb_id, adverb as unknown as Record<string, unknown>);
    }
  } else if (item.frame_id) {
    // For frames, we need to handle the flagTarget option
    const frameId = item.frame_id;
    
    // Flag the frame if target is 'frame' or 'both'
    if (flagTarget === 'frame' || flagTarget === 'both') {
      const frame = await prisma.frames.findUnique({
        where: { id: frameId },
      }) as any;
      if (frame) {
        await createModerationChangeset('frame', frameId, frame as Record<string, unknown>);
      }
    }
    
    // Flag associated verbs if target is 'verb' or 'both'
    if (flagTarget === 'verb' || flagTarget === 'both') {
      const verbs = await prisma.verbs.findMany({
        where: { 
          frame_id: frameId,
          deleted: false,
        },
      });
      for (const verb of verbs) {
        await createModerationChangeset('verb', verb.id, verb as unknown as Record<string, unknown>);
      }
    }
  }

  // Update the job item status
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

