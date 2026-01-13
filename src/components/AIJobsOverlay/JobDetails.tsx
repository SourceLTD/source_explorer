import { memo, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SerializedJob } from '@/lib/llm/types';
import { 
  StatusPill, 
  JobTypeBadge,
  Metric, 
  ItemList,
  ConfigCard,
  CollapsiblePrompt,
  ProgressBar,
  ErrorBanner,
  formatCost,
  formatTokens,
  parseJobConfig,
  parseJobScope
} from './components';
import { formatRuntime } from './utils';
import LoadingSpinner from '@/components/LoadingSpinner';
import type { DataTableMode } from '../DataTable/types';

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
  mode: DataTableMode;
  onLoadMore: (status: 'pending' | 'succeeded' | 'failed') => void;
  cancelLoading?: boolean;
}) {
  const router = useRouter();
  
  // Parse config and scope
  const config = useMemo(() => parseJobConfig(job.config), [job.config]);
  const scope = useMemo(() => parseJobScope(job.scope), [job.scope]);
  
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

  // Calculate edits count
  const editsCount = useMemo(
    () => job.items.filter(i => i.has_edits).length,
    [job.items]
  );

  // Check if job is actively running
  const isActive = ['queued', 'running'].includes(job.status);
  const isSubmitting = submissionProgress && submissionProgress.jobId === job.id && submissionProgress.isSubmitting;
  // Only show processing bar when NOT submitting and all items are submitted
  const isProcessing = !isSubmitting && isActive && (job.submitted_items ?? 0) >= job.total_items && (job.processed_items ?? 0) < job.total_items;

  const [isItemsExpanded, setIsItemsExpanded] = useState(true);

  return (
    <div className="space-y-5">
      {/* ===== HEADER SECTION ===== */}
      <div className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <StatusPill status={job.status} size="lg" />
              <h2 className="text-lg font-semibold text-gray-900 truncate">
                {job.label ?? `Job ${job.id}`}
              </h2>
            </div>
            <div className="mt-2 flex items-center gap-3 text-sm text-gray-500 flex-wrap">
              <JobTypeBadge jobType={job.job_type} />
              {job.submitted_by && (
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  {job.submitted_by}
                </span>
              )}
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {new Date(job.created_at).toLocaleString()}
              </span>
            </div>
        </div>
          
          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => onCloneSettings(job)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            title="Clone job settings to create a new job"
          >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
              Clone
          </button>
          {job.status === 'completed' && (
            <button
              onClick={() => {
                onClose();
                const baseUrl = `/table?flaggedByJobId=${encodeURIComponent(job.id)}&tab=${mode === 'frames' ? 'frames' : 'lexical_units'}`;
                router.push(baseUrl);
              }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View Flagged
            </button>
          )}
            {isActive && (
            <button
              onClick={() => onCancel(job.id)}
              disabled={cancelLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancelLoading ? (
                <>
                  <LoadingSpinner size="sm" noPadding />
                  Cancelling...
                </>
              ) : (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Cancel
                  </>
              )}
            </button>
          )}
          <button
            onClick={() => onDelete(job.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors"
          >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
          </button>
        </div>
      </div>

        {/* ===== METRICS (compact, full width) ===== */}
        <div className="mt-4 grid grid-cols-4 md:grid-cols-8 gap-2">
          <Metric 
            size="sm"
            label="Processed" 
            value={`${job.processed_items}/${job.total_items}`}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            }
          />
          <Metric 
            size="sm"
            label="Succeeded" 
            value={job.succeeded_items.toString()}
            variant={job.succeeded_items > 0 ? 'success' : 'default'}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            }
          />
          <Metric 
            size="sm"
            label="Failed" 
            value={job.failed_items.toString()}
            variant={job.failed_items > 0 ? 'error' : 'default'}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            }
          />
          <Metric 
            size="sm"
            label="Flagged" 
            value={job.flagged_items.toString()}
            variant={job.flagged_items > 0 ? 'warning' : 'default'}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
              </svg>
            }
          />
          <Metric 
            size="sm"
            label="Edits" 
            value={editsCount.toString()}
            variant={editsCount > 0 ? 'info' : 'default'}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            }
          />
          <Metric
            size="sm"
            label="Runtime"
            value={formatRuntime(job.started_at, job.completed_at ?? undefined)}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <Metric
            size="sm"
            label="Tokens In"
            value={formatTokens(job.input_tokens)}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16l-4-4m0 0l4-4m-4 4h18" />
              </svg>
            }
          />
          <Metric
            size="sm"
            label="Tokens Out"
            value={formatTokens(job.output_tokens)}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            }
          />
          {job.cost_microunits && (
            <Metric
              size="sm"
              label="Cost"
              value={formatCost(job.cost_microunits)}
              icon={
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
          )}
        </div>
      </div>

      {/* ===== ERROR BANNER ===== */}
      <ErrorBanner error={job.error} />

      {/* ===== PROGRESS SECTION ===== */}
      {(isSubmitting || isProcessing) && (
        <div 
          className={`rounded-xl border p-4 transition-colors duration-300 ${
            isSubmitting 
              ? 'border-blue-200 bg-blue-50/50' 
              : 'border-emerald-200 bg-emerald-50/50'
          }`}
        >
          <ProgressBar
            label={isSubmitting ? "Submitting to OpenAI..." : "Processing with OpenAI..."}
            current={isSubmitting ? (submissionProgress?.submitted ?? 0) : (job.processed_items ?? 0)}
            total={isSubmitting ? (submissionProgress?.total ?? job.total_items) : job.total_items}
            variant={isSubmitting ? "submitting" : "processing"}
            helperText={isSubmitting && submissionProgress && submissionProgress.failed > 0 ? `${submissionProgress.failed} items failed to submit` : undefined}
          />
          {isProcessing && (
            <div className="mt-3 flex gap-4 text-xs">
              {(job.succeeded_items ?? 0) > 0 && (
                <span className="flex items-center gap-1 text-emerald-700">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {job.succeeded_items} succeeded
                </span>
              )}
              {(job.failed_items ?? 0) > 0 && (
                <span className="flex items-center gap-1 text-red-600">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  {job.failed_items} failed
                </span>
              )}
              {(job.flagged_items ?? 0) > 0 && (
                <span className="flex items-center gap-1 text-amber-600">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  {job.flagged_items} flagged
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== CONFIGURATION SECTION ===== */}
      <ConfigCard 
        config={config} 
        scope={scope} 
        totalItems={job.total_items}
        jobType={job.job_type}
      />

      {/* ===== PROMPT TEMPLATE ===== */}
      <CollapsiblePrompt prompt={config?.userPromptTemplate} />

      {/* ===== JOB ITEMS SECTION (Collapsible) ===== */}
      <div className="rounded-xl border border-gray-200 bg-gray-50/50 overflow-hidden">
        <button
          onClick={() => setIsItemsExpanded(!isItemsExpanded)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-100/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg 
              className={`w-4 h-4 text-gray-500 transition-transform ${isItemsExpanded ? 'rotate-90' : ''}`} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Job Items</span>
      </div>
          <span className="text-[11px] text-gray-400">
            {job.total_items} total
          </span>
        </button>

        {isItemsExpanded && (
          <div className="border-t border-gray-200 bg-white p-4 space-y-3">
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
          </div>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison to prevent re-renders when only counts change
  return (
    prevProps.job.id === nextProps.job.id &&
    prevProps.job.status === nextProps.job.status &&
    prevProps.job.processed_items === nextProps.job.processed_items &&
    prevProps.job.succeeded_items === nextProps.job.succeeded_items &&
    prevProps.job.failed_items === nextProps.job.failed_items &&
    prevProps.job.flagged_items === nextProps.job.flagged_items &&
    prevProps.job.items.length === nextProps.job.items.length &&
    prevProps.job.input_tokens === nextProps.job.input_tokens &&
    prevProps.job.output_tokens === nextProps.job.output_tokens &&
    prevProps.job.cost_microunits === nextProps.job.cost_microunits &&
    prevProps.job.error === nextProps.job.error &&
    prevProps.submissionProgress?.jobId === nextProps.submissionProgress?.jobId &&
    prevProps.submissionProgress?.submitted === nextProps.submissionProgress?.submitted &&
    prevProps.onCancel === nextProps.onCancel &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.onCloneSettings === nextProps.onCloneSettings
  );
});
