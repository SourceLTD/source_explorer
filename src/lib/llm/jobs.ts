import { Prisma } from '@prisma/client';
import type { llm_job_items } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  CancelJobResult,
  CreateLLMJobParams,
  JobDetailOptions,
  JobEntityTypeFilter,
  JobListOptions,
  JobScope,
  LexicalUnitSummary,
  JobTargetType,
  RenderedPrompt,
  SerializedJob,
  SerializedJobItem,
} from './types';
import { discardByLlmJob } from '@/lib/version-control';
import { withRetry } from '@/lib/db-utils';
import { callSourceClustering } from '@/lib/clustering/sourceClustering';

import { fetchUnitsForScope, countEntriesForScope } from './entries';

export { fetchUnitsForScope };

// NOTE: Execution (submitting to OpenAI + applying results) is handled by `source-llm`.
// source-explorer is responsible for job creation + UI read paths only.

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

/**
 * Enriches a list of job items with real codes and labels from the database 
 * if they are missing or appear to be numeric IDs in the request_payload.
 * For frames, always fetch the code since it might be incorrectly set to the label.
 */
async function enrichJobItemsWithDbCodes(items: any[]): Promise<void> {
  if (items.length === 0) return;

  const frameIdsToFetch = new Set<bigint>();
  const luIdsToFetch = new Set<bigint>();
  
  for (const item of items) {
    const entry = item.entry;
    if (!entry) continue;

    // For frames, always fetch since code might be incorrectly set to label
    if (item.frame_id) {
      frameIdsToFetch.add(BigInt(item.frame_id));
    } else if (item.lexical_unit_id) {
      // For lexical units, only fetch if code looks wrong
      const looksLikeId = entry.code && /^\d+$/.test(entry.code);
      if (!entry.code || entry.code === '' || looksLikeId) {
        luIdsToFetch.add(BigInt(item.lexical_unit_id));
      }
    }
  }

  if (frameIdsToFetch.size === 0 && luIdsToFetch.size === 0) return;

  const MAX_BIND_VARS = 15000;
  
  const fetchFrames = async () => {
    const ids = Array.from(frameIdsToFetch);
    const records: any[] = [];
    for (let i = 0; i < ids.length; i += MAX_BIND_VARS) {
      const chunk = ids.slice(i, i + MAX_BIND_VARS);
      const chunkRecords = await prisma.frames.findMany({
        where: { id: { in: chunk } },
        select: { id: true, code: true, label: true }
      });
      records.push(...chunkRecords);
    }
    return records;
  };

  const fetchLUs = async () => {
    const ids = Array.from(luIdsToFetch);
    const records: any[] = [];
    for (let i = 0; i < ids.length; i += MAX_BIND_VARS) {
      const chunk = ids.slice(i, i + MAX_BIND_VARS);
      const chunkRecords = await prisma.lexical_units.findMany({
        where: { id: { in: chunk } },
        select: { id: true, code: true }
      });
      records.push(...chunkRecords);
    }
    return records;
  };

  const [frameRecords, luRecords] = await Promise.all([
    frameIdsToFetch.size > 0 ? fetchFrames() : Promise.resolve([]),
    luIdsToFetch.size > 0 ? fetchLUs() : Promise.resolve([])
  ]);

  const frameMap = new Map(frameRecords.map(r => [r.id, r]));
  const luMap = new Map(luRecords.map(r => [r.id, r]));

  for (const item of items) {
    const entry = item.entry;
    if (!entry) continue;

    if (item.frame_id) {
      const frame = frameMap.get(BigInt(item.frame_id));
      if (frame) {
        // Always use the DB code for frames (prioritize code > label > id)
        entry.code = frame.code ?? frame.label ?? frame.id.toString();
        if (frame.label) entry.label = frame.label;
      }
    } else if (item.lexical_unit_id) {
      const looksLikeId = entry.code && /^\d+$/.test(entry.code);
      if (!entry.code || entry.code === '' || looksLikeId) {
        const lu = luMap.get(BigInt(item.lexical_unit_id));
        if (lu) {
          entry.code = lu.code;
        }
      }
    }
  }
}

function isLexicalUnitPOS(pos: string | null): boolean {
  return pos === 'verb' || pos === 'noun' || pos === 'adjective' || pos === 'adverb' || pos === 'lexical_units';
}

function inferTargetTypeFromJobScope(scope: JobScope | null): JobTargetType | null {
  if (!scope) return null;
  if (scope.kind === 'ids') return scope.targetType;
  if (scope.kind === 'filters') return scope.targetType;
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
  excludeDeleted?: boolean;
  statusLimits?: {
    pending?: number;
    succeeded?: number;
    failed?: number;
  };
}

async function fetchJobRecord(jobId: bigint, options: FetchOptions = {}): Promise<SerializedJob | null> {
  let job: any;
  try {
    job = await getLLMJobsDelegate().findFirst({
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

  let items: Array<SerializedJobItem & { 
    entry: { 
      code: string | null; 
      pos: JobTargetType | null; 
      gloss?: string | null; 
      lemmas?: string[] | null;
      label?: string | null;
      isSuperFrame?: boolean | null;
      lexical_units?: any[] | null;
      roles?: any[] | null;
      child_frames?: any[] | null;
    } 
  }> = Array.isArray(job.llm_job_items)
    ? job.llm_job_items.map((item: llm_job_items) => ({
        ...item,
        id: item.id.toString(),
        job_id: item.job_id.toString(),
        created_at: item.created_at.toISOString(),
        updated_at: item.updated_at.toISOString(),
        started_at: item.started_at ? item.started_at.toISOString() : null,
        completed_at: item.completed_at ? item.completed_at.toISOString() : null,
        lexical_unit_id: item.lexical_unit_id ? item.lexical_unit_id.toString() : null,
        frame_id: item.frame_id ? item.frame_id.toString() : null,
        entry: extractEntrySummary(item),
      }))
    : [];

  if (options.includeItems && items.length > 0) {
    await enrichJobItemsWithDbCodes(items);
  }

  if (options.statusLimits) {
    const { pending, succeeded, failed } = options.statusLimits;
    const pendingItems = items.filter(item => item.status === 'queued' || item.status === 'processing');
    const succeededItems = items.filter(item => item.status === 'succeeded');
    const failedItems = items.filter(item => item.status === 'failed');
    const otherItems = items.filter(item => 
      item.status !== 'queued' && 
      item.status !== 'processing' && 
      item.status !== 'succeeded' && 
      item.status !== 'failed'
    );
    
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
  pos: JobTargetType | null;
  gloss?: string | null;
  lemmas?: string[] | null;
  label?: string | null;
  isSuperFrame?: boolean | null;
  lexical_units?: any[] | null;
  roles?: any[] | null;
  child_frames?: any[] | null;
} {
  const payload = (item.request_payload as Prisma.JsonObject | null) ?? {};
  const entry = (payload.entry as Prisma.JsonObject | undefined) ?? {};
  const frameInfo = (payload.frameInfo as Prisma.JsonObject | undefined) ?? {};
  
  // Be extremely robust with type extraction from JSON
  const rawCode = entry.code;
  const rawLabel = entry.label || frameInfo.name;
  
  const code = rawCode !== null && rawCode !== undefined ? String(rawCode) : null;
  const label = rawLabel !== null && rawLabel !== undefined ? String(rawLabel) : null;
  const pos = (entry.pos as JobTargetType) ?? (item.frame_id ? 'frames' : null);

  // Determine if it is a super frame
  const isSuperFrame = (entry.isSuperFrame as boolean) ?? (item.frame_id ? (entry.child_frames && (entry.child_frames as any[]).length > 0) : false);

  return {
    // Always prefer code if available and not just a numeric ID fallback
    code: (code && code.trim() !== '' && !/^\d+$/.test(code)) ? code : (label && label.trim() !== '' && !/^\d+$/.test(label)) ? label : code || label || (item.frame_id ?? item.lexical_unit_id ?? item.id).toString(),
    pos,
    gloss: (entry.gloss as string) ?? null,
    lemmas: (entry.lemmas as string[]) ?? null,
    label,
    isSuperFrame,
    lexical_units: (entry.lexical_units as any[]) ?? null,
    roles: (entry.roles as any[]) ?? null,
    child_frames: (entry.child_frames as any[]) ?? null,
  };
}

/**
 * Build a flat variable map for simple {{variable}} interpolation.
 */
function buildVariableMap(entry: LexicalUnitSummary): Record<string, string> {
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

  if (entry.pos === 'frames') {
    base.definition = entry.definition ?? '';
    base.short_definition = entry.short_definition ?? '';
    base.super_frame_id = entry.super_frame_id ?? '';
    base['super_frame.id'] = entry.super_frame?.id ?? '';
    base['super_frame.code'] = entry.super_frame?.code ?? '';
    base['super_frame.label'] = entry.super_frame?.label ?? '';
    base['super_frame.definition'] = entry.super_frame?.definition ?? '';
    base['super_frame.short_definition'] = entry.super_frame?.short_definition ?? '';
    base.flagged = entry.flagged ? 'true' : 'false';
    base.flagged_reason = entry.flagged_reason ?? '';
    base.verifiable = entry.verifiable ? 'true' : 'false';
    base.unverifiable_reason = entry.unverifiable_reason ?? '';
    base.roles_count = String(entry.roles?.length ?? 0);
    
    // Handle superframes vs regular frames
    if (entry.isSuperFrame) {
      base.child_frames_count = String(entry.child_frames?.length ?? 0);
      // Don't include lexical_units_count for superframes
    } else {
      base.lexical_units_count = String(entry.lexical_units?.length ?? 0);
    }
  }

  if (entry.additional) {
    for (const [key, value] of Object.entries(entry.additional)) {
      base[key] = stringify(value);
    }
  }

  if (entry.frame?.definition) {
    base.frame_definition = entry.frame.definition;
  }

  return base;
}

/**
 * Build a template context for nunjucks rendering.
 */
function buildTemplateContext(entry: LexicalUnitSummary): Record<string, unknown> {
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

  if (entry.pos === 'frames') {
    context.definition = entry.definition ?? '';
    context.short_definition = entry.short_definition ?? '';
    context.super_frame_id = entry.super_frame_id ?? null;
    context.super_frame = entry.super_frame ?? null;
    context.roles = entry.roles ?? [];
    context.roles_count = entry.roles?.length ?? 0;
    
    // Include both child frames and lexical units if present
    context.isSuperFrame = entry.isSuperFrame ?? false;
    
    context.child_frames = entry.child_frames ?? [];
    context.child_frames_count = entry.child_frames?.length ?? 0;
    
    context.lexical_units = entry.lexical_units ?? [];
    context.lexical_units_count = entry.lexical_units?.length ?? 0;
  }

  if (entry.frame) {
    context.frame = entry.frame;
  }

  if (entry.additional) {
    for (const [key, value] of Object.entries(entry.additional)) {
      if (!key.startsWith('frame.') || typeof value === 'string') {
        context[key] = value;
      }
    }
  }

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

// (Removed) refreshJobItems(): source-explorer no longer polls OpenAI directly.

// ============================================================================
// Public API - Prompt Rendering
// ============================================================================

import { renderTemplate, hasLoopSyntax, extractLoopCollections } from './template-renderer';

export function renderPrompt(template: string, entry: LexicalUnitSummary): RenderedPrompt {
  const variables = buildVariableMap(entry);
  const usesLoops = hasLoopSyntax(template);
  
  let prompt: string;
  
  if (usesLoops) {
    const context = buildTemplateContext(entry);
    const result = renderTemplate(template, context);
    
    if (!result.success) {
      console.error('[renderPrompt] Template render error:', result.error);
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
    prompt = template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key: string) => {
      if (variables[key] !== undefined) {
        return variables[key];
      }
      return '';
    });
  }

  return { prompt, variables };
}

type PromptClusteringConfig = {
  enabled: boolean;
  /** If set, forces k (clamped to list length). Otherwise uses heuristic per list. */
  kOverride?: number | null;
};

function parsePromptClusteringConfig(metadata: unknown): PromptClusteringConfig {
  const cfg = (metadata && typeof metadata === 'object' ? (metadata as any).promptClustering : null) as
    | { enabled?: unknown; kOverride?: unknown }
    | null;
  return {
    enabled: cfg?.enabled === true,
    kOverride: typeof cfg?.kOverride === 'number' && Number.isFinite(cfg.kOverride) ? cfg.kOverride : null,
  };
}

function clampInt(value: number, min: number, max: number): number {
  const v = Math.round(value);
  return Math.max(min, Math.min(max, v));
}

function autoK(n: number): number {
  // Simple heuristic: k ≈ sqrt(n), clamped.
  return clampInt(Math.sqrt(n), 2, 12);
}

function extractTargetLoopCollections(template: string): Set<'lexical_units' | 'child_frames'> {
  const collections = extractLoopCollections(template);
  const out = new Set<'lexical_units' | 'child_frames'>();
  for (const c of collections) {
    if (c === 'lexical_units') out.add('lexical_units');
    if (c === 'child_frames') out.add('child_frames');
  }
  return out;
}

function stableClusterOrder<T extends { _cluster_num: number }>(items: T[]): T[] {
  const groups = new Map<number, T[]>();
  const clusterNums: number[] = [];
  for (const item of items) {
    const c = item._cluster_num;
    if (!groups.has(c)) {
      groups.set(c, []);
      clusterNums.push(c);
    }
    groups.get(c)!.push(item);
  }
  clusterNums.sort((a, b) => a - b);
  return clusterNums.flatMap((c) => groups.get(c)!);
}

function injectClusterHeaderIntoForLoop(
  template: string,
  options: { collection: 'lexical_units' | 'child_frames' }
): string {
  const { collection } = options;
  // Inject header printing into loops like:
  //   {% for lu in lexical_units %} ... {% endfor %}
  //
  // We assume clustering has already sorted the array by _cluster_num.
  const forRegex = new RegExp(
    String.raw`(\{%\s*for\s+(\w+)\s+in\s+${collection}\s*%\})`,
    'g'
  );

  return template.replace(forRegex, (_full, forTag: string, loopVar: string) => {
    const prevExpr = `${collection}[loop.index0 - 1]._cluster_num`;
    const currExpr = `${loopVar}._cluster_num`;
    const headerSnippet =
      `{% if loop.first %}` +
      `cluster {{ ${currExpr} }}{{"\\n"}}` +
      `{% elif ${currExpr} != ${prevExpr} %}` +
      `{{"\\n"}}cluster {{ ${currExpr} }}{{"\\n"}}` +
      `{% endif %}`;
    return `${forTag}${headerSnippet}`;
  });
}

async function clusterLoopList(
  collection: 'lexical_units' | 'child_frames',
  items: Array<any>,
  cfg: PromptClusteringConfig
): Promise<Array<any>> {
  if (!cfg.enabled) return items;
  if (!Array.isArray(items) || items.length < 2) return items;

  const ids: number[] = [];
  for (const item of items) {
    const rawId = item?.id;
    const n = typeof rawId === 'string' ? Number(rawId) : typeof rawId === 'number' ? rawId : NaN;
    if (Number.isInteger(n)) ids.push(n);
  }
  if (ids.length < 2) return items;

  let k = cfg.kOverride ? clampInt(cfg.kOverride, 2, ids.length) : clampInt(autoK(ids.length), 2, ids.length);

  // Call source-clustering; retry if k is too large after DB-side filtering (missing embeddings).
  const call = async (kk: number) => {
    if (collection === 'lexical_units') {
      return callSourceClustering({
        mode: 'lexical_unit',
        ids_kind: 'lexical_unit_ids',
        ids,
        k: kk,
        seed: 42,
        max_iters: 20,
        dtype: 'float32',
      });
    }
    return callSourceClustering({
      mode: 'frame',
      ids_kind: 'frame_ids',
      ids,
      k: kk,
      seed: 42,
      max_iters: 20,
      dtype: 'float32',
    });
  };

  let resp: Awaited<ReturnType<typeof callSourceClustering>>;
  try {
    resp = await call(k);
  } catch (error) {
    // Attempt a retry if the service tells us k > n_found.
    const msg = error instanceof Error ? error.message : String(error);
    const match = msg.match(/k must be <= number of found embeddings \\(k=\\d+, n=(\\d+)\\)/);
    if (match) {
      const nFound = Number(match[1]);
      if (Number.isInteger(nFound) && nFound >= 2) {
        k = Math.min(k, nFound);
        resp = await call(k);
      } else {
        return items;
      }
    } else {
      throw error;
    }
  }

  const clusterById = new Map<number, number>();
  for (const a of resp.assignments ?? []) {
    const idNum = Number(a.id);
    if (Number.isInteger(idNum)) {
      clusterById.set(idNum, a.cluster);
    }
  }

  // Assign missing/unclustered items to a final bucket after 1..k.
  const missingCluster = k; // display will be k+1
  const withCluster = items.map((item) => {
    const idNum = Number(item?.id);
    const clusterId = Number.isInteger(idNum) && clusterById.has(idNum) ? clusterById.get(idNum)! : missingCluster;
    return { ...item, _cluster_num: clusterId + 1 };
  });

  // Stable within cluster, clusters ordered by id.
  return stableClusterOrder(withCluster);
}

export async function renderPromptAsync(
  template: string,
  entry: LexicalUnitSummary,
  options?: { metadata?: Record<string, unknown>; onClusteringError?: (message: string) => void }
): Promise<RenderedPrompt> {
  const variables = buildVariableMap(entry);
  const usesLoops = hasLoopSyntax(template);
  const clusteringCfg = parsePromptClusteringConfig(options?.metadata);

  let prompt: string;

  if (usesLoops) {
    const baseContext = buildTemplateContext(entry);
    let effectiveTemplate = template;
    let context: any = baseContext;

    try {
      if (clusteringCfg.enabled) {
        const loopCollections = extractTargetLoopCollections(template);
        const clusteredContext = { ...baseContext } as any;
        let didClusterAny = false;

        if (loopCollections.has('lexical_units') && Array.isArray((clusteredContext as any).lexical_units)) {
          try {
            const clustered = await clusterLoopList(
              'lexical_units',
              (clusteredContext as any).lexical_units,
              clusteringCfg
            );
            const hasClusterNums = clustered.some((x) => typeof x?._cluster_num === 'number');
            if (hasClusterNums) {
              (clusteredContext as any).lexical_units = clustered;
              effectiveTemplate = injectClusterHeaderIntoForLoop(effectiveTemplate, { collection: 'lexical_units' });
              didClusterAny = true;
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            options?.onClusteringError?.(`Clustering failed for lexical_units: ${msg}`);
          }
        }

        if (loopCollections.has('child_frames') && Array.isArray((clusteredContext as any).child_frames)) {
          try {
            const clustered = await clusterLoopList(
              'child_frames',
              (clusteredContext as any).child_frames,
              clusteringCfg
            );
            const hasClusterNums = clustered.some((x) => typeof x?._cluster_num === 'number');
            if (hasClusterNums) {
              (clusteredContext as any).child_frames = clustered;
              effectiveTemplate = injectClusterHeaderIntoForLoop(effectiveTemplate, { collection: 'child_frames' });
              didClusterAny = true;
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            options?.onClusteringError?.(`Clustering failed for child_frames: ${msg}`);
          }
        }

        if (didClusterAny) {
          context = clusteredContext;
        }

        const result = renderTemplate(effectiveTemplate, context);
        if (!result.success) {
          throw new Error(result.error || 'Template render error');
        }
        prompt = result.prompt;
      } else {
        const result = renderTemplate(template, baseContext);
        if (!result.success) {
          throw new Error(result.error || 'Template render error');
        }
        prompt = result.prompt;
      }
    } catch (error) {
      // If clustering fails, fall back to the unclustered loop render.
      // If the template itself is invalid, fall back to simple interpolation.
      console.error('[renderPromptAsync] Render error:', error);
      const fallback = renderTemplate(template, baseContext);
      if (fallback.success) {
        prompt = fallback.prompt;
      } else {
        prompt = template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key: string) => {
          if (variables[key] !== undefined) {
            return variables[key];
          }
          return '';
        });
      }
    }
  } else {
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

export async function previewLLMJob(params: CreateLLMJobParams) {
  // For preview, we only need a few entries. 
  // We apply a limit to the scope to avoid fetching thousands of records.
  const previewScope = { ...params.scope };
  if (previewScope.kind === 'filters') {
    previewScope.filters = { ...previewScope.filters, limit: 5 };
  } else if (previewScope.kind === 'frame_ids') {
    previewScope.frameIds = previewScope.frameIds.slice(0, 5);
    previewScope.limit = 5;
  } else if (previewScope.kind === 'ids') {
    previewScope.ids = previewScope.ids.slice(0, 5);
  }

  // Get total count separately to provide accurate info to the UI
  const totalEntries = await countEntriesForScope(params.scope);
  
  if (totalEntries === 0) {
    throw new LLMJobError('No entries found for the provided scope.', 400);
  }

  const entries = await fetchUnitsForScope(previewScope);
  const clusteringCfg = parsePromptClusteringConfig(params.metadata);
  const clusteringErrors = new Set<string>();
  const previews = await Promise.all(
    entries.slice(0, 5).map((entry) =>
      renderPromptAsync(params.promptTemplate, entry, {
        metadata: params.metadata,
        onClusteringError: clusteringCfg.enabled ? (msg) => clusteringErrors.add(msg) : undefined,
      })
    )
  );

  return {
    previews,
    totalEntries,
    clusteringError: clusteringErrors.size ? Array.from(clusteringErrors)[0] : undefined,
  };
}

export async function createLLMJob(
  params: CreateLLMJobParams,
  initialBatchSize?: number
): Promise<SerializedJob> {
  const entries = await fetchUnitsForScope(params.scope);

  if (entries.length === 0) {
    throw new LLMJobError('No entries found for the provided scope.', 400);
  }

  const totalEntries = entries.length;
  const entriesToCreate = initialBatchSize && initialBatchSize < totalEntries
    ? entries.slice(0, initialBatchSize)
    : entries;

  if (!initialBatchSize) {
    const MAX_ENTRIES_PER_JOB = 5000;
    if (totalEntries > MAX_ENTRIES_PER_JOB) {
      throw new LLMJobError(
        `Job scope contains ${totalEntries} entries, which exceeds the maximum of ${MAX_ENTRIES_PER_JOB}.`,
        400
      );
    }
  }

  const jobConfig: Prisma.InputJsonObject = {
    model: params.model,
    userPromptTemplate: params.promptTemplate,
    systemPrompt: params.systemPrompt ?? null,
    serviceTier: params.serviceTier ?? null,
    reasoning: params.reasoning ?? null,
    targetFields: (params.targetFields ?? []) as Prisma.InputJsonValue,
    reallocationEntityTypes: (params.reallocationEntityTypes ?? []) as Prisma.InputJsonValue,
    metadata: (params.metadata ?? {}) as Prisma.InputJsonObject,
    mcpEnabled: params.mcpEnabled ?? true,
    changesetId: params.changesetId ?? null,
    chatHistory: params.chatHistory ? (params.chatHistory as unknown as Prisma.InputJsonValue) : null,
    // Split job configuration
    splitMinFrames: params.splitMinFrames ?? null,
    splitMaxFrames: params.splitMaxFrames ?? null,
  };

  const preparedJobItemsData = await Promise.all(entriesToCreate.map(async (entry) => {
    // Inject split configuration into entry.additional for template variable interpolation
    const entryWithSplitConfig = params.jobType === 'split' && (params.splitMinFrames || params.splitMaxFrames)
      ? {
          ...entry,
          additional: {
            ...entry.additional,
            min_splits: params.splitMinFrames ?? 2,
            max_splits: params.splitMaxFrames ?? 5,
          },
        }
      : entry;
    
    const { prompt, variables } = await renderPromptAsync(params.promptTemplate, entryWithSplitConfig, {
      metadata: params.metadata,
    });

    const frameInfo = entry.frame ? {
      name: entry.frame.label,
      id: entry.frame.id,
      definition: entry.frame.definition,
      short_definition: entry.frame.short_definition,
      roles: entry.frame.roles,
    } : null;

    const requestPayload = {
      promptTemplate: params.promptTemplate,
      renderedPrompt: prompt,
      variables,
      entry: {
        code: entry.code,
        pos: entry.pos,
        gloss: entry.gloss,
        lemmas: entry.lemmas ?? [],
        examples: entry.examples ?? [],
        label: entry.label ?? null,
        flagged: entry.flagged ?? false,
        flagged_reason: entry.flagged_reason ?? null,
        lexfile: entry.lexfile ?? null,
        definition: entry.definition ?? null,
        short_definition: entry.short_definition ?? null,
        super_frame_id: entry.super_frame_id ?? null,
        super_frame: entry.super_frame ?? null,
        isSuperFrame: entry.isSuperFrame ?? false,
        lexical_units: (entry.lexical_units ?? []) as any[],
        roles: (entry.roles ?? []) as any[],
        child_frames: (entry.child_frames ?? []) as any[],
      },
      frameInfo,
    } satisfies Record<string, unknown>;

    return {
      status: 'queued' as const,
      lexical_unit_id: entry.pos !== 'frames' ? entry.dbId : null,
      frame_id: entry.pos === 'frames' ? entry.dbId : null,
      request_payload: requestPayload as Prisma.InputJsonObject,
    };
  }));

  const job = await prisma.$transaction(
    async (tx) => {
      const createdJob = await tx.llm_jobs.create({
        data: {
          label: params.label ?? null,
          submitted_by: params.submittedBy ?? null,
          job_type: params.jobType ?? 'flag',
          scope_kind: params.scope.kind,
          scope: params.scope as unknown as Prisma.JsonObject,
          config: jobConfig,
          provider: 'openai',
          llm_vendor: 'openai',
          status: 'queued',
          total_items: totalEntries,
        } as any,
      });

      const jobItemsData = preparedJobItemsData.map(item => ({
        ...item,
        job_id: createdJob.id,
      }));

      await tx.llm_job_items.createMany({ 
        data: jobItemsData,
        skipDuplicates: false,
      });

      return createdJob;
    },
    {
      maxWait: 10000,
      timeout: 60000,
    }
  );

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
  
  const includeItemsQuery = options.includeItems === true ? {
    llm_job_items: {
      orderBy: { id: 'asc' as const },
    },
  } : undefined;
  
  try {
    jobs = await getLLMJobsDelegate().findMany({
      where: ({ deleted: false } as any),
      orderBy: { created_at: 'desc' },
      take: options.entityType ? (options.limit ?? 15) * 3 : (options.limit ?? 15),
      include: includeItemsQuery,
    });
  } catch (error) {
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
  
  if (options.entityType) {
    jobs = jobs.filter(job => {
      const scope = job.scope as JobScope | null;
      const jobTargetType = inferTargetTypeFromJobScope(scope);
      const jobIsSuperFrame = scope && 'isSuperFrame' in scope ? scope.isSuperFrame === true : false;
      
      // Handle special entity type filters
      if (options.entityType === 'lexical_units') {
        // Show all jobs targeting any part of speech
        return isLexicalUnitPOS(jobTargetType);
      } else if (options.entityType === 'super_frames') {
        // Show only jobs explicitly created for super frames
        return jobTargetType === 'frames' && jobIsSuperFrame;
      } else if (options.entityType === 'frames_only') {
        // Show only jobs for regular frames (not super frames)
        return jobTargetType === 'frames' && !jobIsSuperFrame;
      } else if (options.entityType === 'frames') {
        // 'frames' mode shows both super frames and regular frames (legacy behavior)
        return jobTargetType === 'frames';
      }
      
      return jobTargetType === options.entityType;
    });
    jobs = jobs.slice(0, options.limit ?? 15);
  }

  const serialized = jobs.map(job => {
    const { llm_job_items: itemsRaw, ...jobWithoutItems } = job as typeof job & { llm_job_items?: typeof job.llm_job_items };
    const serializedItems = (itemsRaw ?? []).map((item: llm_job_items) => ({
      ...item,
      id: item.id.toString(),
      job_id: item.job_id.toString(),
      created_at: item.created_at.toISOString(),
      updated_at: item.updated_at.toISOString(),
      started_at: item.started_at ? item.started_at.toISOString() : null,
      completed_at: item.completed_at ? item.completed_at.toISOString() : null,
      lexical_unit_id: item.lexical_unit_id ? item.lexical_unit_id.toString() : null,
      frame_id: item.frame_id ? item.frame_id.toString() : null,
      entry: extractEntrySummary(item),
    }));

    return {
      ...jobWithoutItems,
      id: job.id.toString(),
      created_at: job.created_at.toISOString(),
      updated_at: job.updated_at.toISOString(),
      started_at: job.started_at ? job.started_at.toISOString() : null,
      completed_at: job.completed_at ? job.completed_at.toISOString() : null,
      cost_microunits: job.cost_microunits != null ? job.cost_microunits.toString() : null,
      items: serializedItems,
    } as SerializedJob;
  });

  // Enrich items with DB codes after serialization
  if (options.includeItems) {
    for (const job of serialized) {
      if (job.items.length > 0) {
        await enrichJobItemsWithDbCodes(job.items);
      }
    }
  }

  // No refresh here: statuses/results are updated by the source-llm webhook.

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

  await getLLMJobsDelegate().update({
    where: { id: BigInt(job.id) },
    data: {
      status: 'cancelled',
      completed_at: new Date(),
    },
  });

  // Prevent any additional submissions by marking still-queued items as skipped.
  // (Already-submitted items may still complete at the provider; webhook will ignore their side effects once cancelled.)
  const skipResult = await prisma.llm_job_items.updateMany({
    where: {
      job_id: BigInt(job.id),
      provider_task_id: null,
      status: 'queued',
    },
    data: {
      status: 'skipped',
      last_error: 'Job cancelled before submission',
      completed_at: new Date(),
    },
  });

  await discardByLlmJob(BigInt(job.id));

  const refreshed = await getLLMJob(jobId, { refresh: false });
  await updateJobAggregates(BigInt(refreshed.id));
  return { job: refreshed, cancelledCount: skipResult.count };
}

export async function deleteLLMJob(jobId: number | string): Promise<void> {
  await discardByLlmJob(BigInt(jobId));

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
      return;
    }
    throw error;
  }
}

export async function getUnseenJobsCount(targetType?: JobEntityTypeFilter): Promise<number> {
  try {
    const jobs = await withRetry(
      () => getLLMJobsDelegate().findMany({
        where: { unseen_change: true, deleted: false } as any,
        select: { id: true, scope: true },
      }),
      undefined,
      'getUnseenJobsCount'
    );
    
    if (!targetType) return jobs.length;
    
    return jobs.filter(job => {
      const scope = job.scope as JobScope | null;
      const jobTargetType = inferTargetTypeFromJobScope(scope);
      const jobIsSuperFrame = scope && 'isSuperFrame' in scope ? scope.isSuperFrame === true : false;
      
      // Handle special target type filters
      if (targetType === 'lexical_units') {
        return isLexicalUnitPOS(jobTargetType);
      } else if (targetType === 'super_frames') {
        return jobTargetType === 'frames' && jobIsSuperFrame;
      } else if (targetType === 'frames_only') {
        return jobTargetType === 'frames' && !jobIsSuperFrame;
      } else if (targetType === 'frames') {
        return jobTargetType === 'frames';
      }
      
      return jobTargetType === targetType;
    }).length;
  } catch (error) {
    if (error instanceof Error && /Unknown argument\s+`?unseen_change`?/i.test(error.message)) {
      return 0;
    }
    throw error;
  }
}
