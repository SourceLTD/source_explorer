import type { SerializedJob } from '@/lib/llm/types';

export type ScopeMode = 'selection' | 'manual' | 'frames' | 'all' | 'filters';

export interface AIJobsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'verbs' | 'nouns' | 'adjectives' | 'adverbs' | 'frames';
  selectedIds: string[];
  /** Email of the current user, used to track who submitted AI jobs */
  userEmail?: string | null;
  onJobsUpdated?: (pendingJobs: number) => void;
  onUnseenCountChange?: (count: number) => void;
  /** Called when any job completes (status changes to completed/cancelled) */
  onJobCompleted?: () => void;
}

export interface JobListResponse {
  jobs: SerializedJob[];
}

export interface PreviewResponse {
  previews: Array<{
    prompt: string;
    variables: Record<string, string>;
  }>;
  totalEntries: number;
}

// Re-export hook types for convenience
export type { SubmissionProgress, UseJobCreationReturn, UseJobCreationOptions } from './hooks/useJobCreation';
export type { UseJobPollingReturn, UseJobPollingOptions } from './hooks/useJobPolling';
export type { UseAutocompleteReturn, UseAutocompleteOptions, AutocompleteSuggestion } from './hooks/useAutocomplete';
