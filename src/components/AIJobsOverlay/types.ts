import type { SerializedJob } from '@/lib/llm/types';

export type ScopeMode = 'selection' | 'manual' | 'frames' | 'all' | 'filters';

export interface AIJobsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'verbs' | 'nouns' | 'adjectives' | 'adverbs' | 'frames';
  selectedIds: string[];
  onJobsUpdated?: (pendingJobs: number) => void;
  onUnseenCountChange?: (count: number) => void;
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

