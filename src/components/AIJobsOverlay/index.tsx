"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api-client';
import { showGlobalAlert } from '@/lib/alerts';
import type { SerializedJob } from '@/lib/llm/types';
import LoadingSpinner from '@/components/LoadingSpinner';
import { createClient } from '@/utils/supabase/client';

import type { AIJobsOverlayProps } from './types';
import { useJobPolling } from './hooks/useJobPolling';
import { useJobCreation } from './hooks/useJobCreation';
import { JobDetails } from './JobDetails';
import { JobList } from './JobList';
import { CreationWizard } from './CreationWizard';

export function AIJobsOverlay({
  isOpen,
  onClose,
  mode,
  selectedIds,
  userEmail: userEmailProp,
  onJobsUpdated,
  onUnseenCountChange,
  onJobCompleted,
}: AIJobsOverlayProps) {
  // Get user email from Supabase if not provided as prop
  const [fetchedUserEmail, setFetchedUserEmail] = useState<string | null>(null);
  
  useEffect(() => {
    if (!userEmailProp && isOpen) {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data: { user } }) => {
        setFetchedUserEmail(user?.email ?? null);
      });
    }
  }, [userEmailProp, isOpen]);
  
  const userEmail = userEmailProp ?? fetchedUserEmail;
  // Job polling hook - manages job list, selection, and polling
  const polling = useJobPolling({
    mode,
    isOpen,
    isCreating: false, // Will be updated below
    onJobsUpdated,
    onUnseenCountChange,
    onJobCompleted,
  });

  // Job creation hook - manages creation wizard state
  const creation = useJobCreation({
    mode,
    selectedIds,
    isOpen,
    userEmail,
    onJobCreated: useCallback(async (job: SerializedJob) => {
      await polling.loadJobs();
      polling.setActiveJobId(job.id);
    }, [polling.loadJobs, polling.setActiveJobId]),
  });

  // Update polling's isCreating flag
  const pollingWithCreating = useMemo(() => ({
    ...polling,
    isCreating: creation.isCreating,
  }), [polling, creation.isCreating]);

  // Cancel job handler
  const handleCancelJob = useCallback(async (jobId: string) => {
    try {
      await api.post(`/api/llm-jobs/${jobId}/cancel`, {});
      await polling.loadJobs();
      if (polling.activeJobId === jobId) {
        await polling.loadJobDetails(jobId);
      }
      showGlobalAlert({
        type: 'success',
        title: 'Job Cancelled',
        message: `Job ${jobId} has been cancelled successfully.`,
        durationMs: 5000,
      });
    } catch (error) {
      console.error('Failed to cancel job', error);
      showGlobalAlert({
        type: 'error',
        title: 'Cancellation Failed',
        message: error instanceof Error ? error.message : 'Failed to cancel job',
        durationMs: 7000,
      });
    }
  }, [polling.loadJobs, polling.activeJobId, polling.loadJobDetails]);

  // Delete job handler
  const handleDeleteJob = useCallback(async (jobId: string) => {
    try {
      await api.delete(`/api/llm-jobs/${jobId}`);
      polling.clearSelectedJob();
      await polling.loadJobs();
      showGlobalAlert({
        type: 'success',
        title: 'Deleted',
        message: `Job ${jobId} deleted.`,
        durationMs: 5000,
      });
    } catch (error) {
      console.error('Failed to delete job', error);
      showGlobalAlert({
        type: 'error',
        title: 'Delete failed',
        message: error instanceof Error ? error.message : 'Failed to delete job',
        durationMs: 7000,
      });
    }
  }, [polling.clearSelectedJob, polling.loadJobs]);

  // Track submission progress for active jobs
  const { submissionProgress, setSubmissionProgress } = creation;
  useEffect(() => {
    if (!isOpen || polling.jobs.length === 0) return;
    
    const activeJob = polling.jobs.find(job => 
      (job.status === 'queued' || job.status === 'running') &&
      (job.submitted_items ?? 0) < job.total_items
    );
    
    if (activeJob) {
      // Only update if values actually changed to avoid infinite loop
      const newSubmitted = activeJob.submitted_items ?? 0;
      const newFailed = activeJob.failed_items ?? 0;
      if (
        submissionProgress?.jobId !== activeJob.id ||
        submissionProgress?.submitted !== newSubmitted ||
        submissionProgress?.total !== activeJob.total_items ||
        submissionProgress?.failed !== newFailed ||
        !submissionProgress?.isSubmitting
      ) {
        setSubmissionProgress({
          jobId: activeJob.id,
          submitted: newSubmitted,
          total: activeJob.total_items,
          failed: newFailed,
          isSubmitting: true,
        });
      }
    } else if (submissionProgress?.isSubmitting) {
      setSubmissionProgress(null);
    }
  }, [isOpen, polling.jobs, submissionProgress, setSubmissionProgress]);

  const pendingBadge = polling.pendingJobsCount > 0 ? polling.pendingJobsCount : null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}
        onClick={onClose}
      />
      <div className="relative z-10 flex h-[90vh] w-full max-w-[90rem] flex-col overflow-hidden rounded-xl bg-white">
        
        <header className="border-b border-gray-200 bg-gray-50 px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">AI Agent</h2>
              <p className="text-sm text-gray-600">Create and track AI jobs</p>
            </div>
            <div className="flex items-center gap-2">
              {pendingBadge && (
                <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
                  Pending Jobs: {pendingBadge}
                </span>
              )}
              <button
                onClick={() => polling.loadJobs()}
                disabled={polling.jobsLoading}
                className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 ${
                  polling.jobsLoading
                    ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 focus:ring-gray-300'
                    : 'cursor-pointer border-gray-300 bg-white text-gray-700 hover:bg-gray-100 focus:ring-blue-500'
                }`}
                type="button"
              >
                <LoadingSpinner 
                  size="sm" 
                  isSpinning={polling.jobsLoading} 
                  noPadding 
                />
                Refresh
              </button>
              <button
                onClick={onClose}
                className="cursor-pointer inline-flex items-center gap-1 rounded-xl bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400"
                type="button"
              >
                Close
              </button>
            </div>
          </div>
        </header>

        {creation.isCreating ? (
          <CreationWizard
            creation={creation}
            mode={mode}
          />
        ) : (
          <div className="flex flex-1 overflow-hidden">
            <JobList
              jobs={polling.jobs}
              jobsLoading={polling.jobsLoading}
              jobsError={polling.jobsError}
              selectedJobId={polling.selectedJob?.id ?? null}
              onSelectJob={polling.setActiveJobId}
              onCloneSettings={creation.loadJobSettings}
              onStartCreateFlow={creation.startCreateFlow}
              isCreating={creation.isCreating}
            />

            <main className="relative flex flex-1 flex-col overflow-hidden bg-white">
              <div className="flex-1 overflow-auto px-8 py-6">
                {polling.selectedJobLoading ? (
                  <LoadingSpinner size="page" label="Loading job details..." className="h-full" />
                ) : polling.selectedJobDetails ? (
                  <JobDetails
                    job={polling.selectedJobDetails}
                    onCancel={handleCancelJob}
                    onDelete={handleDeleteJob}
                    onClose={onClose}
                    onCloneSettings={creation.loadJobSettings}
                    submissionProgress={creation.submissionProgress}
                    mode={mode}
                    onLoadMore={polling.loadMoreItems}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-gray-500">
                    Select a job from the list to view details.
                  </div>
                )}
              </div>
            </main>
          </div>
        )}
      </div>
    </div>
  );
}

export default AIJobsOverlay;
