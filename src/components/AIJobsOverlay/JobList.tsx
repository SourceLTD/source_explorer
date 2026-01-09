import { memo } from 'react';
import type { SerializedJob } from '@/lib/llm/types';
import { StatusPill } from './components';
import LoadingSpinner from '@/components/LoadingSpinner';

export interface JobListProps {
  jobs: SerializedJob[];
  jobsLoading: boolean;
  jobsError: string | null;
  selectedJobId: string | null;
  onSelectJob: (jobId: string) => void;
  onCloneSettings: (job: SerializedJob) => void;
  onStartCreateFlow: () => void;
  isCreating: boolean;
}

export const JobList = memo(function JobList({
  jobs,
  jobsLoading,
  jobsError,
  selectedJobId,
  onSelectJob,
  onCloneSettings,
  onStartCreateFlow,
  isCreating,
}: JobListProps) {
  return (
    <aside className="w-96 border-r border-gray-200 bg-gray-50">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-6 py-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Jobs</h3>
        </div>
        <button
          onClick={onStartCreateFlow}
          disabled={isCreating}
          className="cursor-pointer inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 disabled:pointer-events-none"
          type="button"
        >
          Create New Job
        </button>
      </div>
      <div className="h-full overflow-auto px-2">
        {jobsError && (
          <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {jobsError}
          </div>
        )}
        {jobsLoading && jobs.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" label="Loading jobs..." />
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-4 text-xs text-gray-500">
            No AI jobs yet. Use "Create New Job" to start a batch.
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {jobs.map(job => (
              <li key={job.id} className="relative">
                <button
                  onClick={() => onSelectJob(job.id)}
                  className={`cursor-pointer flex w-full flex-col items-start gap-1 rounded-xl px-4 py-3 text-left transition-colors ${
                    job.id === selectedJobId ? 'bg-white' : 'hover:bg-white'
                  }`}
                  type="button"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">{job.label ?? `Job ${job.id}`}</span>
                    <div className="flex items-center gap-2">
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          onCloneSettings(job);
                        }}
                        className="cursor-pointer rounded p-1 text-blue-600 hover:bg-blue-50"
                        title="Clone job settings"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            onCloneSettings(job);
                          }
                        }}
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <StatusPill status={job.status} />
                    </div>
                  </div>
                  <div className="flex w-full items-center justify-between text-xs text-gray-500">
                    <span>{job.total_items} items</span>
                    <span>{new Date(job.created_at).toLocaleString()}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
});

