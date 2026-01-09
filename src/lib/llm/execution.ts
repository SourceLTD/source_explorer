import { Prisma } from '@prisma/client';
import type OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import { FLAGGING_RESPONSE_SCHEMA, EDIT_RESPONSE_SCHEMA, REALLOCATION_RESPONSE_SCHEMA, type FlaggingResponse } from './schema';
import type { CreateLLMJobParams, JobScope, LexicalEntrySummary, SerializedJob } from './types';
import { getOpenAIClient } from './client';
import { applyJobResult } from './result-handlers';

const TERMINAL_ITEM_STATUSES = new Set(['succeeded', 'failed', 'skipped']);

/**
 * Normalize service tier to OpenAI format.
 */
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

/**
 * Ensure OpenAI client is configured.
 */
function ensureOpenAIClient(): OpenAI {
  const client = getOpenAIClient();
  if (!client) {
    throw new Error('OpenAI client is not configured. Please set OPENAI_API_KEY.');
  }
  return client;
}

/**
 * Get the llm_jobs Prisma delegate, throwing if unavailable.
 */
function getLLMJobsDelegate() {
  const delegate = (prisma as typeof prisma & { llm_jobs?: typeof prisma.llm_jobs }).llm_jobs;
  if (!delegate) {
    throw new Error(
      'LLM jobs tables are unavailable. Ensure database migrations ran and the Prisma client was regenerated.'
    );
  }
  return delegate;
}

/**
 * Submit a batch of job items to OpenAI.
 * Returns submission statistics and any errors encountered.
 */
export async function submitJobItemBatch(
  jobId: bigint,
  batchSize: number = 100
): Promise<{
  submitted: number;
  failed: number;
  remaining: number;
  errors: Array<{ itemId: string; error: string }>;
}> {
  const batchStartTime = Date.now();
  const TIMEOUT_MS = 290000; // Stop at 290s (with 10s buffer before 300s route timeout)
  
  // 1. Fetch next batch of queued items that haven't been submitted yet
  const items = await prisma.llm_job_items.findMany({
    where: { 
      job_id: jobId, 
      status: 'queued',
      provider_task_id: null  // Not yet submitted to OpenAI
    },
    take: batchSize,
    orderBy: { id: 'asc' },
  });

  if (items.length === 0) {
    return { submitted: 0, failed: 0, remaining: 0, errors: [] };
  }

  // 2. Update job status to 'running' if this is the first batch
  const job = await getLLMJobsDelegate().findUnique({
    where: { id: jobId },
    select: { status: true, config: true, job_type: true },
  });
  
  if (job?.status === 'queued') {
    await getLLMJobsDelegate().update({
      where: { id: jobId },
      data: { status: 'running', started_at: new Date() },
    });
  }

  const config = job?.config as { model: string; serviceTier?: string; reasoning?: unknown } | null;
  const jobType = (job?.job_type ?? 'moderation') as 'moderation' | 'editing' | 'reallocation';
  const responseSchema = jobType === 'editing' 
    ? EDIT_RESPONSE_SCHEMA 
    : jobType === 'reallocation' 
      ? REALLOCATION_RESPONSE_SCHEMA 
      : FLAGGING_RESPONSE_SCHEMA;
  const client = ensureOpenAIClient();
  const openAIServiceTier = normalizeServiceTier(config?.serviceTier as CreateLLMJobParams['serviceTier']);
  
  // Helper function to submit a single item with retry logic
  const submitItem = async (item: typeof items[number], retries = 3): Promise<{ success: boolean; itemId: bigint; error?: string }> => {
    const payload = item.request_payload as Prisma.JsonObject;
    const renderedPrompt = String(payload.renderedPrompt ?? '');
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      // Check timeout
      if (Date.now() - batchStartTime > TIMEOUT_MS) {
        return { 
          success: false, 
          itemId: item.id, 
          error: 'Batch timeout - will retry in next batch' 
        };
      }
      
      try {
        const response = await client.responses.create({
          model: config?.model ?? 'gpt-5-nano',
          input: renderedPrompt,
          background: true,
          store: true,
          metadata: {
            job_id: jobId.toString(),
            job_item_id: item.id.toString(),
          },
          service_tier: openAIServiceTier,
          reasoning: config?.reasoning as CreateLLMJobParams['reasoning'],
          text: {
            format: {
              type: 'json_schema',
              name: responseSchema.name,
              strict: responseSchema.strict,
              schema: responseSchema.schema,
            },
          },
        });

        await prisma.llm_job_items.update({
          where: { id: item.id },
          data: {
            status: 'processing',
            provider_task_id: response.id,
            llm_request_id: response.id,
            started_at: new Date(),
          },
        });
        
        return { success: true, itemId: item.id };
      } catch (error: any) {
        // Categorize errors based on OpenAI documentation
        const status = error?.status || error?.response?.status;
        const code = error?.code;
        
        // Transient errors that should be retried
        const isRateLimit = status === 429 && !error?.message?.includes('quota');
        const isServerError = status === 500 || code === 'internal_server_error';
        const isServiceUnavailable = status === 503 || code === 'service_unavailable';
        const isTimeout = code === 'timeout' || error?.name === 'APITimeoutError';
        const isConnectionError = code === 'connection_error' || error?.name === 'APIConnectionError';
        
        const isRetryable = isRateLimit || isServerError || isServiceUnavailable || isTimeout || isConnectionError;
        
        if (isRetryable && attempt < retries) {
          // Exponential backoff: 1s, 2s, 4s
          const delayMs = Math.pow(2, attempt) * 1000;
          console.log(`[LLM] Retrying item ${item.id} after ${delayMs}ms (attempt ${attempt + 1}/${retries}) - Error: ${error?.message || 'Unknown'}`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        
        // Final failure - categorize the error type for better debugging
        let errorMessage = error instanceof Error ? error.message : 'Submission failed';
        
        // Add context about error type for non-retryable errors
        if (status === 401) {
          errorMessage = `Authentication error: ${errorMessage}`;
        } else if (status === 403) {
          errorMessage = `Permission denied: ${errorMessage}`;
        } else if (status === 429 && error?.message?.includes('quota')) {
          errorMessage = `Quota exceeded: ${errorMessage}`;
        } else if (status === 400 || code === 'invalid_request_error') {
          errorMessage = `Invalid request: ${errorMessage}`;
        }
        
        await prisma.llm_job_items.update({
          where: { id: item.id },
          data: {
            status: 'failed',
            last_error: errorMessage,
            completed_at: new Date(),
          },
        });
        
        return { 
          success: false, 
          itemId: item.id, 
          error: errorMessage
        };
      }
    }
    
    return { 
      success: false, 
      itemId: item.id, 
      error: 'Max retries exceeded' 
    };
  };
  
  // 3. Submit all items in parallel using Promise.allSettled
  const submissions = items.map(item => submitItem(item));

  const results = await Promise.allSettled(submissions);
  
  // 4. Count successes and failures
  let submitted = 0;
  let failed = 0;
  const errors: Array<{ itemId: string; error: string }> = [];
  
  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (result.value.success) {
        submitted++;
      } else {
        failed++;
        errors.push({ itemId: result.value.itemId.toString(), error: result.value.error ?? 'Unknown error' });
      }
    } else {
      failed++;
      errors.push({ itemId: 'unknown', error: result.reason?.message ?? 'Promise rejected' });
    }
  }

  // 5. Update job submitted_items counter
  await getLLMJobsDelegate().update({
    where: { id: jobId },
    data: {
      submitted_items: { increment: submitted },
    },
  });

  // 6. Calculate remaining items to submit
  const remaining = await prisma.llm_job_items.count({
    where: { 
      job_id: jobId, 
      status: 'queued',
      provider_task_id: null,
    },
  });

  return { submitted, failed, remaining, errors };
}

/**
 * Refresh a single job item by polling OpenAI and updating the database.
 */
async function refreshSingleItem(
  item: SerializedJob['items'][number], 
  jobId: string, 
  jobLabel: string | null
): Promise<void> {
  if (!item.provider_task_id) return;

  const client = ensureOpenAIClient();

  try {
    const response = await client.responses.retrieve(item.provider_task_id);
    const responsePayload = JSON.parse(JSON.stringify(response));

    if (response.status === 'queued' || response.status === 'in_progress') {
      await prisma.llm_job_items.update({
        where: { id: BigInt(item.id) },
        data: {
          status: 'processing',
          response_payload: responsePayload,
        },
      });
      return;
    }

    if (response.status === 'cancelled') {
      await prisma.llm_job_items.update({
        where: { id: BigInt(item.id) },
        data: {
          status: 'failed',
          last_error: 'Cancelled at provider',
          response_payload: responsePayload,
          completed_at: new Date(),
        },
      });
      return;
    }

    if (response.status === 'failed') {
      await prisma.llm_job_items.update({
        where: { id: BigInt(item.id) },
        data: {
          status: 'failed',
          last_error: response.error?.message ?? 'Provider error',
          response_payload: responsePayload,
          completed_at: new Date(),
        },
      });
      return;
    }

    if (response.status === 'completed') {
      // The Responses API may omit convenience fields on retrieve calls, so we
      // normalize the output shape here.
      const outputItems = Array.isArray((response as any).output)
        ? ((response as any).output as Array<{ content?: unknown }>)
        : [];
      const contentParts = outputItems.flatMap(part =>
        Array.isArray((part as { content?: unknown }).content)
          ? ((part as { content: unknown[] }).content as Array<Record<string, unknown>>)
          : []
      );
      const textPart = contentParts.find(
        part => typeof part?.type === 'string' && part.type === 'output_text' && typeof part.text === 'string'
      ) as ({ text: string } & Record<string, unknown>) | undefined;
      const jsonSchemaPart = contentParts.find(
        part => typeof part?.type === 'string' && part.type === 'output_json_schema'
      ) as ({ json_schema?: unknown } & Record<string, unknown>) | undefined;

      let outputText: string | undefined = (response as any).output_text;
      if (!outputText && jsonSchemaPart?.json_schema) {
        outputText = typeof jsonSchemaPart.json_schema === 'string'
          ? jsonSchemaPart.json_schema
          : JSON.stringify(jsonSchemaPart.json_schema);
      }
      if (!outputText && textPart?.text) {
        outputText = textPart.text;
      }

      if (!outputText) {
        console.warn(
          `[LLM] Completed response ${response.id} missing output content; will retry on next poll.`
        );
        await prisma.llm_job_items.update({
          where: { id: BigInt(item.id) },
          data: {
            status: 'processing',
            response_payload: responsePayload,
          },
        });
        return;
      }

      let parsed: FlaggingResponse | null = null;
      try {
        parsed = JSON.parse(outputText) as FlaggingResponse;
      } catch (error) {
        console.error('[LLM] Failed to parse response JSON:', error);
        console.error('[LLM] Output text was:', outputText);
        console.error('[LLM] Response status:', response.status);
      }

      if (!parsed) {
        await prisma.llm_job_items.update({
          where: { id: BigInt(item.id) },
          data: {
            status: 'failed',
            last_error: `Unable to parse JSON response from model. Output: ${outputText.substring(0, 100)}`,
            response_payload: responsePayload,
            completed_at: new Date(),
          },
        });
        return;
      }

      const entry = await fetchEntryForItem(item);
      if (!entry) {
        await prisma.llm_job_items.update({
          where: { id: BigInt(item.id) },
          data: {
            status: 'failed',
            last_error: 'Entry not found when applying result',
            response_payload: responsePayload,
            completed_at: new Date(),
          },
        });
        return;
      }

      const jobRecord = await getLLMJobsDelegate().findUnique({
        where: { id: BigInt(jobId) },
        select: { scope: true, submitted_by: true, job_type: true, config: true },
      });
      
      await applyJobResult(
        await prisma.llm_job_items.findUniqueOrThrow({ where: { id: BigInt(item.id) } }),
        entry,
        parsed as any,
        jobLabel,
        jobRecord?.submitted_by ?? 'system:llm-agent',
        (jobRecord?.job_type as any) ?? 'moderation',
        jobRecord?.scope as JobScope | undefined,
        jobRecord?.config as Record<string, unknown> | undefined
      );

      await prisma.llm_job_items.update({
        where: { id: BigInt(item.id) },
        data: {
          response_payload: responsePayload,
          input_tokens: response.usage?.input_tokens ?? 0,
          output_tokens: response.usage?.output_tokens ?? 0,
        },
      });
    }
  } catch (error) {
    console.error('[LLM] Error refreshing job item:', error);
    await prisma.llm_job_items.update({
      where: { id: BigInt(item.id) },
      data: {
        last_error: error instanceof Error ? error.message : 'Unexpected refresh error',
      },
    });
  }
}

/**
 * Refresh job items by polling OpenAI in parallel batches.
 * @param job The job to refresh
 * @param options.limit Maximum number of items to refresh per call (default 40)
 * @param fetchJobRecordFn Function to fetch the updated job record
 * @param updateJobAggregatesFn Function to update job aggregates
 */
export async function refreshJobItems(
  job: SerializedJob, 
  options: { 
    limit?: number;
    fetchJobRecordFn: (jobId: bigint) => Promise<SerializedJob | null>;
    updateJobAggregatesFn: (jobId: bigint) => Promise<void>;
  }
): Promise<SerializedJob> {
  const limit = options.limit ?? 40;
  const staleItems = job.items
    .filter(item => !TERMINAL_ITEM_STATUSES.has(item.status))
    .slice(0, limit); // Only process first N items to avoid long-running polls

  if (staleItems.length === 0) {
    return job;
  }

  const CONCURRENT_BATCH_SIZE = 20;

  // Process items in parallel batches to improve performance
  for (let i = 0; i < staleItems.length; i += CONCURRENT_BATCH_SIZE) {
    const batch = staleItems.slice(i, i + CONCURRENT_BATCH_SIZE);
    await Promise.allSettled(
      batch.map(item => refreshSingleItem(item, job.id, job.label ?? null))
    );
  }

  await options.updateJobAggregatesFn(BigInt(job.id));
  const refreshedJob = await options.fetchJobRecordFn(BigInt(job.id));
  if (!refreshedJob) {
    throw new Error('Failed to fetch job after refresh');
  }
  return refreshedJob;
}

/**
 * Fetch the entry data for a job item.
 */
export async function fetchEntryForItem(item: SerializedJob['items'][number]): Promise<LexicalEntrySummary | null> {
  if (item.verb_id) {
    const record = await prisma.verbs.findUnique({
      where: { id: BigInt(item.verb_id) },
      select: {
        id: true,
        code: true,
        gloss: true,
        lemmas: true,
        examples: true,
        flagged: true,
        flagged_reason: true,
        lexfile: true,
        frames: {
          select: { label: true },
        },
      },
    });
    if (!record) return null;
    return {
      dbId: record.id,
      code: record.code,
      pos: 'verbs',
      gloss: record.gloss,
      lemmas: record.lemmas,
      examples: record.examples,
      flagged: record.flagged,
      flagged_reason: record.flagged_reason,
      label: record.frames?.label ?? null,
      lexfile: record.lexfile,
    };
  }

  if (item.noun_id) {
    const record = await prisma.nouns.findUnique({
      where: { id: BigInt(item.noun_id) },
      select: {
        id: true,
        code: true,
        gloss: true,
        lemmas: true,
        examples: true,
        flagged: true,
        flagged_reason: true,
        lexfile: true,
      },
    });
    if (!record) return null;
    return {
      dbId: record.id,
      code: record.code,
      pos: 'nouns',
      gloss: record.gloss,
      lemmas: record.lemmas,
      examples: record.examples,
      flagged: record.flagged,
      flagged_reason: record.flagged_reason,
      lexfile: record.lexfile,
    };
  }

  if (item.adjective_id) {
    const record = await prisma.adjectives.findUnique({
      where: { id: BigInt(item.adjective_id) },
      select: {
        id: true,
        code: true,
        gloss: true,
        lemmas: true,
        examples: true,
        flagged: true,
        flagged_reason: true,
        lexfile: true,
      },
    });
    if (!record) return null;
    return {
      dbId: record.id,
      code: record.code,
      pos: 'adjectives',
      gloss: record.gloss,
      lemmas: record.lemmas,
      examples: record.examples,
      flagged: record.flagged,
      flagged_reason: record.flagged_reason,
      lexfile: record.lexfile,
    };
  }

  if (item.adverb_id) {
    const record = await prisma.adverbs.findUnique({
      where: { id: BigInt(item.adverb_id) },
      select: {
        id: true,
        code: true,
        gloss: true,
        lemmas: true,
        examples: true,
        flagged: true,
        flagged_reason: true,
        lexfile: true,
      },
    });
    if (!record) return null;
    return {
      dbId: record.id,
      code: record.code,
      pos: 'adverbs',
      gloss: record.gloss,
      lemmas: record.lemmas,
      examples: record.examples,
      flagged: record.flagged,
      flagged_reason: record.flagged_reason,
      lexfile: record.lexfile,
    };
  }

  if (item.frame_id) {
    const record = await prisma.frames.findUnique({
      where: { id: BigInt(item.frame_id) },
      select: {
        id: true,
        label: true,
        definition: true,
        short_definition: true,
        prototypical_synset: true,
      },
    });
    if (!record) return null;
    return {
      dbId: record.id,
      code: record.id.toString(),
      pos: 'frames',
      gloss: record.definition,
      lemmas: [],
      examples: [],
      label: record.label,
      definition: record.definition,
      short_definition: record.short_definition,
      prototypical_synset: record.prototypical_synset,
    };
  }

  return null;
}

