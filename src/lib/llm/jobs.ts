import { Prisma } from '@prisma/client';
import type { llm_job_items } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  CancelJobResult,
  CreateLLMJobParams,
  JobDetailOptions,
  JobListOptions,
  JobScope,
  LexicalEntrySummary,
  PartOfSpeech,
  RenderedPrompt,
  SerializedJob,
  SerializedJobItem,
} from './types';
import { withRetry } from '@/lib/db-utils';

// Re-export from entries.ts
export { fetchEntriesForScope } from './entries';

// Re-export from execution.ts
export { submitJobItemBatch } from './execution';

// Import internal functions from execution.ts
import { refreshJobItems as refreshJobItemsInternal } from './execution';

// ============================================================================
// Error Class
// ============================================================================

export class LLMJobError extends Error {
  constructor(message: string, public statusCode = 500) {
    super(message);
    this.name = 'LLMJobError';
  }
}

// ============================================================================
// Internal Utilities
// ============================================================================

const TERMINAL_ITEM_STATUSES = new Set(['succeeded', 'failed', 'skipped']);

function inferPosFromJobScope(scope: JobScope | null): PartOfSpeech | null {
  if (!scope) return null;
  if (scope.kind === 'ids') return scope.pos;
  if (scope.kind === 'filters') return scope.pos;
  if (scope.kind === 'frame_ids') return 'frames';
  return null;
}

function normalizeServiceTier(
  tier: CreateLLMJobParams['serviceTier']
): 'default' | 'flex' | 'auto' | undefined {
  if (!tier) {
    return undefined;
  }

  if (tier === 'priority') {
    return 'auto';
  }

  return tier;
}

function getLLMJobsDelegate() {
  const delegate = (prisma as typeof prisma & { llm_jobs?: typeof prisma.llm_jobs }).llm_jobs;
  if (!delegate) {
    throw new LLMJobError(
      'LLM jobs tables are unavailable. Ensure database migrations ran and the Prisma client was regenerated.',
      500
    );
  }
  return delegate;
}

interface FetchOptions {
  includeItems?: boolean;
  // When true, won't return a record that has been soft-deleted
  excludeDeleted?: boolean;
  // Limit items per status
  statusLimits?: {
    pending?: number;
    succeeded?: number;
    failed?: number;
  };
}

async function fetchJobRecord(jobId: bigint, options: FetchOptions = {}): Promise<SerializedJob | null> {
  // Use findFirst with a conditional deleted=false filter when requested
  let job: any;
  try {
    job = await getLLMJobsDelegate().findFirst({
      // Cast as any to avoid transient type mismatches before prisma generate
      where: ({ id: jobId, ...(options.excludeDeleted ? { deleted: false } : {}) } as any),
      include: {
        llm_job_items: options.includeItems
          ? {
              orderBy: { id: 'asc' },
            }
          : false,
      },
    });
  } catch (error) {
    // Fallback for environments where Prisma client hasn't been regenerated yet
    if (error instanceof Error && /Unknown argument\s+`?deleted`?/i.test(error.message)) {
      job = await getLLMJobsDelegate().findFirst({
        where: { id: jobId },
        include: {
          llm_job_items: options.includeItems
            ? {
                orderBy: { id: 'asc' },
              }
            : false,
        },
      });
    } else {
      throw error;
    }
  }

  if (!job) {
    return null;
  }

    let items: Array<SerializedJobItem & { entry: LexicalEntrySummary }> = Array.isArray(job.llm_job_items)
    ? job.llm_job_items.map((item: llm_job_items) => ({
        ...item,
        id: item.id.toString(),
        job_id: item.job_id.toString(),
        created_at: item.created_at.toISOString(),
        updated_at: item.updated_at.toISOString(),
        started_at: item.started_at ? item.started_at.toISOString() : null,
        completed_at: item.completed_at ? item.completed_at.toISOString() : null,
        verb_id: item.verb_id ? item.verb_id.toString() : null,
        noun_id: item.noun_id ? item.noun_id.toString() : null,
        adjective_id: item.adjective_id ? item.adjective_id.toString() : null,
        adverb_id: item.adverb_id ? item.adverb_id.toString() : null,
        frame_id: item.frame_id ? item.frame_id.toString() : null,
        entry: extractEntrySummary(item),
      }))
    : [];

  // Apply status-based limits if provided
  if (options.statusLimits) {
    const { pending, succeeded, failed } = options.statusLimits;
    
    // Group items by status category
    const pendingItems = items.filter(item => item.status === 'queued' || item.status === 'processing');
    const succeededItems = items.filter(item => item.status === 'succeeded');
    const failedItems = items.filter(item => item.status === 'failed');
    const otherItems = items.filter(item => 
      item.status !== 'queued' && 
      item.status !== 'processing' && 
      item.status !== 'succeeded' && 
      item.status !== 'failed'
    );
    
    // Apply limits and recombine
    items = [
      ...(pending !== undefined ? pendingItems.slice(0, pending) : pendingItems),
      ...(succeeded !== undefined ? succeededItems.slice(0, succeeded) : succeededItems),
      ...(failed !== undefined ? failedItems.slice(0, failed) : failedItems),
      ...otherItems,
    ];
  }

  const { llm_job_items: ignoredItems, ...jobWithoutItems } = job as typeof job & { llm_job_items?: unknown };
  void ignoredItems;

  return {
    ...jobWithoutItems,
    id: job.id.toString(),
    created_at: job.created_at.toISOString(),
    updated_at: job.updated_at.toISOString(),
    started_at: job.started_at ? job.started_at.toISOString() : null,
    completed_at: job.completed_at ? job.completed_at.toISOString() : null,
    cost_microunits: job.cost_microunits != null ? job.cost_microunits.toString() : null,
    items,
  } as SerializedJob;
}

function extractEntrySummary(item: llm_job_items): {
  code: string | null;
  pos: PartOfSpeech | null;
  gloss?: string | null;
  lemmas?: string[] | null;
} {
  const payload = (item.request_payload as Prisma.JsonObject | null) ?? {};
  const entry = (payload.entry as Prisma.JsonObject | undefined) ?? {};

  return {
    code: (entry.code as string) ?? null,
    pos: (entry.pos as PartOfSpeech) ?? null,
    gloss: (entry.gloss as string) ?? null,
    lemmas: (entry.lemmas as string[]) ?? null,
  };
}

/**
 * Build a flat variable map for simple {{variable}} interpolation.
 * Used for backward compatibility and for storing in request_payload.
 */
function buildVariableMap(entry: LexicalEntrySummary): Record<string, string> {
  const stringify = (value: unknown): string => {
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  };

  const base: Record<string, string> = {
    id: entry.dbId.toString(),
    code: entry.code,
    pos: entry.pos,
    gloss: entry.gloss ?? '',
    lemmas: (entry.lemmas ?? []).join(', '),
    lemmas_json: JSON.stringify(entry.lemmas ?? [], null, 2),
    examples: (entry.examples ?? []).join('\n'),
    examples_json: JSON.stringify(entry.examples ?? [], null, 2),
    flagged: entry.flagged ? 'true' : 'false',
    flagged_reason: entry.flagged_reason ?? '',
    verifiable: entry.verifiable ? 'true' : 'false',
    unverifiable_reason: entry.unverifiable_reason ?? '',
    label: entry.label ?? '',
    lexfile: entry.lexfile ?? '',
  };

  // Frame-specific fields
  if (entry.pos === 'frames') {
    base.definition = entry.definition ?? '';
    base.short_definition = entry.short_definition ?? '';
    base.prototypical_synset = entry.prototypical_synset ?? '';
    base.flagged = entry.flagged ? 'true' : 'false';
    base.flagged_reason = entry.flagged_reason ?? '';
    base.verifiable = entry.verifiable ? 'true' : 'false';
    base.unverifiable_reason = entry.unverifiable_reason ?? '';
  }

  // Add additional fields (includes frame.* fields for verbs)
  if (entry.additional) {
    for (const [key, value] of Object.entries(entry.additional)) {
      base[key] = stringify(value);
    }
  }

  // Add frame_definition alias for backwards compatibility (maps to frame.definition)
  if (entry.frame?.definition) {
    base.frame_definition = entry.frame.definition;
  }

  return base;
}

/**
 * Build a template context for nunjucks rendering.
 * Includes both flat variables and structured objects for loop iteration.
 */
function buildTemplateContext(entry: LexicalEntrySummary): Record<string, unknown> {
  // Start with flat variables
  const context: Record<string, unknown> = {
    id: entry.dbId.toString(),
    code: entry.code,
    pos: entry.pos,
    gloss: entry.gloss ?? '',
    lemmas: entry.lemmas ?? [],
    lemmas_json: JSON.stringify(entry.lemmas ?? [], null, 2),
    examples: entry.examples ?? [],
    examples_json: JSON.stringify(entry.examples ?? [], null, 2),
    flagged: entry.flagged ?? false,
    flagged_reason: entry.flagged_reason ?? '',
    verifiable: entry.verifiable ?? false,
    unverifiable_reason: entry.unverifiable_reason ?? '',
    label: entry.label ?? '',
    lexfile: entry.lexfile ?? '',
  };

  // Frame-specific fields (when pos === 'frames')
  if (entry.pos === 'frames') {
    context.definition = entry.definition ?? '';
    context.short_definition = entry.short_definition ?? '';
    context.prototypical_synset = entry.prototypical_synset ?? '';
    // Direct access to roles, verbs, nouns for frames
    context.roles = entry.roles ?? [];
    context.verbs = entry.verbs ?? [];
    context.nouns = entry.nouns ?? [];
  }

  // Add structured frame object for verbs (enables {% for role in frame.roles %})
  if (entry.frame) {
    context.frame = entry.frame;
  }

  // Add flat additional fields for backward compatibility
  if (entry.additional) {
    for (const [key, value] of Object.entries(entry.additional)) {
      // Only add if not already a structured object (avoid overwriting frame.*)
      if (!key.startsWith('frame.') || typeof value === 'string') {
        context[key] = value;
      }
    }
  }

  // Add frame_definition alias for backwards compatibility (maps to frame.definition)
  if (entry.frame?.definition) {
    context.frame_definition = entry.frame.definition;
  }

  return context;
}

async function updateJobAggregates(jobId: bigint) {
  const existing = await getLLMJobsDelegate().findUnique({
    where: { id: jobId },
    select: { status: true },
  });

  const [totals] = await prisma.$queryRaw<Array<{
    total: bigint;
    submitted: bigint;
    processed: bigint;
    succeeded: bigint;
    failed: bigint;
    flagged: bigint;
  }>>`SELECT
      COUNT(*)::bigint AS total,
      SUM(CASE WHEN provider_task_id IS NOT NULL THEN 1 ELSE 0 END)::bigint AS submitted,
      SUM(CASE WHEN status IN ('succeeded','failed','skipped') THEN 1 ELSE 0 END)::bigint AS processed,
      SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END)::bigint AS succeeded,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::bigint AS failed,
      SUM(CASE WHEN flagged THEN 1 ELSE 0 END)::bigint AS flagged
    FROM llm_job_items
    WHERE job_id = ${jobId}`;

  const processingCount = Number(totals.total - totals.processed);
  const calculatedStatus = (() => {
    if (processingCount > 0) {
      return 'running' as const;
    }
    if (Number(totals.succeeded) === Number(totals.total)) {
      return 'completed' as const;
    }
    if (Number(totals.failed) === Number(totals.total)) {
      return 'failed' as const;
    }
    if (Number(totals.processed) === Number(totals.total)) {
      return 'completed' as const;
    }
    return 'running' as const;
  })();

  const status = existing?.status === 'cancelled' ? 'cancelled' : calculatedStatus;

  // Check if status changed to set unseen_change flag
  const statusChanged = existing?.status !== status;

  await getLLMJobsDelegate().update({
    where: { id: jobId },
    data: {
      total_items: Number(totals.total),
      submitted_items: Number(totals.submitted),
      processed_items: Number(totals.processed),
      succeeded_items: Number(totals.succeeded),
      failed_items: Number(totals.failed),
      flagged_items: Number(totals.flagged),
      status,
      unseen_change: statusChanged ? true : undefined,
      completed_at:
        status === 'completed' || status === 'failed'
          ? new Date()
          : undefined,
    },
  });
}

// Wrapper for refreshJobItems that provides the required callback functions
async function refreshJobItems(job: SerializedJob, options: { limit?: number } = {}): Promise<SerializedJob> {
  return refreshJobItemsInternal(job, {
    limit: options.limit,
    fetchJobRecordFn: (jobId) => fetchJobRecord(jobId, { includeItems: true }),
    updateJobAggregatesFn: updateJobAggregates,
  });
}

// ============================================================================
// Public API - Prompt Rendering
// ============================================================================

import { renderTemplate, hasLoopSyntax } from './template-renderer';

/**
 * Render a prompt template with entry data.
 * Supports both simple {{variable}} interpolation and Jinja-style {% for %} loops.
 */
export function renderPrompt(template: string, entry: LexicalEntrySummary): RenderedPrompt {
  // Build flat variable map for storage/display
  const variables = buildVariableMap(entry);
  
  // Check if template uses loop syntax
  const usesLoops = hasLoopSyntax(template);
  
  let prompt: string;
  
  if (usesLoops) {
    // Use nunjucks for templates with loops
    const context = buildTemplateContext(entry);
    const result = renderTemplate(template, context);
    
    if (!result.success) {
      console.error('[renderPrompt] Template render error:', result.error);
      // Fall back to simple replacement on error
      prompt = template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key: string) => {
        if (variables[key] !== undefined) {
          return variables[key];
        }
        return '';
      });
    } else {
      prompt = result.prompt;
    }
  } else {
    // Use simple regex replacement for templates without loops (faster)
    prompt = template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key: string) => {
      if (variables[key] !== undefined) {
        return variables[key];
      }
      return '';
    });
  }

  return { prompt, variables };
}

// ============================================================================
// Public API - Job Preview and Creation
// ============================================================================

import { fetchEntriesForScope } from './entries';

export async function previewLLMJob(params: CreateLLMJobParams) {
  const entries = await fetchEntriesForScope(params.scope);
  if (entries.length === 0) {
    throw new LLMJobError('No entries found for the provided scope.', 400);
  }

  // Return up to 20 previews
  const previewCount = Math.min(entries.length, 20);
  const previews = entries.slice(0, previewCount).map(entry => renderPrompt(params.promptTemplate, entry));

  return { previews, totalEntries: entries.length };
}

export async function createLLMJob(
  params: CreateLLMJobParams,
  initialBatchSize?: number
): Promise<SerializedJob> {
  // 1. Fetch entries BEFORE starting transaction
  const entries = await fetchEntriesForScope(params.scope);

  if (entries.length === 0) {
    throw new LLMJobError('No entries found for the provided scope.', 400);
  }

  // Determine how many items to create in this call
  const totalEntries = entries.length;
  const entriesToCreate = initialBatchSize && initialBatchSize < totalEntries
    ? entries.slice(0, initialBatchSize)
    : entries;

  console.log(`[createLLMJob] Total entries: ${totalEntries}, Creating: ${entriesToCreate.length}, Batching: ${!!initialBatchSize}`);

  // Validate batch size (if not batching, enforce old limit)
  if (!initialBatchSize) {
    const MAX_ENTRIES_PER_JOB = 5000;
    if (totalEntries > MAX_ENTRIES_PER_JOB) {
      throw new LLMJobError(
        `Job scope contains ${totalEntries} entries, which exceeds the maximum of ${MAX_ENTRIES_PER_JOB}. ` +
        `For large batches, frontend should use batching mode.`,
        400
      );
    }
  }

  // 2. Prepare job config BEFORE transaction
  // Use userPromptTemplate as the canonical field name (matches source-llm JobConfig)
  const jobConfig: Prisma.InputJsonObject = {
    model: params.model,
    userPromptTemplate: params.promptTemplate,
    serviceTier: params.serviceTier ?? null,
    reasoning: params.reasoning ?? null,
    targetFields: (params.targetFields ?? []) as Prisma.InputJsonValue,
    reallocationEntityTypes: (params.reallocationEntityTypes ?? []) as Prisma.InputJsonValue,
    metadata: (params.metadata ?? {}) as Prisma.InputJsonObject,
    // MCP tool approval configuration
    mcpApproval: params.mcpApproval ? (params.mcpApproval as unknown as Prisma.InputJsonValue) : null,
    // Review job specific fields
    changesetId: params.changesetId ?? null,
    chatHistory: params.chatHistory ? (params.chatHistory as unknown as Prisma.InputJsonValue) : null,
  };

  // 3. Prepare job items data BEFORE transaction (only for the batch we're creating)
  // This is computationally expensive (rendering prompts), so do it outside the transaction
  const preparedJobItemsData = entriesToCreate.map(entry => {
    const { prompt, variables } = renderPrompt(params.promptTemplate, entry);

    const requestPayload = {
      promptTemplate: params.promptTemplate,
      renderedPrompt: prompt,
      variables,
      entry: {
        code: entry.code,
        pos: entry.pos,
        gloss: entry.gloss,
        lemmas: entry.lemmas,
        label: entry.label ?? null,
      },
    } satisfies Record<string, unknown>;

    return {
      // job_id will be set after job creation
      status: 'queued' as const,
      verb_id: entry.pos === 'verbs' ? entry.dbId : null,
      noun_id: entry.pos === 'nouns' ? entry.dbId : null,
      adjective_id: entry.pos === 'adjectives' ? entry.dbId : null,
      adverb_id: entry.pos === 'adverbs' ? entry.dbId : null,
      frame_id: entry.pos === 'frames' ? entry.dbId : null,
      request_payload: requestPayload as Prisma.InputJsonObject,
    };
  });

  // 4. Execute job and items creation in a SINGLE transaction
  // Use generous timeout (60 seconds) for large jobs
  const job = await prisma.$transaction(
    async (tx) => {
      // Create job record
      const createdJob = await tx.llm_jobs.create({
        data: {
          label: params.label ?? null,
          submitted_by: params.submittedBy ?? null,
          job_type: params.jobType ?? 'moderation',
          scope_kind: params.scope.kind,
          scope: params.scope as unknown as Prisma.JsonObject,
          config: jobConfig,
          provider: 'openai',
          llm_vendor: 'openai',
          status: 'queued',
          total_items: totalEntries, // Use total scope size, not just this batch
        } as any,
      });

      // Create all job items in bulk with the job_id
      const jobItemsData = preparedJobItemsData.map(item => ({
        ...item,
        job_id: createdJob.id,
      }));

      await tx.llm_job_items.createMany({ 
        data: jobItemsData,
        skipDuplicates: false, // Ensure we fail on duplicates
      });

      return createdJob;
    },
    {
      maxWait: 10000, // 10 seconds max wait to acquire a connection
      timeout: 60000, // 60 seconds transaction timeout
    }
  );

  // 5. Fetch the complete job with items after transaction commits
  const result = await fetchJobRecord(job.id, { includeItems: true });
  if (!result) {
    throw new LLMJobError('Failed to load job after creation', 500);
  }
  return result;
}

// ============================================================================
// Public API - Job Listing and Retrieval
// ============================================================================

export async function listLLMJobs(options: JobListOptions = {}): Promise<SerializedJob[]> {
  let jobs: any[];
  
  // Only include items if explicitly requested (default to false for performance)
  const includeItemsQuery = options.includeItems === true ? {
    llm_job_items: {
      orderBy: { id: 'asc' as const },
    },
  } : undefined;
  
  try {
    jobs = await getLLMJobsDelegate().findMany({
      // Hide soft-deleted jobs from lists
      where: ({ deleted: false } as any),
      orderBy: { created_at: 'desc' },
      // Fetch more than requested to account for filtering by entityType
      take: options.entityType ? (options.limit ?? 15) * 3 : (options.limit ?? 15),
      include: includeItemsQuery,
    });
  } catch (error) {
    // Fallback for environments where Prisma client hasn't been regenerated yet
    if (error instanceof Error && /Unknown argument\s+`?deleted`?/i.test(error.message)) {
      jobs = await getLLMJobsDelegate().findMany({
        orderBy: { created_at: 'desc' },
        take: options.entityType ? (options.limit ?? 15) * 3 : (options.limit ?? 15),
        include: includeItemsQuery,
      });
    } else {
      throw error;
    }
  }
  
  // Filter by entity type if specified (using scope field to infer entity type)
  if (options.entityType) {
    jobs = jobs.filter(job => {
      const scope = job.scope as JobScope | null;
      const jobEntityType = inferPosFromJobScope(scope);
      return jobEntityType === options.entityType;
    });
    // Limit to requested number after filtering
    jobs = jobs.slice(0, options.limit ?? 15);
  }

  const serialized = jobs.map(job => {
    const { llm_job_items: itemsRaw, ...jobWithoutItems } = job as typeof job & { llm_job_items?: typeof job.llm_job_items };
    return {
      ...jobWithoutItems,
      id: job.id.toString(),
      created_at: job.created_at.toISOString(),
      updated_at: job.updated_at.toISOString(),
      started_at: job.started_at ? job.started_at.toISOString() : null,
      completed_at: job.completed_at ? job.completed_at.toISOString() : null,
      cost_microunits: job.cost_microunits != null ? job.cost_microunits.toString() : null,
      items: (itemsRaw ?? []).map((item: llm_job_items) => ({
        ...item,
        id: item.id.toString(),
        job_id: item.job_id.toString(),
        created_at: item.created_at.toISOString(),
        updated_at: item.updated_at.toISOString(),
        started_at: item.started_at ? item.started_at.toISOString() : null,
        completed_at: item.completed_at ? item.completed_at.toISOString() : null,
        verb_id: item.verb_id ? item.verb_id.toString() : null,
        noun_id: item.noun_id ? item.noun_id.toString() : null,
        adjective_id: item.adjective_id ? item.adjective_id.toString() : null,
        adverb_id: item.adverb_id ? item.adverb_id.toString() : null,
        frame_id: item.frame_id ? item.frame_id.toString() : null,
        entry: extractEntrySummary(item),
      })),
    } as SerializedJob;
  });

  // Only refresh if items are loaded - otherwise there's nothing to refresh
  if (options.refreshBeforeReturn !== false && options.includeItems === true) {
    const jobsToRefresh = serialized.filter(job => ['queued', 'running'].includes(job.status));
    for (const job of jobsToRefresh) {
      const refreshed = await refreshJobItems(job);
      const index = serialized.findIndex(j => j.id === job.id);
      if (index >= 0) {
        serialized[index] = refreshed;
      }
    }
  }

  return options.includeCompleted === true
    ? serialized
    : serialized.filter(job => ['queued', 'running'].includes(job.status));
}

export async function getLLMJob(jobId: number | string, options: JobDetailOptions = {}): Promise<SerializedJob> {
  const job = await fetchJobRecord(BigInt(jobId), { 
    includeItems: true, 
    excludeDeleted: true,
    statusLimits: options.statusLimits,
  });
  if (!job) {
    throw new LLMJobError('Job not found', 404);
  }

  if (options.refresh !== false && ['queued', 'running'].includes(job.status)) {
    return refreshJobItems(job, { limit: options.refreshLimit });
  }

  return job;
}

// ============================================================================
// Public API - Job Management
// ============================================================================

export async function cancelLLMJob(jobId: number | string): Promise<CancelJobResult> {
  const job = await getLLMJob(jobId, { refresh: false });

  if (['completed', 'failed', 'cancelled'].includes(job.status)) {
    return { job, cancelledCount: 0 };
  }

  // Mark job as cancelled - lambda will handle item cleanup and OpenAI cancellation
  await getLLMJobsDelegate().update({
    where: { id: BigInt(job.id) },
    data: {
      status: 'cancelled',
      completed_at: new Date(),
    },
  });

  const refreshed = await getLLMJob(jobId, { refresh: false });
  await updateJobAggregates(BigInt(refreshed.id));
  return { job: refreshed, cancelledCount: 0 };
}

export async function deleteLLMJob(jobId: number | string): Promise<void> {
  // Soft-delete the job by setting deleted=true; fallback to hard-delete if the field is unknown
  try {
    await getLLMJobsDelegate().update({
      where: { id: BigInt(jobId) },
      data: { deleted: true } as any,
    });
  } catch (error) {
    if (error instanceof Error && /Unknown argument\s+`?deleted`?/i.test(error.message)) {
      await getLLMJobsDelegate().delete({ where: { id: BigInt(jobId) } });
    } else {
      throw error;
    }
  }
}

export async function markJobAsSeen(jobId: string | number): Promise<void> {
  try {
    await getLLMJobsDelegate().update({
      where: { id: BigInt(jobId) },
      data: { unseen_change: false } as any,
    });
  } catch (error) {
    if (error instanceof Error && /Unknown argument\s+`?unseen_change`?/i.test(error.message)) {
      // Silently ignore if column doesn't exist yet (during migration)
      return;
    }
    throw error;
  }
}

export async function getUnseenJobsCount(pos?: PartOfSpeech): Promise<number> {
  try {
    const jobs = await withRetry(
      () => getLLMJobsDelegate().findMany({
        where: { unseen_change: true, deleted: false } as any,
        select: { id: true, scope: true },
      }),
      undefined,
      'getUnseenJobsCount'
    );
    
    if (!pos) return jobs.length;
    
    return jobs.filter(job => {
      const scope = job.scope as JobScope | null;
      return inferPosFromJobScope(scope) === pos;
    }).length;
  } catch (error) {
    if (error instanceof Error && /Unknown argument\s+`?unseen_change`?/i.test(error.message)) {
      // Return 0 if column doesn't exist yet (during migration)
      return 0;
    }
    throw error;
  }
}
