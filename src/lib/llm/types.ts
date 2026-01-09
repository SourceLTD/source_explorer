import type { llm_job_items, llm_jobs } from '@prisma/client';
import type { BooleanFilterGroup } from '@/lib/filters/types';

export type PartOfSpeech = 'verbs' | 'nouns' | 'adjectives' | 'adverbs' | 'frames';

export interface JobScopeIds {
  kind: 'ids';
  pos: PartOfSpeech;
  ids: string[]; // lexical codes (e.g., say.v.01)
}

export interface JobScopeFrameIds {
  kind: 'frame_ids';
  frameIds: string[];
  pos?: PartOfSpeech;
  includeVerbs?: boolean;
  flagTarget?: 'frame' | 'verb' | 'both';
  offset?: number;
  limit?: number;
}

export interface JobScopeFilters {
  kind: 'filters';
  pos: PartOfSpeech;
  filters: {
    limit?: number;
    offset?: number;
    // Boolean filter AST group (optional if targeting all)
    where?: BooleanFilterGroup;
  };
}

export type JobScope = JobScopeIds | JobScopeFrameIds | JobScopeFilters;

/**
 * MCP tool approval configuration
 * Controls which tools require user approval before execution.
 * Can be a simple string ('never' | 'always') or a granular object config.
 */
export type McpApprovalConfig = 
  | 'never'  // Tools never require approval (agentic mode ON)
  | 'always' // Tools always require approval (agentic mode OFF - effectively disables tools in background jobs)
  | {
    /** Tools that never require approval */
    never?: { tool_names: string[] };
    /** Tools that always require approval */
    always?: { tool_names: string[] };
  };

export interface CreateLLMJobParams {
  label?: string;
  submittedBy?: string | null;
  promptTemplate: string;
  model: string;
  scope: JobScope;
  previewOnly?: boolean;
  metadata?: Record<string, unknown>;
  serviceTier?: 'flex' | 'default' | 'priority';
  jobType?: 'moderation' | 'editing' | 'reallocation' | 'allocate' | 'review';
  targetFields?: string[];
  reallocationEntityTypes?: ('verbs' | 'nouns' | 'adjectives' | 'adverbs')[];
  reasoning?: {
    effort?: 'low' | 'medium' | 'high';
  };
  /** Whether MCP tools should be available for this job (default: true) */
  mcpEnabled?: boolean;
  /** Custom system prompt to override the default for the job type */
  systemPrompt?: string;
  /** For review jobs: the changeset ID being reviewed */
  changesetId?: string;
  /** For review jobs: the comment history */
  chatHistory?: Array<{
    author: string;
    content: string;
    createdAt: string;
  }>;
}

/**
 * Structured role data for template loops
 */
export interface FrameRoleData {
  type: string;
  code: string;
  description: string;
  examples: string[];
  label: string;
  main: boolean;
}

/**
 * Structured verb data for template loops (when iterating frame.verbs)
 */
export interface FrameVerbData {
  code: string;
  gloss: string;
  lemmas: string[];
  examples: string[];
  flagged: boolean;
}

/**
 * Structured noun data for template loops (when iterating frame.nouns)
 */
export interface FrameNounData {
  code: string;
  gloss: string;
  lemmas: string[];
  examples: string[];
  flagged: boolean;
}

/**
 * Structured frame data with nested relations for template rendering
 */
export interface FrameRelationData {
  id: string;
  label: string;
  definition: string;
  short_definition: string;
  prototypical_synset: string;
  roles: FrameRoleData[];
  verbs: FrameVerbData[];
  nouns: FrameNounData[];
}

export interface LexicalEntrySummary {
  dbId: bigint;
  code: string;
  pos: PartOfSpeech;
  gloss: string;
  lemmas?: string[];
  examples?: string[];
  flagged?: boolean | null;
  flagged_reason?: string | null;
  verifiable?: boolean | null;
  unverifiable_reason?: string | null;
  label?: string | null;
  lexfile?: string | null;
  /** Flat key-value pairs for simple {{variable}} interpolation */
  additional?: Record<string, unknown>;
  /** Structured frame data for template loops ({% for role in frame.roles %}) */
  frame?: FrameRelationData | null;
  // Frame-specific fields (when pos === 'frames')
  definition?: string | null;
  short_definition?: string | null;
  prototypical_synset?: string | null;
  /** Structured relations when the entry itself is a frame */
  roles?: FrameRoleData[];
  verbs?: FrameVerbData[];
  nouns?: FrameNounData[];
}

export interface RenderedPrompt {
  prompt: string;
  variables: Record<string, string>;
}

export interface SerializedJobItem extends Omit<llm_job_items, 'id' | 'job_id' | 'created_at' | 'updated_at' | 'started_at' | 'completed_at' | 'verb_id' | 'noun_id' | 'adjective_id' | 'adverb_id' | 'frame_id'> {
  id: string;
  job_id: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  verb_id: string | null;
  noun_id: string | null;
  adjective_id: string | null;
  adverb_id: string | null;
  frame_id: string | null;
}

export interface SerializedJob extends Omit<llm_jobs, 'id' | 'created_at' | 'updated_at' | 'started_at' | 'completed_at' | 'cost_microunits'> {
  id: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  cost_microunits: string | null;
  items: Array<SerializedJobItem & {
    entry: {
      code: string | null;
      pos: PartOfSpeech | null;
      gloss?: string | null;
      lemmas?: string[] | null;
    };
  }>;
}

export interface JobListOptions {
  includeCompleted?: boolean;
  limit?: number;
  refreshBeforeReturn?: boolean;
  entityType?: PartOfSpeech;
  includeItems?: boolean;
}

export interface JobDetailOptions {
  refresh?: boolean;
  refreshLimit?: number;
  statusLimits?: {
    pending?: number;
    succeeded?: number;
    failed?: number;
  };
}

export interface CancelJobResult {
  job: SerializedJob;
  cancelledCount: number;
}

/**
 * Parsed job configuration stored in llm_jobs.config
 * This represents the JSON structure stored in the database
 */
export interface ParsedJobConfig {
  model?: string;
  userPromptTemplate?: string;
  serviceTier?: 'flex' | 'default' | 'priority' | null;
  reasoning?: { effort?: 'low' | 'medium' | 'high' } | null;
  targetFields?: string[];
  reallocationEntityTypes?: ('verbs' | 'nouns' | 'adjectives' | 'adverbs')[];
  metadata?: Record<string, unknown>;
  mcpEnabled?: boolean | null;
  changesetId?: string | null;
  chatHistory?: Array<{
    author: string;
    content: string;
    createdAt: string;
  }> | null;
}

/**
 * Helper to safely parse a job's config JSON
 */
export function parseJobConfig(config: unknown): ParsedJobConfig | null {
  if (!config || typeof config !== 'object') return null;
  return config as ParsedJobConfig;
}

/**
 * Helper to safely parse a job's scope JSON
 */
export function parseJobScope(scope: unknown): JobScope | null {
  if (!scope || typeof scope !== 'object') return null;
  const parsed = scope as { kind?: string };
  if (!parsed.kind || !['ids', 'frame_ids', 'filters'].includes(parsed.kind)) {
    return null;
  }
  return scope as JobScope;
}

/**
 * Format a scope for display
 */
export function formatScopeDescription(scope: JobScope | null, totalItems: number): string {
  if (!scope) return `${totalItems} items`;
  
  switch (scope.kind) {
    case 'ids':
      return `${scope.ids.length} ${scope.pos} by ID selection`;
    case 'frame_ids': {
      const frameCount = scope.frameIds?.length ?? 0;
      const target = scope.flagTarget === 'both' 
        ? 'frames & verbs' 
        : scope.flagTarget ?? 'frames';
      return `${frameCount} frames (${target})`;
    }
    case 'filters':
      return `Filtered ${scope.pos}${scope.filters?.limit ? ` (limit: ${scope.filters.limit})` : ''}`;
    default:
      return `${totalItems} items`;
  }
}
