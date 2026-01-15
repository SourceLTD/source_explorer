import { memo, useState } from 'react';
import type { SerializedJob } from '@/lib/llm/types';
import { McpModePill, parseJobConfig, StatusPill } from './components';
import { formatEmailAsName, formatRelativeTime } from './utils';
import LoadingSpinner from '@/components/LoadingSpinner';

const INITIAL_VISIBLE_COUNT = 5;
const LOAD_MORE_INCREMENT = 5;

export interface JobListProps {
  jobs: SerializedJob[];
  jobsLoading: boolean;
  jobsError: string | null;
  selectedJobId: string | null;
  onSelectJob: (jobId: string) => void;
  onStartCreateFlow: () => void;
  isCreating: boolean;
}

export const JobList = memo(function JobList({
  jobs,
  jobsLoading,
  jobsError,
  selectedJobId,
  onSelectJob,
  onStartCreateFlow,
  isCreating,
}: JobListProps) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);
  
  const visibleJobs = jobs.slice(0, visibleCount);
  const hasMore = jobs.length > visibleCount;
  const remainingCount = jobs.length - visibleCount;

  const handleShowMore = () => {
    setVisibleCount(prev => prev + LOAD_MORE_INCREMENT);
  };

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
          <>
            <ul className="divide-y divide-gray-200">
              {visibleJobs.map(job => (
                <li key={job.id} className="relative">
                  <button
                    onClick={() => onSelectJob(job.id)}
                    className={`cursor-pointer flex w-full flex-col items-start gap-1 rounded-xl px-4 py-3 text-left transition-colors ${
                      job.id === selectedJobId ? 'bg-white' : 'hover:bg-white'
                    }`}
                    type="button"
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                        {job.label ?? `Job ${job.id}`}
                      </span>
                      <div className="ml-2 flex flex-shrink-0 items-center gap-1.5">
                        <McpModePill enabled={parseJobConfig(job.config)?.mcpEnabled !== false} />
                        <StatusPill status={job.status} />
                      </div>
                    </div>
                    <div className="flex w-full min-w-0 items-center justify-between text-xs text-gray-500">
                      <span className="flex-shrink-0">{job.total_items} items</span>
                      <span className="flex min-w-0 items-center gap-1">
                        {job.submitted_by && (
                          <>
                            <span className="min-w-0 flex-1 truncate">
                              {formatEmailAsName(job.submitted_by)}
                            </span>
                            <span aria-hidden="true" className="flex-shrink-0 text-gray-400">
                              ·
                            </span>
                          </>
                        )}
                        <span className="flex-shrink-0">{formatRelativeTime(job.created_at)}</span>
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {hasMore && (
              <button
                onClick={handleShowMore}
                className="w-full py-3 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                type="button"
              >
                ... More ({remainingCount})
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  );
});

