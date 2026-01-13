import type { llm_job_items, llm_jobs } from '@prisma/client';
import type { BooleanFilterGroup } from '@/lib/filters/types';
import type { PartOfSpeech as POSType } from '@/lib/types';

/**
 * The type of entity an LLM job can target.
 * Either a specific part of speech (Lexical Unit) or a Frame.
 * Note: A Frame is not a Lexical Unit.
 */
export type JobTargetType = POSType | 'frames';

export interface JobScopeIds {
  kind: 'ids';
  targetType: JobTargetType;
  ids: string[]; // lexical codes (e.g., say.v.01) or frame IDs
}

export interface JobScopeFrameIds {
  kind: 'frame_ids';
  frameIds: string[];
  targetType?: JobTargetType;
  includeLexicalUnits?: boolean;
  flagTarget?: 'frame' | 'lexical_unit' | 'both';
  offset?: number;
  limit?: number;
}

export interface JobScopeFilters {
  kind: 'filters';
  targetType: JobTargetType;
  filters: {
    limit?: number;
    offset?: number;
    where?: BooleanFilterGroup;
  };
}

export type JobScope = JobScopeIds | JobScopeFrameIds | JobScopeFilters;

/**
 * MCP tool approval configuration
 */
export type McpApprovalConfig = 
  | 'never'
  | 'always'
  | {
    never?: { tool_names: string[] };
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
  reallocationEntityTypes?: POSType[];
  reasoning?: {
    effort?: 'low' | 'medium' | 'high';
  };
  mcpEnabled?: boolean;
  systemPrompt?: string;
  changesetId?: string;
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
 * Structured lexical unit data for template loops
 */
export interface FrameLexicalUnitData {
  code: string;
  gloss: string;
  pos: POSType;
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
  definition?: string | null;
  short_definition?: string | null;
  prototypical_synset: string;
  roles: FrameRoleData[];
  lexical_units: FrameLexicalUnitData[];
}

export interface LexicalUnitSummary {
  dbId: bigint;
  code: string;
  pos: JobTargetType;
  gloss: string;
  lemmas?: string[];
  examples?: string[];
  flagged?: boolean | null;
  flagged_reason?: string | null;
  verifiable?: boolean | null;
  unverifiable_reason?: string | null;
  label?: string | null;
  lexfile?: string | null;
  additional?: Record<string, unknown>;
  frame?: FrameRelationData | null;
  // Frame-specific fields
  definition?: string | null;
  short_definition?: string | null;
  prototypical_synset?: string | null;
  roles?: FrameRoleData[];
  lexical_units?: FrameLexicalUnitData[];
}

export interface RenderedPrompt {
  prompt: string;
  variables: Record<string, string>;
}

export interface SerializedJobItem extends Omit<llm_job_items, 'id' | 'job_id' | 'created_at' | 'updated_at' | 'started_at' | 'completed_at' | 'lexical_unit_id' | 'frame_id'> {
  id: string;
  job_id: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  lexical_unit_id: string | null;
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
      pos: JobTargetType | null;
      gloss?: string | null;
      lemmas?: string[] | null;
    };
  }>;
}

export interface JobListOptions {
  includeCompleted?: boolean;
  limit?: number;
  refreshBeforeReturn?: boolean;
  entityType?: JobTargetType;
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
 */
export interface ParsedJobConfig {
  model?: string;
  userPromptTemplate?: string;
  serviceTier?: 'flex' | 'default' | 'priority' | null;
  reasoning?: { effort?: 'low' | 'medium' | 'high' } | null;
  targetFields?: string[];
  reallocationEntityTypes?: POSType[];
  metadata?: Record<string, unknown>;
  mcpEnabled?: boolean | null;
  changesetId?: string | null;
  chatHistory?: Array<{
    author: string;
    content: string;
    createdAt: string;
  }> | null;
}

export function parseJobConfig(config: unknown): ParsedJobConfig | null {
  if (!config || typeof config !== 'object') return null;
  return config as ParsedJobConfig;
}

export function parseJobScope(scope: unknown): JobScope | null {
  if (!scope || typeof scope !== 'object') return null;
  const parsed = scope as { kind?: string };
  if (!parsed.kind || !['ids', 'frame_ids', 'filters'].includes(parsed.kind)) {
    return null;
  }
  return scope as JobScope;
}

export function formatScopeDescription(scope: JobScope | null, totalItems: number): string {
  if (!scope) return `${totalItems} items`;
  
  switch (scope.kind) {
    case 'ids':
      return `${scope.ids.length} ${scope.targetType} by ID selection`;
    case 'frame_ids': {
      const frameCount = scope.frameIds?.length ?? 0;
      const target = scope.flagTarget === 'both' 
        ? 'frames & lexical units' 
        : scope.flagTarget ?? 'frames';
      return `${frameCount} frames (${target})`;
    }
    case 'filters':
      return `Filtered ${scope.targetType}${scope.filters?.limit ? ` (limit: ${scope.filters.limit})` : ''}`;
    default:
      return `${totalItems} items`;
  }
}
