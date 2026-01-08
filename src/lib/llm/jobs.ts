import { Prisma } from '@prisma/client';
import type { llm_job_items } from '@prisma/client';
import type OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import { FLAGGING_RESPONSE_SCHEMA, EDIT_RESPONSE_SCHEMA, type FlaggingResponse, type EditResponse } from './schema';
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
import { getOpenAIClient } from './client';
import { translateFilterASTToPrisma } from '@/lib/filters/translate';
import { withRetry } from '@/lib/db-utils';
import type { BooleanFilterGroup } from '@/lib/filters/types';
import { sortRolesByPrecedence } from '@/lib/types';
import {
  createChangegroup,
  createChangesetFromUpdate,
  EntityType,
  Changegroup,
  ENTITY_TYPE_TO_TABLE,
} from '@/lib/version-control';

// Cache for changegroups per LLM job to avoid creating duplicates
const jobChangegroupCache = new Map<string, bigint>();

/**
 * Get or create a changegroup for an LLM job.
 * This ensures all changesets from a single job are grouped together.
 */
async function getOrCreateJobChangegroup(
  jobId: bigint,
  submittedBy: string,
  jobLabel?: string | null
): Promise<bigint> {
  const cacheKey = jobId.toString();
  
  // Check cache first
  if (jobChangegroupCache.has(cacheKey)) {
    return jobChangegroupCache.get(cacheKey)!;
  }
  
  // Check if a changegroup already exists for this job
  const existing = await prisma.changegroups.findFirst({
    where: {
      llm_job_id: jobId,
      status: 'pending',
    },
    select: { id: true },
  });
  
  if (existing) {
    jobChangegroupCache.set(cacheKey, existing.id);
    return existing.id;
  }
  
  // Create a new changegroup
  const changegroup = await createChangegroup({
    source: 'llm_job',
    label: jobLabel || `LLM Job ${jobId}`,
    description: `Changes from LLM job processing`,
    llm_job_id: jobId,
    created_by: submittedBy,
  });
  
  jobChangegroupCache.set(cacheKey, changegroup.id);
  return changegroup.id;
}

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
    code: entry.code,
    pos: entry.pos,
    gloss: entry.gloss ?? '',
    lemmas: (entry.lemmas ?? []).join(', '),
    lemmas_json: JSON.stringify(entry.lemmas ?? [], null, 2),
    examples: (entry.examples ?? []).join('\n'),
    examples_json: JSON.stringify(entry.examples ?? [], null, 2),
    flagged: entry.flagged ? 'true' : 'false',
    flagged_reason: entry.flagged_reason ?? '',
    forbidden: entry.forbidden ? 'true' : 'false',
    forbidden_reason: entry.forbidden_reason ?? '',
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
    base.forbidden = entry.forbidden ? 'true' : 'false';
    base.forbidden_reason = entry.forbidden_reason ?? '';
  }

  // Add additional fields (includes frame.* fields for verbs)
  if (entry.additional) {
    for (const [key, value] of Object.entries(entry.additional)) {
      base[key] = stringify(value);
    }
  }

  return base;
}

export function renderPrompt(template: string, entry: LexicalEntrySummary): RenderedPrompt {
  const variables = buildVariableMap(entry);
  const prompt = template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key: string) => {
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
      return fetchEntriesByFrameIds(scope.frameIds, scope.pos, scope.includeVerbs, scope.offset, scope.limit);
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
            id: true,
            label: true,
            definition: true,
            short_definition: true,
            prototypical_synset: true,
            frame_roles: {
              select: {
                id: true,
                description: true,
                notes: true,
                main: true,
                examples: true,
                label: true,
                role_types: {
                  select: {
                    label: true,
                    code: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const byCode = new Map(records.map(record => [record.code, record]));
    entries = uniqueIds
      .map(code => byCode.get(code))
      .filter((record): record is (typeof records)[number] => Boolean(record))
      .map(record => {
        const rec = record as any;
        const frameData = rec.frames ? {
          'frame.id': rec.frames.id.toString(),
          'frame.label': rec.frames.label || rec.frames.frame_name,
          'frame.definition': rec.frames.definition,
          'frame.short_definition': rec.frames.short_definition,
          'frame.prototypical_synset': rec.frames.prototypical_synset,
          'frame.roles': sortRolesByPrecedence((rec.frames.frame_roles as any[]).map(fr => ({
            role_type: fr.role_types,
            main: fr.main ?? undefined,
            description: fr.description,
            examples: fr.examples,
            label: fr.label,
          }))).map((fr: any) => {
            const roleType = fr.role_type.label;
            const description = fr.description || '';
            const examples = fr.examples && fr.examples.length > 0 ? fr.examples.join(', ') : '';
            const label = fr.label || '';
            return `**${roleType}**: ${description}${examples ? ` (e.g. ${examples})` : ''}${label ? `; ${label}` : ''}`;
          }).join('\n'),
        } : {};

        return {
          dbId: rec.id,
          code: rec.code,
          pos,
          gloss: rec.gloss,
          lemmas: rec.lemmas,
          examples: rec.examples,
          flagged: rec.flagged,
          flagged_reason: rec.flagged_reason,
          label: (rec.frames?.label || rec.frames?.frame_name) ?? null,
          lexfile: rec.lexfile,
          additional: frameData,
        };
      });
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
  } else if (pos === 'adjectives') {
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
  } else if (pos === 'adverbs') {
    const records = await prisma.adverbs.findMany({
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
  } else if (pos === 'frames') {
    const records = await prisma.frames.findMany({
      where: { id: { in: uniqueIds.map(id => BigInt(id)) } },
      select: {
        id: true,
        label: true,
        definition: true,
        short_definition: true,
        prototypical_synset: true,
        flagged: true,
        flagged_reason: true,
        forbidden: true,
        forbidden_reason: true,
      },
    });
    const byId = new Map(records.map(record => [record.id.toString(), record]));
    entries = uniqueIds
      .map(id => byId.get(id))
      .filter((record): record is (typeof records)[number] => Boolean(record))
      .map(record => ({
        dbId: record.id,
        code: record.id.toString(),
        pos,
        gloss: record.definition,
        lemmas: [], // Frames don't have lemmas
        examples: [], // Frames don't have examples
        definition: record.definition,
        short_definition: record.short_definition,
        prototypical_synset: record.prototypical_synset,
        flagged: record.flagged,
        flagged_reason: record.flagged_reason,
        forbidden: record.forbidden,
        forbidden_reason: record.forbidden_reason,
      }));
  }

  return entries;
}

async function fetchEntriesByFrameIds(
  frameIds: string[], 
  pos?: PartOfSpeech, 
  includeVerbs?: boolean,
  offset?: number,
  limit?: number
): Promise<LexicalEntrySummary[]> {
  if (frameIds.length === 0) return [];

  const frames = await prisma.frames.findMany({
    where: {
      id: { in: frameIds.filter(id => id.match(/^\d+$/)).map(id => BigInt(id)) }
    },
    select: {
      id: true,
      label: true,
      definition: true,
      short_definition: true,
      prototypical_synset: true,
      flagged: true,
      flagged_reason: true,
      forbidden: true,
      forbidden_reason: true,
      frame_roles: {
        select: {
          id: true,
          description: true,
          notes: true,
          main: true,
          examples: true,
          label: true,
          role_types: {
            select: {
              label: true,
              code: true,
            },
          },
        },
      },
      verbs: includeVerbs ? {
        where: {
          deleted: false
        },
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
      } : false,
    },
  });

  const entries: LexicalEntrySummary[] = [];
  
  // If targeting frames directly
  if (!includeVerbs || pos === 'frames') {
    for (const frame of frames as any[]) {
      entries.push({
        dbId: frame.id,
        code: frame.id.toString(),
        pos: 'frames',
        gloss: frame.definition,
        lemmas: [],
        examples: [],
        label: frame.label || frame.frame_name,
        definition: frame.definition,
        short_definition: frame.short_definition,
        prototypical_synset: frame.prototypical_synset,
        flagged: frame.flagged,
        flagged_reason: frame.flagged_reason,
        forbidden: frame.forbidden,
        forbidden_reason: frame.forbidden_reason,
      });
    }
  }
  
  // If including verbs
  if (includeVerbs && frames.length > 0 && ('verbs' in (frames[0] as any))) {
    for (const frame of frames as any[]) {
      const frameVerbs = frame.verbs as Array<{
        id: bigint;
        code: string;
        gloss: string;
        lemmas: string[];
        examples: string[];
        flagged: boolean | null;
        flagged_reason: string | null;
        lexfile: string;
      }>;
      
      for (const verb of frameVerbs) {
        entries.push({
          dbId: verb.id,
          code: verb.code,
          pos: 'verbs',
          gloss: verb.gloss,
          lemmas: verb.lemmas,
          examples: verb.examples,
          flagged: verb.flagged,
          flagged_reason: verb.flagged_reason,
          label: frame.label || frame.frame_name,
          lexfile: verb.lexfile,
          additional: {
            'frame.id': frame.id.toString(),
            'frame.label': frame.label || frame.frame_name,
            'frame.definition': frame.definition,
            'frame.short_definition': frame.short_definition,
            'frame.prototypical_synset': frame.prototypical_synset,
            'frame.roles': sortRolesByPrecedence((frame.frame_roles as any[]).map(fr => ({
              role_type: fr.role_types,
              main: fr.main ?? undefined,
              description: fr.description,
              examples: fr.examples,
              label: fr.label,
            }))).map((fr: any) => {
              const roleType = fr.role_type.label;
              const description = fr.description || '';
              const examples = fr.examples && fr.examples.length > 0 ? fr.examples.join(', ') : '';
              const label = fr.label || '';
              return `**${roleType}**: ${description}${examples ? ` (e.g. ${examples})` : ''}${label ? `; ${label}` : ''}`;
            }).join('\n'),
          },
        });
      }
    }
  }

  // Apply offset and limit if provided
  if (offset !== undefined || limit !== undefined) {
    const start = offset ?? 0;
    const end = limit !== undefined ? start + limit : entries.length;
    return entries.slice(start, end);
  }

  return entries;
}

async function fetchEntriesByFilters(pos: PartOfSpeech, filters: { limit?: number; offset?: number; where?: BooleanFilterGroup | undefined } | Record<string, unknown>): Promise<LexicalEntrySummary[]> {
  // Backward compatibility: if filters is a plain object without 'where', try to use it as simple fields
  const limit = typeof (filters as { limit?: unknown }).limit === 'number' ? Number((filters as { limit?: number }).limit) : undefined;
  const offset = typeof (filters as { offset?: unknown }).offset === 'number' ? Number((filters as { offset?: number }).offset) : undefined;
  const ast = (filters as { where?: BooleanFilterGroup }).where as BooleanFilterGroup | undefined;
  const { where, computedFilters } = await translateFilterASTToPrisma(pos, ast);

  if (pos === 'verbs') {
    // limit=0 means fetch all, undefined means use default of 50
    const takeArg = limit === 0 ? undefined : (limit ?? 50);
    const skipArg = offset;
    
    // Ensure deleted filter is always applied
    const verbsWhere = where as Prisma.verbsWhereInput;
    const finalWhere: Prisma.verbsWhereInput = {
      ...verbsWhere,
      AND: [
        verbsWhere,
        {
          deleted: false
        }
      ]
    };
    
    const records = await prisma.verbs.findMany({
      where: finalWhere,
      take: takeArg,
      skip: skipArg,
      orderBy: { id: 'asc' }, // Ensure deterministic ordering for consistent previews
      include: {
        _count: {
          select: {
            verb_relations_verb_relations_source_idToverbs: { where: { type: 'hypernym' } },
            verb_relations_verb_relations_target_idToverbs: { where: { type: 'hypernym' } },
          },
        },
        frames: {
          select: {
            id: true,
            label: true,
            definition: true,
            short_definition: true,
            prototypical_synset: true,
            frame_roles: {
              select: {
                id: true,
                description: true,
                notes: true,
                main: true,
                examples: true,
                label: true,
                role_types: {
                  select: {
                    label: true,
                    code: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    let entries = records.map(record => {
      const rec = record as any;
      const frameData = rec.frames ? {
        'frame.id': rec.frames.id.toString(),
        'frame.label': rec.frames.label || rec.frames.frame_name,
        'frame.definition': rec.frames.definition,
        'frame.short_definition': rec.frames.short_definition,
        'frame.prototypical_synset': rec.frames.prototypical_synset,
        'frame.roles': sortRolesByPrecedence((rec.frames.frame_roles as any[]).map(fr => ({
          role_type: fr.role_types,
          main: fr.main ?? undefined,
          description: fr.description,
          examples: fr.examples,
          label: fr.label,
        }))).map((fr: any) => {
          const roleType = fr.role_type.label;
          const description = fr.description || '';
          const examples = fr.examples && fr.examples.length > 0 ? fr.examples.join(', ') : '';
          const label = fr.label || '';
          return `**${roleType}**: ${description}${examples ? ` (e.g. ${examples})` : ''}${label ? `; ${label}` : ''}`;
        }).join('\n'),
      } : {};

      return {
        dbId: rec.id,
        code: (rec as { code: string }).code,
        pos,
        gloss: rec.gloss,
        lemmas: rec.lemmas,
        examples: rec.examples,
        flagged: rec.flagged ?? undefined,
        flagged_reason: (rec as { flagged_reason?: string | null }).flagged_reason ?? null,
        label: (rec as { frames?: { label?: string; frame_name?: string } | null }).frames?.label || (rec as any).frames?.frame_name || null,
        lexfile: rec.lexfile,
        additional: frameData,
        // temporary attachment for filtering only
        _parentsCount: (rec as any)._count?.verb_relations_verb_relations_source_idToverbs ?? 0,
        _childrenCount: (rec as any)._count?.verb_relations_verb_relations_target_idToverbs ?? 0,
      };
    }) as Array<LexicalEntrySummary & { _parentsCount: number; _childrenCount: number }>;

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
    // limit=0 means fetch all, undefined means use default of 50
    const takeArg = limit === 0 ? undefined : (limit ?? 50);
    const skipArg = offset;
    const records = await prisma.nouns.findMany({
      where: where as Prisma.nounsWhereInput,
      take: takeArg,
      skip: skipArg,
      orderBy: { id: 'asc' }, // Ensure deterministic ordering for consistent previews
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

  if (pos === 'adjectives') {
    // limit=0 means fetch all, undefined means use default of 50
    const takeArg = limit === 0 ? undefined : (limit ?? 50);
    const skipArg = offset;
    const records = await prisma.adjectives.findMany({
      where: where as Prisma.adjectivesWhereInput,
      take: takeArg,
      skip: skipArg,
      orderBy: { id: 'asc' }, // Ensure deterministic ordering for consistent previews
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

  if (pos === 'adverbs') {
    // limit=0 means fetch all, undefined means use default of 50
    const takeArg = limit === 0 ? undefined : (limit ?? 50);
    const skipArg = offset;
    const records = await prisma.adverbs.findMany({
      where: where as Prisma.adverbsWhereInput,
      take: takeArg,
      skip: skipArg,
      orderBy: { id: 'asc' }, // Ensure deterministic ordering for consistent previews
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

  if (pos === 'frames') {
    // limit=0 means fetch all, undefined means use default of 50
    const takeArg = limit === 0 ? undefined : (limit ?? 50);
    const skipArg = offset;
    const records = await prisma.frames.findMany({
      where: where as Prisma.framesWhereInput,
      take: takeArg,
      skip: skipArg,
      orderBy: { id: 'asc' }, // Ensure deterministic ordering for consistent previews
      select: {
        id: true,
        label: true,
        definition: true,
        short_definition: true,
        prototypical_synset: true,
        flagged: true,
        flagged_reason: true,
        forbidden: true,
        forbidden_reason: true,
      } as any,
    });
    return records.map(record => ({
      dbId: record.id,
      code: record.id.toString(),
      pos,
      gloss: record.definition,
      lemmas: [],
      examples: [],
      label: record.label,
      definition: record.definition,
      short_definition: record.short_definition,
      prototypical_synset: record.prototypical_synset,
      flagged: record.flagged,
      flagged_reason: record.flagged_reason,
      forbidden: record.forbidden,
      forbidden_reason: record.forbidden_reason,
    }));
  }

  return [];
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

/**
 * Apply job result by creating changesets (version control).
 * 
 * Instead of directly updating entities, this creates changesets that
 * must be reviewed and committed by an admin before they take effect.
 */
async function applyJobResult(
  item: llm_job_items,
  entry: LexicalEntrySummary,
  result: FlaggingResponse | EditResponse,
  jobLabel: string | null,
  submittedBy: string,
  jobType: 'moderation' | 'editing',
  jobScope?: JobScope
): Promise<void> {
  // Get or create the changegroup for this job
  const changegroupId = await getOrCreateJobChangegroup(item.job_id, submittedBy, jobLabel);

  if (jobType === 'editing') {
    const editResult = result as EditResponse;
    const { edits, frame_id, relations, confidence, notes } = editResult;
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

        // 2. Handle frame_id reallocation
        if (frame_id !== undefined && frame_id !== null) {
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

        if (Object.keys(validUpdates).length > 0) {
          await createChangesetFromUpdate(
            entityType as EntityType,
            entityId,
            currentEntity as Record<string, unknown>,
            validUpdates,
            submittedBy,
            changegroupId,
            notes
          );
          hasEdits = true;
        }

        // 3. Handle relations (simplified)
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
          changegroup_id: changegroupId.toString(),
          suggested_relations: relations,
          suggested_frame_id: frame_id,
        },
        completed_at: new Date(),
      },
    });
  } else {
    // Moderation/Flagging logic
    const flaggingResult = result as FlaggingResponse;
    const flagged = Boolean(flaggingResult.flagged);
    const rawReason = (flaggingResult.flagged_reason ?? '').trim();
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
        changegroupId,
        flaggingResult.notes ?? undefined
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
          confidence: flaggingResult.confidence ?? null,
          notes: flaggingResult.notes ?? null,
          staged_at: new Date().toISOString(),
          changegroup_id: changegroupId.toString(),
        },
        completed_at: new Date(),
      },
    });
  }
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
  const jobConfig: Prisma.InputJsonObject = {
    model: params.model,
    promptTemplate: params.promptTemplate,
    serviceTier: params.serviceTier ?? null,
    reasoning: params.reasoning ?? null,
    targetFields: (params.targetFields ?? []) as Prisma.InputJsonValue,
    metadata: (params.metadata ?? {}) as Prisma.InputJsonObject,
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
        },
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
    select: { status: true, config: true },
  });
  
  if (job?.status === 'queued') {
    await getLLMJobsDelegate().update({
      where: { id: jobId },
      data: { status: 'running', started_at: new Date() },
    });
  }

  const config = job?.config as { model: string; serviceTier?: string; reasoning?: unknown } | null;
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

  await updateJobAggregates(jobId);
  
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
 * Refresh a single job item by polling OpenAI and updating the database
 */
async function refreshSingleItem(item: SerializedJob['items'][number], jobId: string, jobLabel: string | null): Promise<void> {
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
        select: { scope: true, submitted_by: true, job_type: true },
      });
      
      await applyJobResult(
        await prisma.llm_job_items.findUniqueOrThrow({ where: { id: BigInt(item.id) } }),
        entry,
        parsed as any,
        jobLabel,
        jobRecord?.submitted_by ?? 'system:llm-agent',
        (jobRecord?.job_type as any) ?? 'moderation',
        jobRecord?.scope as JobScope | undefined
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
 * Refresh job items by polling OpenAI in parallel batches
 * @param job The job to refresh
 * @param options.limit Maximum number of items to refresh per call (default 40)
 */
async function refreshJobItems(job: SerializedJob, options: { limit?: number } = {}): Promise<SerializedJob> {
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

