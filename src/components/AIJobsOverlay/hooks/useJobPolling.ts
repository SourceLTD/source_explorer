import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { api } from '@/lib/api-client';
import type { SerializedJob } from '@/lib/llm/types';
import type { JobListResponse } from '../types';

export interface UseJobPollingOptions {
  mode: 'verbs' | 'nouns' | 'adjectives' | 'adverbs' | 'frames';
  isOpen: boolean;
  isCreating: boolean;
  onJobsUpdated?: (pendingJobs: number) => void;
  onUnseenCountChange?: (count: number) => void;
  onJobCompleted?: () => void;
}

export interface UseJobPollingReturn {
  jobs: SerializedJob[];
  jobsLoading: boolean;
  jobsError: string | null;
  selectedJobDetails: SerializedJob | null;
  selectedJobLoading: boolean;
  activeJobId: string | null;
  setActiveJobId: (id: string | null) => void;
  itemLimits: { pending: number; succeeded: number; failed: number };
  loadJobs: (silent?: boolean) => Promise<void>;
  loadJobDetails: (jobId: string, silent?: boolean) => Promise<void>;
  loadMoreItems: (status: 'pending' | 'succeeded' | 'failed') => void;
  selectedJob: SerializedJob | null;
  pendingJobsCount: number;
  unseenCount: number;
  clearSelectedJob: () => void;
}

export function useJobPolling({
  mode,
  isOpen,
  isCreating,
  onJobsUpdated,
  onUnseenCountChange,
  onJobCompleted,
}: UseJobPollingOptions): UseJobPollingReturn {
  const [jobs, setJobs] = useState<SerializedJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [selectedJobDetails, setSelectedJobDetails] = useState<SerializedJob | null>(null);
  const [selectedJobLoading, setSelectedJobLoading] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [itemLimits, setItemLimits] = useState({ pending: 10, succeeded: 10, failed: 10 });
  const [unseenCount, setUnseenCount] = useState(0);
  
  const loadJobsInProgressRef = useRef(false);
  const pollingInProgressRef = useRef(false);
  const unseenPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousJobStatusesRef = useRef<Map<string, string>>(new Map());
  const onJobCompletedRef = useRef(onJobCompleted);
  
  // Keep callback ref up to date
  useEffect(() => {
    onJobCompletedRef.current = onJobCompleted;
  }, [onJobCompleted]);

  const pendingJobsCount = useMemo(
    () => jobs.filter(job => job.status === 'queued' || job.status === 'running').length,
    [jobs]
  );

  const selectedJob = useMemo(
    () => jobs.find(job => job.id === activeJobId) ?? jobs[0] ?? null,
    [jobs, activeJobId]
  );

  const clearSelectedJob = useCallback(() => {
    setSelectedJobDetails(null);
    setActiveJobId(null);
  }, []);

  const loadJobs = useCallback(async (silent = false) => {
    if (loadJobsInProgressRef.current) {
      console.log('[loadJobs] Already in progress, skipping');
      return;
    }
    
    loadJobsInProgressRef.current = true;
    if (!silent) {
      setJobsLoading(true);
      setJobsError(null);
    }
    
    try {
      const response = await api.get<JobListResponse>(`/api/llm-jobs?includeCompleted=true&limit=50&entityType=${mode}`);
      
      // Detect job completions by comparing with previous statuses
      let jobCompleted = false;
      for (const job of response.jobs) {
        const prevStatus = previousJobStatusesRef.current.get(job.id);
        const isNowComplete = job.status === 'completed' || job.status === 'cancelled';
        const wasActive = prevStatus === 'queued' || prevStatus === 'running';
        
        if (wasActive && isNowComplete) {
          jobCompleted = true;
        }
        
        // Update the previous status map
        previousJobStatusesRef.current.set(job.id, job.status);
      }
      
      // Call the completion callback if any job completed
      if (jobCompleted && onJobCompletedRef.current) {
        onJobCompletedRef.current();
      }
      
      // Smart update: only update state if jobs actually changed
      setJobs(prevJobs => {
        if (prevJobs.length !== response.jobs.length) {
          return response.jobs;
        }
        
        let hasChanges = false;
        for (let i = 0; i < prevJobs.length; i++) {
          const prev = prevJobs[i];
          const next = response.jobs.find(j => j.id === prev.id);
          
          if (!next) {
            hasChanges = true;
            break;
          }
          
          if (
            prev.status !== next.status ||
            prev.submitted_items !== next.submitted_items ||
            prev.processed_items !== next.processed_items ||
            prev.succeeded_items !== next.succeeded_items ||
            prev.failed_items !== next.failed_items ||
            prev.flagged_items !== next.flagged_items ||
            prev.updated_at !== next.updated_at
          ) {
            hasChanges = true;
            break;
          }
        }
        
        return hasChanges ? response.jobs : prevJobs;
      });
      
      // Auto-select: prioritize running/queued jobs, then fall back to latest job
      setActiveJobId(prev => {
        if (prev) return prev;
        const runningJob = response.jobs.find(job => job.status === 'running' || job.status === 'queued');
        return runningJob?.id ?? response.jobs[0]?.id ?? null;
      });
      
      if (!silent) {
        setJobsError(null);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load jobs';
      const isTransient = errorMessage.includes('connection') ||
                         errorMessage.includes('unavailable') ||
                         errorMessage.includes('timed out') ||
                         errorMessage.includes('try again');
      
      if (isTransient) {
        console.warn('[loadJobs] Transient database error, will retry on next poll:', errorMessage);
      } else {
        setJobsError(errorMessage);
      }
    } finally {
      if (!silent) {
        setJobsLoading(false);
      }
      loadJobsInProgressRef.current = false;
    }
  }, [mode]);

  const loadJobDetails = useCallback(async (jobId: string, silent = false) => {
    if (!silent) {
      setSelectedJobLoading(true);
    }
    try {
      const params = new URLSearchParams({
        pendingLimit: itemLimits.pending.toString(),
        succeededLimit: itemLimits.succeeded.toString(),
        failedLimit: itemLimits.failed.toString(),
      });
      const job = await api.get<SerializedJob>(`/api/llm-jobs/${jobId}?${params}`);
      
      // Smart update: only update state if job actually changed
      setSelectedJobDetails(prev => {
        if (!prev || prev.id !== job.id) {
          return job;
        }
        
        const hasMetadataChanges = 
          prev.status !== job.status ||
          prev.total_items !== job.total_items ||
          prev.submitted_items !== job.submitted_items ||
          prev.processed_items !== job.processed_items ||
          prev.succeeded_items !== job.succeeded_items ||
          prev.failed_items !== job.failed_items ||
          prev.flagged_items !== job.flagged_items ||
          prev.updated_at !== job.updated_at;
        
        const hasItemChanges = prev.items.length !== job.items.length || 
          prev.items.some((item, idx) => {
            const newItem = job.items[idx];
            return !newItem || 
              item.status !== newItem.status ||
              item.updated_at !== newItem.updated_at ||
              item.flagged !== newItem.flagged;
          });
        
        if (!hasMetadataChanges && !hasItemChanges) {
          return prev;
        }
        
        if (hasMetadataChanges && !hasItemChanges) {
          return {
            ...prev,
            status: job.status,
            total_items: job.total_items,
            submitted_items: job.submitted_items,
            processed_items: job.processed_items,
            succeeded_items: job.succeeded_items,
            failed_items: job.failed_items,
            flagged_items: job.flagged_items,
            updated_at: job.updated_at,
          };
        }
        
        return job;
      });

      // Mark job as seen when user clicks on it (not during background polling)
      if (!silent) {
        try {
          await fetch(`/api/llm-jobs/${jobId}/mark-seen`, { method: 'POST' });
        } catch (error) {
          console.error('Failed to mark job as seen:', error);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('Job not found') || errorMessage.includes('404')) {
        console.log('Job not found, clearing selection');
        setSelectedJobDetails(null);
        setActiveJobId(null);
      } else {
        console.error('Failed to load job details:', error);
        if (!silent) {
          setSelectedJobDetails(null);
        }
      }
    } finally {
      if (!silent) {
        setSelectedJobLoading(false);
      }
    }
  }, [itemLimits]);

  const loadMoreItems = useCallback((status: 'pending' | 'succeeded' | 'failed') => {
    setItemLimits(prev => ({
      ...prev,
      [status]: prev[status] + 10,
    }));
  }, []);

  // Reset itemLimits when active job changes
  useEffect(() => {
    if (activeJobId) {
      setItemLimits({ pending: 10, succeeded: 10, failed: 10 });
    }
  }, [activeJobId]);

  // Load jobs when overlay opens
  useEffect(() => {
    if (isOpen) {
      void loadJobs();
    }
  }, [isOpen, loadJobs]);

  // Load job details when a job is selected
  useEffect(() => {
    if (activeJobId && isOpen && !isCreating) {
      void loadJobDetails(activeJobId);
    }
  }, [activeJobId, isOpen, isCreating, loadJobDetails]);

  // Poll for unseen count when overlay is closed
  useEffect(() => {
    if (!isOpen) {
      const pollUnseen = async () => {
        try {
          const response = await fetch(`/api/llm-jobs/unseen-count?pos=${mode}`);
          
          if (!response.ok) {
            console.error('Failed to fetch unseen count:', response.status, response.statusText);
            return;
          }
          
          const text = await response.text();
          if (!text) {
            console.error('Empty response from unseen-count endpoint');
            return;
          }
          
          const data = JSON.parse(text);
          setUnseenCount(data.count || 0);
        } catch (error) {
          console.error('Failed to fetch unseen count:', error);
        }
      };
      
      pollUnseen();
      unseenPollIntervalRef.current = setInterval(pollUnseen, 30000);
      
      return () => {
        if (unseenPollIntervalRef.current) {
          clearInterval(unseenPollIntervalRef.current);
        }
      };
    } else {
      setUnseenCount(0);
    }
  }, [isOpen, mode]);

  // Notify parent of unseen count changes
  useEffect(() => {
    if (onUnseenCountChange) {
      onUnseenCountChange(unseenCount);
    }
  }, [unseenCount, onUnseenCountChange]);

  // Notify parent of pending jobs count changes
  useEffect(() => {
    if (typeof onJobsUpdated === 'function') {
      onJobsUpdated(pendingJobsCount);
    }
  }, [pendingJobsCount, onJobsUpdated]);

  // Periodic refresh for active jobs
  useEffect(() => {
    if (!isOpen) return;
    
    const activeJobs = jobs.filter(job => job.status === 'queued' || job.status === 'running');
    if (activeJobs.length === 0) return;

    const interval = setInterval(async () => {
      if (pollingInProgressRef.current) {
        console.log('[Refresh] Skipping - previous refresh still in progress');
        return;
      }

      pollingInProgressRef.current = true;
      try {
        await loadJobs(true);
        if (activeJobId && !isCreating) {
          await loadJobDetails(activeJobId, true);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('Job not found') || errorMessage.includes('404')) {
          console.log('[Refresh] Active job no longer exists, clearing selection');
          setActiveJobId(null);
          setSelectedJobDetails(null);
        } else {
          console.error('Failed to refresh job data:', error);
        }
      } finally {
        pollingInProgressRef.current = false;
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isOpen, jobs, loadJobDetails, activeJobId, isCreating, loadJobs]);

  return {
    jobs,
    jobsLoading,
    jobsError,
    selectedJobDetails,
    selectedJobLoading,
    activeJobId,
    setActiveJobId,
    itemLimits,
    loadJobs,
    loadJobDetails,
    loadMoreItems,
    selectedJob,
    pendingJobsCount,
    unseenCount,
    clearSelectedJob,
  };
}

