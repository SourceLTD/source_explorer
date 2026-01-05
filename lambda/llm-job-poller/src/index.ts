import { Handler } from 'aws-lambda';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { Lambda } from '@aws-sdk/client-lambda';

// Initialize clients with optimized settings for Lambda
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: ['error', 'warn'],
});

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60000, // 60 second timeout for API calls
  maxRetries: 6, // Up to 6 retries for API calls
}) : null;
const lambda = new Lambda({ region: process.env.AWS_REGION || 'us-east-1' });

const TERMINAL_ITEM_STATUSES = new Set(['succeeded', 'failed', 'skipped']);
const CONCURRENT_BATCH_SIZE = 50; // Increased from 20 to 50 for faster processing
const MAX_ITEMS_PER_JOB = 1000; // Poll up to 1000 items per invocation
const MAX_SUBMISSION_ITEMS = 1000; // Submit up to 1000 items per invocation
const SUBMISSION_CONCURRENCY = 25; // Parallel submissions - optimized for 80 connection pool (allows 3 concurrent Lambda invocations)
const MAX_CHAIN_DEPTH = 2; // Maximum number of self-invocations to prevent runaway loops
const ITEM_TIMEOUT_HOURS = 2; // Mark items as failed if processing for more than 2 hours
const STUCK_JOB_TIMEOUT_HOURS = 48; // Mark entire job as failed if running for more than 48 hours

// JSON Schema for OpenAI structured output
const FLAGGING_RESPONSE_SCHEMA = {
  name: 'lexical_flagging_response',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['flagged', 'flagged_reason', 'confidence', 'notes'],
    properties: {
      flagged: {
        type: 'boolean',
        description: 'Whether the entry should be marked as flagged.',
      },
      flagged_reason: {
        type: 'string',
        description: 'Short explanation for why the entry should be flagged. Leave empty string if not flagged.',
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence score for the recommendation (0-1).',
      },
      notes: {
        type: 'string',
        description: 'Optional analyst notes or remediation ideas. Use empty string if none.',
      },
    },
  },
} as const;

interface FlaggingResponse {
  flagged: boolean;
  flagged_reason?: string | null;
  confidence?: number | null;
  notes?: string | null;
}

interface PollStats {
  itemsSubmitted: number;
  itemsFailed: number;
  submissionErrors: number;
  jobsPolled: number;
  itemsPolled: number;
  itemsUpdated: number;
  jobsResolved: string[];
  errors: number;
  chainDepth?: number;
  retriggered?: boolean;
}

/**
 * Normalize service tier values for OpenAI API
 */
function normalizeServiceTier(
  tier?: 'default' | 'flex' | 'auto' | 'priority'
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
 * Refresh a single job item by polling OpenAI
 */
async function refreshSingleItem(
  item: { id: string; provider_task_id: string | null; attempt_count?: number | null; created_at?: Date; [key: string]: any },
  jobId: string,
  jobLabel: string | null
): Promise<boolean> {
  if (!item.provider_task_id || !openai) return false;

  const attemptCount = Number(item.attempt_count ?? 0);

  try {
    const response = await openai.responses.retrieve(item.provider_task_id);
    const responsePayload = JSON.parse(JSON.stringify(response));

    if (response.status === 'queued' || response.status === 'in_progress') {
      await prisma.llm_job_items.update({
        where: { id: BigInt(item.id) },
        data: {
          status: 'processing',
          response_payload: responsePayload,
        },
      });
      return true;
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
      return true;
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
      return true;
    }

    if (response.status === 'completed') {
      // Extract output text from the response
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
          `[Lambda] Completed response ${response.id} missing output content; will retry on next poll.`
        );
        await prisma.llm_job_items.update({
          where: { id: BigInt(item.id) },
          data: {
            status: 'processing',
            response_payload: responsePayload,
          },
        });
        return true;
      }

      let parsed: FlaggingResponse | null = null;
      try {
        parsed = JSON.parse(outputText) as FlaggingResponse;
      } catch (error) {
        console.error('[Lambda] Failed to parse response JSON:', error);
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
        return true;
      }

      // Apply the moderation result to the appropriate entity
      await applyModerationResult(item, parsed, jobLabel);

      // Update item with response metadata
      await prisma.llm_job_items.update({
        where: { id: BigInt(item.id) },
        data: {
          response_payload: responsePayload,
          input_tokens: response.usage?.input_tokens ?? 0,
          output_tokens: response.usage?.output_tokens ?? 0,
        },
      });

      return true;
    }

    return false;
  } catch (error) {
    console.error('[Lambda] Error refreshing job item:', error);
    
    // Increment attempt count for tracking purposes
    await prisma.llm_job_items.update({
      where: { id: BigInt(item.id) },
      data: {
        last_error: error instanceof Error ? error.message : 'Unexpected refresh error',
        attempt_count: attemptCount + 1,
      },
    });
    
    throw error; // Re-throw to count as error in stats
  }
}

/**
 * Apply moderation result to the database entry
 */
async function applyModerationResult(
  item: { verb_id?: string | null; noun_id?: string | null; adjective_id?: string | null; adverb_id?: string | null; frame_id?: string | null; [key: string]: any },
  result: FlaggingResponse,
  jobLabel: string | null
): Promise<void> {
  const shouldFlag = result.flagged;
  const flaggedReason = shouldFlag ? `${jobLabel ?? 'LLM'}: ${result.flagged_reason ?? 'Flagged by AI'}` : null;

  // Determine which entity type and update accordingly
  if (item.verb_id) {
    await prisma.verbs.update({
      where: { id: BigInt(item.verb_id) },
      data: {
        flagged: shouldFlag,
        flagged_reason: flaggedReason,
      },
    });
    await prisma.llm_job_items.update({
      where: { id: BigInt(item.id) },
      data: {
        status: 'succeeded',
        flagged: shouldFlag,
        completed_at: new Date(),
      },
    });
  } else if (item.noun_id) {
    await prisma.nouns.update({
      where: { id: BigInt(item.noun_id) },
      data: {
        flagged: shouldFlag,
        flagged_reason: flaggedReason,
      },
    });
    await prisma.llm_job_items.update({
      where: { id: BigInt(item.id) },
      data: {
        status: 'succeeded',
        flagged: shouldFlag,
        completed_at: new Date(),
      },
    });
  } else if (item.adjective_id) {
    await prisma.adjectives.update({
      where: { id: BigInt(item.adjective_id) },
      data: {
        flagged: shouldFlag,
        flagged_reason: flaggedReason,
      },
    });
    await prisma.llm_job_items.update({
      where: { id: BigInt(item.id) },
      data: {
        status: 'succeeded',
        flagged: shouldFlag,
        completed_at: new Date(),
      },
    });
  } else if (item.adverb_id) {
    await prisma.adverbs.update({
      where: { id: BigInt(item.adverb_id) },
      data: {
        flagged: shouldFlag,
        flagged_reason: flaggedReason,
      },
    });
    await prisma.llm_job_items.update({
      where: { id: BigInt(item.id) },
      data: {
        status: 'succeeded',
        flagged: shouldFlag,
        completed_at: new Date(),
      },
    });
  } else if (item.frame_id) {
    await prisma.frames.update({
      where: { id: BigInt(item.frame_id) },
      data: {
        flagged: shouldFlag,
        flagged_reason: flaggedReason,
      },
    });
    await prisma.llm_job_items.update({
      where: { id: BigInt(item.id) },
      data: {
        status: 'succeeded',
        flagged: shouldFlag,
        completed_at: new Date(),
      },
    });
  }
}

/**
 * Update job aggregate counts
 */
async function updateJobAggregates(jobId: bigint): Promise<void> {
  const existing = await prisma.llm_jobs.findUnique({
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

  await prisma.llm_jobs.update({
    where: { id: jobId },
    data: {
      total_items: Number(totals.total),
      submitted_items: Number(totals.submitted),
      processed_items: Number(totals.processed),
      succeeded_items: Number(totals.succeeded),
      failed_items: Number(totals.failed),
      flagged_items: Number(totals.flagged),
      status,
      completed_at: status === 'completed' || status === 'failed' ? new Date() : null,
    },
  });
}

/**
 * Submit queued items to OpenAI (up to MAX_SUBMISSION_ITEMS across all active jobs)
 */
async function submitQueuedItems(): Promise<{ submitted: number; failed: number; errors: Array<{ itemId: string; error: string }> }> {
  if (!openai) {
    console.warn('[Lambda] OpenAI client not available for submission');
    return { submitted: 0, failed: 0, errors: [] };
  }

  console.log(`[Lambda] Fetching queued items for submission (max ${MAX_SUBMISSION_ITEMS})`);

  // 1. Fetch up to MAX_SUBMISSION_ITEMS queued items across ALL active jobs
  const candidateItems = await prisma.llm_job_items.findMany({
    where: {
      status: 'queued',
      provider_task_id: null,
      llm_jobs: {
        status: {
          in: ['queued', 'running'],
        },
        deleted: false,
      },
    },
    take: MAX_SUBMISSION_ITEMS,
    orderBy: { id: 'asc' },
    select: {
      id: true,
      job_id: true,
      request_payload: true,
      llm_jobs: {
        select: {
          id: true,
          status: true,
          config: true,
        },
      },
    },
  });

  if (candidateItems.length === 0) {
    console.log('[Lambda] No queued items to submit');
    return { submitted: 0, failed: 0, errors: [] };
  }

  // 2. ATOMIC CLAIM: Update status to 'submitting' to prevent duplicate submissions
  // Only items that are still 'queued' will be updated (race condition protection)
  const itemIds = candidateItems.map(item => item.id);
  const claimResult = await prisma.llm_job_items.updateMany({
    where: {
      id: { in: itemIds },
      status: 'queued', // Only claim if still queued
      provider_task_id: null, // Only claim if not already submitted
    },
    data: {
      status: 'submitting', // Temporary status during submission
      started_at: new Date(),
    },
  });

  console.log(`[Lambda] Claimed ${claimResult.count} of ${candidateItems.length} items for submission`);

  if (claimResult.count === 0) {
    console.log('[Lambda] No items claimed (already being processed by another Lambda)');
    return { submitted: 0, failed: 0, errors: [] };
  }

  // 3. Fetch the claimed items with full data
  const items = await prisma.llm_job_items.findMany({
    where: {
      id: { in: itemIds },
      status: 'submitting',
    },
    select: {
      id: true,
      job_id: true,
      request_payload: true,
      llm_jobs: {
        select: {
          id: true,
          status: true,
          config: true,
        },
      },
    },
  });

  console.log(`[Lambda] Submitting ${items.length} claimed items to OpenAI`);

  // 4. Update job status from 'queued' to 'running' for all affected jobs
  const jobsToUpdate = new Set(
    items
      .filter(item => item.llm_jobs.status === 'queued')
      .map(item => item.job_id.toString())
  );

  for (const jobId of jobsToUpdate) {
    await prisma.llm_jobs.update({
      where: { id: BigInt(jobId) },
      data: { status: 'running', started_at: new Date() },
    });
  }

  // 5. Helper function to submit a single item with retry logic
  const submitItem = async (item: typeof items[number], retries = 3): Promise<{ success: boolean; itemId: bigint; error?: string }> => {
    const payload = item.request_payload as any;
    const renderedPrompt = String(payload.renderedPrompt ?? '');
    const config = item.llm_jobs.config as any;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await openai!.responses.create({
          model: config?.model ?? 'gpt-5-nano',
          input: renderedPrompt,
          background: true,
          store: true,
          metadata: {
            job_id: item.job_id.toString(),
            job_item_id: item.id.toString(),
          },
          service_tier: normalizeServiceTier(config?.serviceTier),
          reasoning: config?.reasoning,
          text: {
            format: {
              type: 'json_schema',
              name: FLAGGING_RESPONSE_SCHEMA.name,
              strict: FLAGGING_RESPONSE_SCHEMA.strict,
              schema: FLAGGING_RESPONSE_SCHEMA.schema,
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
        // Categorize errors for retry logic
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
          console.log(`[Lambda] Retrying item ${item.id} after ${delayMs}ms (attempt ${attempt + 1}/${retries}) - Error: ${error?.message || 'Unknown'}`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }

        // Final failure - categorize the error type
        let errorMessage = error instanceof Error ? error.message : 'Submission failed';

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

  // 6. Submit items in controlled batches to avoid connection pool exhaustion
  // Process SUBMISSION_CONCURRENCY items at a time
  let submitted = 0;
  let failed = 0;
  const errors: Array<{ itemId: string; error: string }> = [];

  for (let i = 0; i < items.length; i += SUBMISSION_CONCURRENCY) {
    const batch = items.slice(i, i + SUBMISSION_CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(item => submitItem(item))
    );

    // Count results for this batch
    for (const result of batchResults) {
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
    
    // Small delay between batches
    if (i + SUBMISSION_CONCURRENCY < items.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // 7. Update job aggregates for all affected jobs
  const affectedJobIds = new Set(items.map(item => item.job_id));
  for (const jobId of affectedJobIds) {
    await prisma.llm_jobs.update({
      where: { id: jobId },
      data: {
        submitted_items: { increment: submitted },
      },
    });
    await updateJobAggregates(jobId);
  }

  console.log(`[Lambda] Submission complete: ${submitted} submitted, ${failed} failed`);
  return { submitted, failed, errors };
}

/**
 * Poll a single job's items
 */
async function pollJob(jobId: string, jobLabel: string | null): Promise<{ itemsPolled: number; itemsUpdated: number; errors: number; resolved: boolean }> {
  console.log(`[Lambda] Polling job ${jobId}`);

  // Fetch items that need polling
  const items = await prisma.llm_job_items.findMany({
    where: {
      job_id: BigInt(jobId),
      status: {
        notIn: ['succeeded', 'failed', 'skipped'],
      },
    },
    orderBy: { id: 'asc' },
    take: MAX_ITEMS_PER_JOB,
    select: {
      id: true,
      provider_task_id: true,
      attempt_count: true,
      created_at: true,
      verb_id: true,
      noun_id: true,
      adjective_id: true,
      adverb_id: true,
      frame_id: true,
    },
  });

  if (items.length === 0) {
    console.log(`[Lambda] No items to poll for job ${jobId}`);
    // Still update aggregates in case something changed
    await updateJobAggregates(BigInt(jobId));
    
    // Check if job is now resolved
    const job = await prisma.llm_jobs.findUnique({
      where: { id: BigInt(jobId) },
      select: { status: true },
    });
    
    return {
      itemsPolled: 0,
      itemsUpdated: 0,
      errors: 0,
      resolved: job?.status === 'completed' || job?.status === 'failed' || job?.status === 'cancelled',
    };
  }

  console.log(`[Lambda] Polling ${items.length} items for job ${jobId}`);

  let itemsUpdated = 0;
  let errors = 0;

  // Process items in parallel batches
  for (let i = 0; i < items.length; i += CONCURRENT_BATCH_SIZE) {
    const batch = items.slice(i, i + CONCURRENT_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(item => refreshSingleItem(item as any, jobId, jobLabel))
    );

    results.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) {
        itemsUpdated++;
      } else if (result.status === 'rejected') {
        console.error(`[Lambda] Failed to refresh item ${batch[idx].id}:`, result.reason);
        errors++;
      }
    });
  }

  // AFTER polling, mark items that have been processing for too long as failed
  const itemTimeoutMs = ITEM_TIMEOUT_HOURS * 60 * 60 * 1000;
  const timeoutThreshold = new Date(Date.now() - itemTimeoutMs);
  const timedOutResult = await prisma.llm_job_items.updateMany({
    where: {
      job_id: BigInt(jobId),
      status: { in: ['queued', 'processing'] },
      created_at: { lt: timeoutThreshold },
    },
    data: {
      status: 'failed',
      last_error: `Item exceeded ${ITEM_TIMEOUT_HOURS} hour timeout`,
      completed_at: new Date(),
    },
  });
  
  if (timedOutResult.count > 0) {
    console.warn(`[Lambda] Marked ${timedOutResult.count} items as failed due to ${ITEM_TIMEOUT_HOURS}h timeout for job ${jobId}`);
  }

  // Update job aggregates
  await updateJobAggregates(BigInt(jobId));

  // Check if job is now resolved
  const job = await prisma.llm_jobs.findUnique({
    where: { id: BigInt(jobId) },
    select: { status: true },
  });

  return {
    itemsPolled: items.length,
    itemsUpdated,
    errors,
    resolved: job?.status === 'completed' || job?.status === 'failed' || job?.status === 'cancelled',
  };
}

/**
 * Process recently cancelled jobs by cancelling their items at OpenAI
 */
async function processCancelledJobs(): Promise<{ jobsProcessed: number; itemsCancelled: number; errors: number }> {
  if (!openai) {
    console.warn('[Lambda] OpenAI client not available for cancellation');
    return { jobsProcessed: 0, itemsCancelled: 0, errors: 0 };
  }

  console.log('[Lambda] Processing cancelled jobs');

  // Find cancelled jobs that still have non-terminal items with provider task IDs
  const cancelledJobs = await prisma.llm_jobs.findMany({
    where: {
      status: 'cancelled',
      deleted: false,
    },
    select: {
      id: true,
      label: true,
    },
  });

  if (cancelledJobs.length === 0) {
    console.log('[Lambda] No cancelled jobs to process');
    return { jobsProcessed: 0, itemsCancelled: 0, errors: 0 };
  }

  console.log(`[Lambda] Found ${cancelledJobs.length} cancelled job(s) to process`);

  let totalItemsCancelled = 0;
  let totalErrors = 0;
  const CANCEL_BATCH_SIZE = 50;

  for (const job of cancelledJobs) {
    try {
      // Find items that need cancellation at OpenAI
      const itemsToCancel = await prisma.llm_job_items.findMany({
        where: {
          job_id: job.id,
          status: {
            notIn: ['succeeded', 'failed', 'skipped'],
          },
          provider_task_id: {
            not: null,
          },
        },
        select: {
          id: true,
          provider_task_id: true,
        },
      });

      if (itemsToCancel.length === 0) {
        console.log(`[Lambda] No items to cancel for job ${job.id}`);
        continue;
      }

      console.log(`[Lambda] Cancelling ${itemsToCancel.length} items for job ${job.id}`);

      // Cancel items at OpenAI in batches
      for (let i = 0; i < itemsToCancel.length; i += CANCEL_BATCH_SIZE) {
        const batch = itemsToCancel.slice(i, i + CANCEL_BATCH_SIZE);

        const results = await Promise.allSettled(
          batch.map(async (item) => {
            try {
              // Cancel at OpenAI
              await openai!.responses.cancel(item.provider_task_id!);

              // Update item in database
              await prisma.llm_job_items.update({
                where: { id: item.id },
                data: {
                  status: 'failed',
                  last_error: 'Cancelled by user',
                  completed_at: new Date(),
                },
              });

              return { success: true };
            } catch (error) {
              console.error(`[Lambda] Failed to cancel item ${item.id}:`, error);
              
              // Still mark as failed in database even if OpenAI cancel fails
              await prisma.llm_job_items.update({
                where: { id: item.id },
                data: {
                  status: 'failed',
                  last_error: `Cancellation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  completed_at: new Date(),
                },
              }).catch(e => console.error('[Lambda] Failed to update item:', e));

              return { success: false };
            }
          })
        );

        // Count successes
        const successCount = results.filter(
          r => r.status === 'fulfilled' && r.value.success
        ).length;
        totalItemsCancelled += successCount;
        totalErrors += results.length - successCount;
      }

      // Update job aggregates after cancelling items
      await updateJobAggregates(job.id);

    } catch (error) {
      console.error(`[Lambda] Failed to process cancelled job ${job.id}:`, error);
      totalErrors++;
    }
  }

  console.log(`[Lambda] Cancelled ${totalItemsCancelled} items across ${cancelledJobs.length} job(s), ${totalErrors} errors`);
  return { jobsProcessed: cancelledJobs.length, itemsCancelled: totalItemsCancelled, errors: totalErrors };
}

/**
 * Main Lambda handler
 */
export const handler: Handler = async (event, context) => {
  if (!openai) {
    console.error('[Lambda] OPENAI_API_KEY not configured');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'OpenAI client not configured' }),
    };
  }

  const chainDepth = event?.chainDepth || 0;
  const stats: PollStats = {
    itemsSubmitted: 0,
    itemsFailed: 0,
    submissionErrors: 0,
    jobsPolled: 0,
    itemsPolled: 0,
    itemsUpdated: 0,
    jobsResolved: [],
    errors: 0,
    chainDepth,
    retriggered: false,
  };

  try {
    console.log(`[Lambda] Starting LLM job processor (chain depth: ${chainDepth})`);

    // Mark any jobs that have been running too long as failed (safety valve)
    const stuckJobsTimeout = new Date(Date.now() - STUCK_JOB_TIMEOUT_HOURS * 60 * 60 * 1000);
    const stuckJobsResult = await prisma.llm_jobs.updateMany({
      where: {
        status: { in: ['queued', 'running'] },
        created_at: { lt: stuckJobsTimeout },
        deleted: false,
      },
      data: {
        status: 'failed',
        completed_at: new Date(),
      },
    });
    
    if (stuckJobsResult.count > 0) {
      console.warn(`[Lambda] Marked ${stuckJobsResult.count} stuck jobs as failed (running > ${STUCK_JOB_TIMEOUT_HOURS} hours)`);
      
      // Also mark all their pending items as failed
      await prisma.$executeRaw`
        UPDATE llm_job_items
        SET status = 'failed', 
            last_error = 'Job exceeded maximum runtime',
            completed_at = NOW()
        WHERE job_id IN (
          SELECT id FROM llm_jobs 
          WHERE status = 'failed' 
          AND created_at < ${stuckJobsTimeout}
        )
        AND status NOT IN ('succeeded', 'failed', 'skipped')
      `;
    }

    // Reset items stuck in 'submitting' status (race condition recovery)
    // If a Lambda crashed during submission, these items need to be reset to 'queued'
    const submittingTimeout = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    const stuckSubmittingResult = await prisma.llm_job_items.updateMany({
      where: {
        status: 'submitting',
        started_at: { lt: submittingTimeout },
      },
      data: {
        status: 'queued',
        started_at: null,
      },
    });
    
    if (stuckSubmittingResult.count > 0) {
      console.warn(`[Lambda] Reset ${stuckSubmittingResult.count} items stuck in 'submitting' status (likely from crashed Lambda)`);
    }

    // PRIORITY 0: Process cancelled jobs - cancel items at OpenAI
    console.log('[Lambda] Phase 0: Processing cancelled jobs');
    try {
      const cancellationResult = await processCancelledJobs();
      if (cancellationResult.itemsCancelled > 0) {
        console.log(`[Lambda] Cancelled ${cancellationResult.itemsCancelled} items from ${cancellationResult.jobsProcessed} job(s)`);
      }
      if (cancellationResult.errors > 0) {
        console.warn(`[Lambda] ${cancellationResult.errors} errors during cancellation`);
      }
    } catch (error) {
      console.error('[Lambda] Error during cancellation phase:', error);
      stats.errors++;
    }

    // PRIORITY 1: Submit queued items to OpenAI
    console.log('[Lambda] Phase 1: Submitting queued items');
    try {
      const submissionResult = await submitQueuedItems();
      stats.itemsSubmitted = submissionResult.submitted;
      stats.itemsFailed = submissionResult.failed;
      stats.submissionErrors = submissionResult.errors.length;
      
      if (submissionResult.submitted > 0) {
        console.log(`[Lambda] Submitted ${submissionResult.submitted} items to OpenAI`);
      }
      if (submissionResult.failed > 0) {
        console.warn(`[Lambda] Failed to submit ${submissionResult.failed} items`);
      }
    } catch (error) {
      console.error('[Lambda] Error during submission phase:', error);
      stats.errors++;
    }

    // PRIORITY 2: Poll already-submitted items for status updates
    console.log('[Lambda] Phase 2: Polling submitted items');
    const activeJobs = await prisma.llm_jobs.findMany({
      where: {
        status: {
          in: ['queued', 'running'],
        },
        deleted: false,
      },
      select: {
        id: true,
        label: true,
      },
      orderBy: { created_at: 'asc' },
    });

    console.log(`[Lambda] Found ${activeJobs.length} active jobs to poll`);

    // Poll each job
    for (const job of activeJobs) {
      try {
        const result = await pollJob(job.id.toString(), job.label);
        stats.jobsPolled++;
        stats.itemsPolled += result.itemsPolled;
        stats.itemsUpdated += result.itemsUpdated;
        stats.errors += result.errors;
        
        if (result.resolved) {
          stats.jobsResolved.push(job.id.toString());
        }
      } catch (error) {
        console.error(`[Lambda] Failed to poll job ${job.id}:`, error);
        stats.errors++;
      }
    }

    console.log('[Lambda] Processing complete:', stats);

    // Check if there are still pending items and we haven't hit the recursion limit
    const pendingCount = await prisma.llm_job_items.count({
      where: {
        status: { notIn: ['succeeded', 'failed', 'skipped'] },
        llm_jobs: {
          status: { in: ['queued', 'running'] },
          deleted: false,
        },
      },
    });

    if (pendingCount > 0 && chainDepth < MAX_CHAIN_DEPTH) {
      console.log(`[Lambda] Still ${pendingCount} pending items, triggering another invocation (depth ${chainDepth + 1}/${MAX_CHAIN_DEPTH})`);
      
      // Invoke Lambda again asynchronously (don't wait for it)
      lambda.invoke({
        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
        InvocationType: 'Event', // Asynchronous invocation
        Payload: JSON.stringify({ chainDepth: chainDepth + 1 }),
      }).catch(err => {
        console.error('[Lambda] Failed to trigger next invocation:', err);
      });
      
      stats.retriggered = true;
    } else if (pendingCount > 0) {
      console.log(`[Lambda] Still ${pendingCount} pending items, but max chain depth (${MAX_CHAIN_DEPTH}) reached. Waiting for next scheduled run.`);
    } else {
      console.log('[Lambda] No pending items remaining.');
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        stats,
        pendingRemaining: pendingCount,
      }),
    };
  } catch (error) {
    console.error('[Lambda] Fatal error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        stats,
      }),
    };
  } finally {
    // Don't disconnect Prisma in Lambda - let the connection be reused
    // await prisma.$disconnect();
  }
};

