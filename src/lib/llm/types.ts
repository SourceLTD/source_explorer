import type { llm_job_items, llm_jobs } from '@prisma/client';
import type { BooleanFilterGroup } from '@/lib/filters/types';
import type { PartOfSpeech as POSType } from '@/lib/types';

/**
 * The type of entity an LLM job can target.
 * Either a specific part of speech (Lexical Unit), a generic Lexical Unit, or a Concept.
 * Note: A Concept is not a Lexical Unit.
 */
export type JobTargetType = POSType | 'lexical_units' | 'concepts';

export interface JobScopeIds {
  kind: 'ids';
  targetType: JobTargetType;
  ids: string[];
}

export interface JobScopeFrameIds {
  kind: 'concept_ids';
  conceptIds: string[];
  targetType?: JobTargetType;
  includeLexicalUnits?: boolean;
  flagTarget?: 'concept' | 'lexical_unit' | 'both';
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
  jobType?: 'flag' | 'edit' | 'allocate_contents' | 'allocate' | 'review' | 'split';
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
  /** Minimum number of new concepts to create when splitting (default: 2) */
  splitMinFrames?: number;
  /** Maximum number of new concepts to create when splitting (default: 5) */
  splitMaxFrames?: number;
}

/**
 * Structured role data for template loops
 */
export interface ConceptPropertyData {
  type: string;
  description: string;
  examples: string[];
  label: string;
  main: boolean;
}

/**
 * Structured lexical unit data for template loops
 */
export interface ConceptLexicalUnitData {
  id: string;
  code: string;
  gloss: string;
  pos: POSType;
  lemmas: string[];
  examples: string[];
  flagged: boolean;
}

/**
 * Structured concept data with nested relations for template rendering
 */
export interface ConceptRelationData {
  id: string;
  code: string | null;
  label: string;
  definition?: string | null;
  short_definition?: string | null;
  roles: ConceptPropertyData[];
  lexical_units: ConceptLexicalUnitData[];
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
  concept?: ConceptRelationData | null;
  // Concept-specific fields
  definition?: string | null;
  short_definition?: string | null;
  roles?: ConceptPropertyData[];
  lexical_units?: ConceptLexicalUnitData[];
}

export interface RenderedPrompt {
  prompt: string;
  variables: Record<string, string>;
}

export interface SerializedJobItem extends Omit<llm_job_items, 'id' | 'job_id' | 'created_at' | 'updated_at' | 'started_at' | 'completed_at' | 'lexical_unit_id' | 'concept_id'> {
  id: string;
  job_id: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  lexical_unit_id: string | null;
  concept_id: string | null;
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
      label?: string | null;
      lexical_units?: any[] | null;
      roles?: any[] | null;
    };
  }>;
}

/**
 * Extended entity type for job filtering.
 */
export type JobEntityTypeFilter = JobTargetType | 'lexical_units';

export interface JobListOptions {
  includeCompleted?: boolean;
  limit?: number;
  entityType?: JobEntityTypeFilter;
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
  if (!parsed.kind || !['ids', 'concept_ids', 'filters'].includes(parsed.kind)) {
    return null;
  }
  return scope as JobScope;
}

export function formatScopeDescription(scope: JobScope | null, totalItems: number): string {
  if (!scope) return `${totalItems} items`;
  
  switch (scope.kind) {
    case 'ids':
      return `${scope.ids.length} ${scope.targetType} by ID selection`;
    case 'concept_ids': {
      const conceptCount = scope.conceptIds?.length ?? 0;
      const target = scope.flagTarget === 'both' 
        ? 'concepts & lexical units' 
        : scope.flagTarget === 'concept'
          ? 'concepts'
          : 'lexical units';
      return `${conceptCount} concepts (${target})`;
    }
    case 'filters':
      return `Filtered ${scope.targetType}${scope.filters?.limit ? ` (limit: ${scope.filters.limit})` : ''}`;
    default:
      return `${totalItems} items`;
  }
}
