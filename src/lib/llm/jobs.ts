import { Prisma } from '@prisma/client';
import type { llm_job_items } from '@prisma/client';
import type OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import { FLAGGING_RESPONSE_SCHEMA, type FlaggingResponse } from './schema';
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
} from './types';
import { getOpenAIClient } from './client';
import { translateFilterASTToPrisma } from '@/lib/filters/translate';
import type { BooleanFilterGroup } from '@/lib/filters/types';

const TERMINAL_ITEM_STATUSES = new Set(['succeeded', 'failed', 'skipped']);

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

export class LLMJobError extends Error {
  constructor(message: string, public statusCode = 500) {
    super(message);
    this.name = 'LLMJobError';
  }
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

  const items = Array.isArray(job.llm_job_items)
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
        entry: extractEntrySummary(item),
      }))
    : [];

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

function ensureOpenAIClient(): OpenAI {
  const client = getOpenAIClient();
  if (!client) {
    throw new LLMJobError('OpenAI client is not configured. Please set OPENAI_API_KEY.', 503);
  }
  return client;
}

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
    id: entry.code,
    code: entry.code,
    pos: entry.pos,
    gloss: entry.gloss ?? '',
    lemmas: entry.lemmas.join(', '),
    lemmas_json: JSON.stringify(entry.lemmas, null, 2),
    examples: entry.examples.join('\n'),
    examples_json: JSON.stringify(entry.examples, null, 2),
    flagged: entry.flagged ? 'true' : 'false',
    flagged_reason: entry.flagged_reason ?? '',
    frame_name: entry.frame_name ?? '',
    lexfile: entry.lexfile ?? '',
  };

  if (entry.additional) {
    for (const [key, value] of Object.entries(entry.additional)) {
      base[key] = stringify(value);
    }
  }

  return base;
}

export function renderPrompt(template: string, entry: LexicalEntrySummary): RenderedPrompt {
  const variables = buildVariableMap(entry);
  const prompt = template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    if (variables[key] !== undefined) {
      return variables[key];
    }
    return '';
  });

  return { prompt, variables };
}

export async function fetchEntriesForScope(scope: JobScope): Promise<LexicalEntrySummary[]> {
  switch (scope.kind) {
    case 'ids':
      return fetchEntriesByIds(scope.pos, scope.ids);
    case 'frame_ids':
      return fetchEntriesByFrameIds(scope.frameIds, scope.pos);
    case 'filters':
      return fetchEntriesByFilters(scope.pos, scope.filters);
    default:
      return [];
  }
}

async function fetchEntriesByIds(pos: PartOfSpeech, ids: string[]): Promise<LexicalEntrySummary[]> {
  if (ids.length === 0) return [];

  const uniqueIds = Array.from(new Set(ids));
  let entries: LexicalEntrySummary[] = [];

  if (pos === 'verbs') {
    const records = await prisma.verbs.findMany({
      where: { code: { in: uniqueIds } },
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
          select: {
            frame_name: true,
          },
        },
      },
    });

    const byCode = new Map(records.map(record => [record.code, record]));
    entries = uniqueIds
      .map(code => byCode.get(code))
      .filter((record): record is (typeof records)[number] => Boolean(record))
      .map(record => ({
        dbId: record.id,
        code: record.code,
        pos,
        gloss: record.gloss,
        lemmas: record.lemmas,
        examples: record.examples,
        flagged: record.flagged,
        flagged_reason: record.flagged_reason,
        frame_name: record.frames?.frame_name ?? null,
        lexfile: record.lexfile,
      }));
  } else if (pos === 'nouns') {
    const records = await prisma.nouns.findMany({
      where: { code: { in: uniqueIds } },
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
    const byCode = new Map(records.map(record => [record.code, record]));
    entries = uniqueIds
      .map(code => byCode.get(code))
      .filter((record): record is (typeof records)[number] => Boolean(record))
      .map(record => ({
        dbId: record.id,
        code: record.code,
        pos,
        gloss: record.gloss,
        lemmas: record.lemmas,
        examples: record.examples,
        flagged: record.flagged,
        flagged_reason: record.flagged_reason,
        lexfile: record.lexfile,
      }));
  } else {
    const records = await prisma.adjectives.findMany({
      where: { code: { in: uniqueIds } },
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
    const byCode = new Map(records.map(record => [record.code, record]));
    entries = uniqueIds
      .map(code => byCode.get(code))
      .filter((record): record is (typeof records)[number] => Boolean(record))
      .map(record => ({
        dbId: record.id,
        code: record.code,
        pos,
        gloss: record.gloss,
        lemmas: record.lemmas,
        examples: record.examples,
        flagged: record.flagged,
        flagged_reason: record.flagged_reason,
        lexfile: record.lexfile,
      }));
  }

  return entries;
}

async function fetchEntriesByFrameIds(frameIds: string[], pos?: PartOfSpeech): Promise<LexicalEntrySummary[]> {
  if (frameIds.length === 0) return [];

  const frames = await prisma.frames.findMany({
    where: {
      OR: frameIds.map(code =>
        code.match(/^\d+$/)
          ? { id: BigInt(code) }
          : { code: { equals: code, mode: 'insensitive' as Prisma.QueryMode } }
      ),
    },
    select: {
      id: true,
      code: true,
      frame_name: true,
      verbs: {
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
      },
    },
  });

  const entries: LexicalEntrySummary[] = [];
  for (const frame of frames) {
    for (const verb of frame.verbs) {
      entries.push({
        dbId: verb.id,
        code: verb.code,
        pos: pos ?? 'verbs',
        gloss: verb.gloss,
        lemmas: verb.lemmas,
        examples: verb.examples,
        flagged: verb.flagged,
        flagged_reason: verb.flagged_reason,
        frame_name: frame.frame_name,
        lexfile: verb.lexfile,
        additional: {
          frame_code: frame.code,
        },
      });
    }
  }

  return entries;
}

async function fetchEntriesByFilters(pos: PartOfSpeech, filters: { limit?: number; where?: BooleanFilterGroup | undefined } | Record<string, unknown>): Promise<LexicalEntrySummary[]> {
  // Backward compatibility: if filters is a plain object without 'where', try to use it as simple fields
  const limit = typeof (filters as { limit?: unknown }).limit === 'number' ? Number((filters as { limit?: number }).limit) : undefined;
  const ast = (filters as { where?: BooleanFilterGroup }).where as BooleanFilterGroup | undefined;
  const { where, computedFilters } = await translateFilterASTToPrisma(pos, ast);

  if (pos === 'verbs') {
    const takeArg = limit && limit > 0 ? limit : 50;
    const records = await prisma.verbs.findMany({
      where: where as Prisma.verbsWhereInput,
      take: takeArg,
      include: {
        _count: {
          select: {
            verb_relations_verb_relations_source_idToverbs: { where: { type: 'hypernym' } },
            verb_relations_verb_relations_target_idToverbs: { where: { type: 'hypernym' } },
          },
        },
        frames: { select: { frame_name: true } },
      },
    });

    let entries = records.map(record => ({
      dbId: record.id,
      code: (record as { code: string }).code,
      pos,
      gloss: record.gloss,
      lemmas: record.lemmas,
      examples: record.examples,
      flagged: record.flagged ?? undefined,
      flagged_reason: (record as { flagged_reason?: string | null }).flagged_reason ?? null,
      frame_name: (record as { frames?: { frame_name?: string } | null }).frames?.frame_name ?? null,
      lexfile: record.lexfile,
      // temporary attachment for filtering only
      _parentsCount: (record as any)._count?.verb_relations_verb_relations_source_idToverbs ?? 0,
      _childrenCount: (record as any)._count?.verb_relations_verb_relations_target_idToverbs ?? 0,
    })) as Array<LexicalEntrySummary & { _parentsCount: number; _childrenCount: number }>;

    // Apply computed filters on counts
    for (const cf of computedFilters) {
      const field = cf.field === 'parentsCount' ? '_parentsCount' : '_childrenCount';
      entries = entries.filter(e => compareNumber((e as any)[field] as number, cf.operator, cf.value, cf.value2));
    }

    // Strip temporary fields
    return entries.map(entry => {
      const { _parentsCount, _childrenCount, ...rest } = entry;
      void _parentsCount;
      void _childrenCount;
      return rest;
    });
  }

  if (pos === 'nouns') {
    const takeArg = limit && limit > 0 ? limit : 50;
    const records = await prisma.nouns.findMany({
      where: where as Prisma.nounsWhereInput,
      take: takeArg,
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
    return records.map(record => ({
      dbId: record.id,
      code: record.code,
      pos,
      gloss: record.gloss,
      lemmas: record.lemmas,
      examples: record.examples,
      flagged: record.flagged,
      flagged_reason: record.flagged_reason,
      lexfile: record.lexfile,
    }));
  }

  const takeArg = limit && limit > 0 ? limit : 50;
  const records = await prisma.adjectives.findMany({
    where: where as Prisma.adjectivesWhereInput,
    take: takeArg,
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
  return records.map(record => ({
    dbId: record.id,
    code: record.code,
    pos,
    gloss: record.gloss,
    lemmas: record.lemmas,
    examples: record.examples,
    flagged: record.flagged,
    flagged_reason: record.flagged_reason,
    lexfile: record.lexfile,
  }));
}

function compareNumber(actual: number, op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between', v: number, v2?: number): boolean {
  switch (op) {
    case 'eq':
      return actual === v;
    case 'neq':
      return actual !== v;
    case 'gt':
      return actual > v;
    case 'gte':
      return actual >= v;
    case 'lt':
      return actual < v;
    case 'lte':
      return actual <= v;
    case 'between':
      if (v2 === undefined) return true;
      return actual >= v && actual <= v2;
    default:
      return true;
  }
}

async function applyModerationResult(
  item: llm_job_items,
  entry: LexicalEntrySummary,
  result: FlaggingResponse,
  jobLabel?: string | null
): Promise<void> {
  const flagged = Boolean(result.flagged);
  const rawReason = (result.flagged_reason ?? '').trim();
  const prefixedReason = rawReason
    ? (jobLabel ? `Via ${jobLabel}: ${rawReason}` : rawReason)
    : null;

  if (item.verb_id) {
    await prisma.verbs.update({
      where: { id: item.verb_id },
      data: {
        flagged,
        flagged_reason: prefixedReason,
      },
    });
  } else if (item.noun_id) {
    await prisma.nouns.update({
      where: { id: item.noun_id },
      data: {
        flagged,
        flagged_reason: prefixedReason,
      },
    });
  } else if (item.adjective_id) {
    await prisma.adjectives.update({
      where: { id: item.adjective_id },
      data: {
        flagged,
        flagged_reason: prefixedReason,
      },
    });
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
        applied_at: new Date().toISOString(),
      },
      completed_at: new Date(),
    },
  });
}

async function updateJobAggregates(jobId: bigint) {
  const existing = await getLLMJobsDelegate().findUnique({
    where: { id: jobId },
    select: { status: true },
  });

  const [totals] = await prisma.$queryRaw<Array<{
    total: bigint;
    processed: bigint;
    succeeded: bigint;
    failed: bigint;
    flagged: bigint;
  }>>`SELECT
      COUNT(*)::bigint AS total,
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

  await getLLMJobsDelegate().update({
    where: { id: jobId },
    data: {
      total_items: Number(totals.total),
      processed_items: Number(totals.processed),
      succeeded_items: Number(totals.succeeded),
      failed_items: Number(totals.failed),
      flagged_items: Number(totals.flagged),
      status,
      completed_at:
        status === 'completed' || status === 'failed'
          ? new Date()
          : undefined,
    },
  });
}

export async function previewLLMJob(params: CreateLLMJobParams) {
  const entries = await fetchEntriesForScope(params.scope);
  const entry = entries[0];
  if (!entry) {
    throw new LLMJobError('No entries found for the provided scope.', 400);
  }

  return renderPrompt(params.promptTemplate, entry);
}

export async function createLLMJob(params: CreateLLMJobParams): Promise<SerializedJob> {
  const entries = await fetchEntriesForScope(params.scope);

  if (entries.length === 0) {
    throw new LLMJobError('No entries found for the provided scope.', 400);
  }

  const client = ensureOpenAIClient();
  const openAIServiceTier = normalizeServiceTier(params.serviceTier);

  const jobConfig: Prisma.InputJsonObject = {
    model: params.model,
    promptTemplate: params.promptTemplate,
    serviceTier: params.serviceTier ?? null,
    reasoning: params.reasoning ?? null,
    metadata: (params.metadata ?? {}) as Prisma.InputJsonObject,
  };

  const job = await getLLMJobsDelegate().create({
    data: {
      label: params.label ?? null,
      submitted_by: params.submittedBy ?? null,
      scope_kind: params.scope.kind,
      scope: params.scope as unknown as Prisma.JsonObject,
      config: jobConfig,
      provider: 'openai',
      llm_vendor: 'openai',
      status: 'queued',
      total_items: entries.length,
    },
  });

  const jobItems: llm_job_items[] = [];

  for (const entry of entries) {
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
        frame_name: entry.frame_name ?? null,
      },
    } satisfies Record<string, unknown>;

    const createdItem = await prisma.llm_job_items.create({
      data: {
        job_id: job.id,
        status: 'queued',
        verb_id: entry.pos === 'verbs' ? entry.dbId : null,
        noun_id: entry.pos === 'nouns' ? entry.dbId : null,
        adjective_id: entry.pos === 'adjectives' ? entry.dbId : null,
        request_payload: requestPayload,
      },
    });

    jobItems.push(createdItem);
  }

  await getLLMJobsDelegate().update({
    where: { id: job.id },
    data: {
      status: 'running',
      started_at: new Date(),
    },
  });

  for (const item of jobItems) {
    const payload = item.request_payload as Prisma.JsonObject;
    const renderedPrompt = String(payload.renderedPrompt ?? '');

    try {
      const response = await client.responses.create({
        model: params.model,
        input: renderedPrompt,
        background: true,
        store: true,
        metadata: {
          job_id: job.id.toString(),
          job_item_id: item.id.toString(),
        },
        service_tier: openAIServiceTier,
        reasoning: params.reasoning,
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
          request_payload: {
            ...payload,
            openai_request: {
              model: params.model,
              text_format: 'json_schema',
              service_tier: openAIServiceTier ?? undefined,
              reasoning: params.reasoning ?? undefined,
            },
          },
        },
      });
    } catch (error) {
      console.error('[LLM] Failed to submit background request:', error);
      await prisma.llm_job_items.update({
        where: { id: item.id },
        data: {
          status: 'failed',
          last_error: error instanceof Error ? error.message : 'Unknown OpenAI error',
          completed_at: new Date(),
        },
      });
    }
  }

  await updateJobAggregates(job.id);
  const result = await fetchJobRecord(job.id, { includeItems: true });
  if (!result) {
    throw new LLMJobError('Failed to load job after creation', 500);
  }
  return result;
}

async function refreshJobItems(job: SerializedJob): Promise<SerializedJob> {
  const client = ensureOpenAIClient();
  const staleItems = job.items.filter(item => !TERMINAL_ITEM_STATUSES.has(item.status));

  if (staleItems.length === 0) {
    return job;
  }

  for (const item of staleItems) {
    if (!item.provider_task_id) continue;

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
        continue;
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
        continue;
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
        continue;
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
          continue;
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
          continue;
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
          continue;
        }

        await applyModerationResult(
          await prisma.llm_job_items.findUniqueOrThrow({ where: { id: BigInt(item.id) } }),
          entry,
          parsed,
          job.label ?? null
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

  await updateJobAggregates(BigInt(job.id));
  const refreshedJob = await fetchJobRecord(BigInt(job.id), { includeItems: true });
  if (!refreshedJob) {
    throw new LLMJobError('Failed to fetch job after refresh', 500);
  }
  return refreshedJob;
}

async function fetchEntryForItem(item: SerializedJob['items'][number]): Promise<LexicalEntrySummary | null> {
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
          select: { frame_name: true },
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
      frame_name: record.frames?.frame_name ?? null,
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

  return null;
}

export async function listLLMJobs(options: JobListOptions = {}): Promise<SerializedJob[]> {
  let jobs: any[];
  try {
    jobs = await getLLMJobsDelegate().findMany({
      // Hide soft-deleted jobs from lists
      where: ({ deleted: false } as any),
      orderBy: { created_at: 'desc' },
      take: options.limit ?? 15,
      include: {
        llm_job_items: {
          orderBy: { id: 'asc' },
        },
      },
    });
  } catch (error) {
    // Fallback for environments where Prisma client hasn't been regenerated yet
    if (error instanceof Error && /Unknown argument\s+`?deleted`?/i.test(error.message)) {
      jobs = await getLLMJobsDelegate().findMany({
        orderBy: { created_at: 'desc' },
        take: options.limit ?? 15,
        include: {
          llm_job_items: {
            orderBy: { id: 'asc' },
          },
        },
      });
    } else {
      throw error;
    }
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
        entry: extractEntrySummary(item),
      })),
    } as SerializedJob;
  });

  if (options.refreshBeforeReturn !== false) {
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
  const job = await fetchJobRecord(BigInt(jobId), { includeItems: true, excludeDeleted: true });
  if (!job) {
    throw new LLMJobError('Job not found', 404);
  }

  if (options.refresh !== false && ['queued', 'running'].includes(job.status)) {
    return refreshJobItems(job);
  }

  return job;
}

export async function cancelLLMJob(jobId: number | string): Promise<CancelJobResult> {
  const job = await getLLMJob(jobId, { refresh: false });

  if (['completed', 'failed', 'cancelled'].includes(job.status)) {
    return { job, cancelledCount: 0 };
  }

  const client = ensureOpenAIClient();
  let cancelledCount = 0;

  for (const item of job.items) {
    if (TERMINAL_ITEM_STATUSES.has(item.status)) continue;
    if (!item.provider_task_id) continue;

    try {
      await client.responses.cancel(item.provider_task_id);
      cancelledCount += 1;
      await prisma.llm_job_items.update({
        where: { id: BigInt(item.id) },
        data: {
          status: 'failed',
          last_error: 'Cancelled by user',
          completed_at: new Date(),
        },
      });
    } catch (error) {
      console.error(`[LLM] Failed to cancel response ${item.provider_task_id}`, error);
      await prisma.llm_job_items.update({
        where: { id: BigInt(item.id) },
        data: {
          last_error: 'Failed to cancel provider job',
        },
      });
    }
  }

  await getLLMJobsDelegate().update({
    where: { id: BigInt(job.id) },
    data: {
      status: 'cancelled',
      completed_at: new Date(),
    },
  });

  const refreshed = await getLLMJob(jobId, { refresh: false });
  await updateJobAggregates(BigInt(refreshed.id));
  return { job: refreshed, cancelledCount };
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

