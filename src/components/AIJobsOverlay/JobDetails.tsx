import { memo, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { SerializedJob } from '@/lib/llm/types';
import { StatusPill, Metric, ItemList } from './components';
import { formatRuntime } from './utils';
import LoadingSpinner from '@/components/LoadingSpinner';

export const JobDetails = memo(function JobDetails({ 
  job, 
  onCancel, 
  onDelete, 
  onClose,
  onCloneSettings,
  submissionProgress,
  mode,
  onLoadMore,
  cancelLoading
}: { 
  job: SerializedJob; 
  onCancel: (jobId: string) => void; 
  onDelete: (jobId: string) => void; 
  onClose: () => void;
  onCloneSettings: (job: SerializedJob) => void;
  submissionProgress: {
    jobId: string;
    submitted: number;
    total: number;
    failed: number;
    isSubmitting: boolean;
  } | null;
  mode: 'verbs' | 'nouns' | 'adjectives' | 'adverbs' | 'frames';
  onLoadMore: (status: 'pending' | 'succeeded' | 'failed') => void;
  cancelLoading?: boolean;
}) {
  const router = useRouter();
  
  // Memoize filtered item lists to prevent re-computation
  const pendingItems = useMemo(
    () => job.items.filter(item => item.status === 'queued' || item.status === 'processing'),
    [job.items]
  );
  const succeededItems = useMemo(
    () => job.items.filter(item => item.status === 'succeeded'),
    [job.items]
  );
  const failedItems = useMemo(
    () => job.items.filter(item => item.status === 'failed'),
    [job.items]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{job.label ?? `Job ${job.id}`}</h3>
          <p className="text-xs text-gray-500">Created {new Date(job.created_at).toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onCloneSettings(job)}
            className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-blue-600 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            title="Clone job settings to create a new job"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Clone Job Settings
          </button>
          {job.status === 'completed' && (
            <button
              onClick={() => {
                onClose();
                // Navigate to the correct table page based on entity type
                const baseUrl = mode === 'verbs' || mode === 'frames'
                  ? `/table?flaggedByJobId=${encodeURIComponent(job.id)}&tab=${mode}`
                  : `/table/${mode}?flaggedByJobId=${encodeURIComponent(job.id)}`;
                router.push(baseUrl);
              }}
              className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-blue-600 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            >
              See all flagged {mode}
            </button>
          )}
          {['queued', 'running'].includes(job.status) && (
            <button
              onClick={() => onCancel(job.id)}
              disabled={cancelLoading}
              className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-red-600 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelLoading ? (
                <>
                  <LoadingSpinner size="sm" noPadding />
                  Cancelling...
                </>
              ) : (
                'Cancel Job'
              )}
            </button>
          )}
          <button
            onClick={() => onDelete(job.id)}
            className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-red-600 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            Delete Job
          </button>
        </div>
      </div>

      {submissionProgress && submissionProgress.jobId === job.id && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-blue-800">
              Submitting to OpenAI...
            </span>
            <span className="text-sm text-blue-700">
              {submissionProgress.submitted} / {submissionProgress.total}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-blue-200">
            <div 
              className="h-full rounded-full bg-blue-600 transition-all duration-300"
              style={{ 
                width: `${(submissionProgress.submitted / submissionProgress.total) * 100}%` 
              }}
            />
          </div>
          {submissionProgress.failed > 0 && (
            <p className="mt-2 text-xs text-red-600">
              {submissionProgress.failed} items failed to submit
            </p>
          )}
        </div>
      )}

      {/* Completion Progress - shown when items are being processed by OpenAI */}
      {['queued', 'running'].includes(job.status) && 
       job.submitted_items === job.total_items && 
       (job.processed_items ?? 0) < job.total_items && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-green-800">
              Processing with OpenAI...
            </span>
            <span className="text-sm text-green-700">
              {job.processed_items ?? 0} / {job.total_items}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-green-200">
            <div 
              className="h-full rounded-full bg-green-600 transition-all duration-300"
              style={{ 
                width: `${((job.processed_items ?? 0) / job.total_items) * 100}%` 
              }}
            />
          </div>
          <div className="mt-2 flex gap-3 text-xs">
            {(job.succeeded_items ?? 0) > 0 && (
              <span className="text-green-700">
                ✓ {job.succeeded_items} succeeded
              </span>
            )}
            {(job.failed_items ?? 0) > 0 && (
              <span className="text-red-600">
                ✗ {job.failed_items} failed
              </span>
            )}
            {(job.flagged_items ?? 0) > 0 && (
              <span className="text-amber-600">
                ⚠ {job.flagged_items} flagged
              </span>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <Metric label="Status" value={<StatusPill status={job.status} />} />
        <Metric label="Items" value={`${job.processed_items}/${job.total_items}`} helper="Processed" />
        <Metric label="Succeeded" value={job.succeeded_items.toString()} helper="Items completed" />
        <Metric label="Failed" value={job.failed_items.toString()} helper="Items errored" />
        <Metric label="Flagged" value={job.flagged_items.toString()} helper="AI suggested flagged" />
        <Metric 
          label="Edits" 
          value={job.items.filter(i => i.has_edits).length.toString()} 
          helper="AI suggested edits" 
        />
        <Metric
          label="Runtime"
          value={formatRuntime(job.started_at, job.completed_at ?? undefined)}
          helper="Duration"
        />
      </div>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-800">Job Items</h4>
        <ItemList 
          title="Pending" 
          items={pendingItems} 
          emptyMessage="No items pending." 
          totalCount={job.total_items - job.succeeded_items - job.failed_items}
          onLoadMore={() => onLoadMore('pending')}
        />
        <ItemList 
          title="Succeeded" 
          items={succeededItems} 
          emptyMessage="No successes yet." 
          totalCount={job.succeeded_items}
          onLoadMore={() => onLoadMore('succeeded')}
        />
        <ItemList 
          title="Failed" 
          items={failedItems} 
          emptyMessage="No failures." 
          totalCount={job.failed_items}
          onLoadMore={() => onLoadMore('failed')}
        />
      </section>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison to prevent re-renders when only counts change
  // We compare key fields that should trigger re-render
  return (
    prevProps.job.id === nextProps.job.id &&
    prevProps.job.status === nextProps.job.status &&
    prevProps.job.processed_items === nextProps.job.processed_items &&
    prevProps.job.succeeded_items === nextProps.job.succeeded_items &&
    prevProps.job.failed_items === nextProps.job.failed_items &&
    prevProps.job.flagged_items === nextProps.job.flagged_items &&
    prevProps.job.items.length === nextProps.job.items.length &&
    prevProps.submissionProgress?.jobId === nextProps.submissionProgress?.jobId &&
    prevProps.submissionProgress?.submitted === nextProps.submissionProgress?.submitted &&
    prevProps.onCancel === nextProps.onCancel &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.onCloneSettings === nextProps.onCloneSettings
  );
});

