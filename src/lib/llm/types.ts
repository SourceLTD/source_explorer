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
}

export interface JobScopeFilters {
  kind: 'filters';
  pos: PartOfSpeech;
  filters: {
    limit?: number;
    // Boolean filter AST group (optional if targeting all)
    where?: BooleanFilterGroup;
  };
}

export type JobScope = JobScopeIds | JobScopeFrameIds | JobScopeFilters;

export interface CreateLLMJobParams {
  label?: string;
  submittedBy?: string | null;
  promptTemplate: string;
  model: string;
  scope: JobScope;
  previewOnly?: boolean;
  metadata?: Record<string, unknown>;
  serviceTier?: 'flex' | 'default' | 'priority';
  reasoning?: {
    effort?: 'low' | 'medium' | 'high';
  };
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
  frame_name?: string | null;
  lexfile?: string | null;
  additional?: Record<string, unknown>;
  // Frame-specific fields
  definition?: string | null;
  short_definition?: string | null;
  prototypical_synset?: string | null;
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

