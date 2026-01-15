import { memo, useMemo, useState, useCallback } from 'react';
import type { SerializedJob, JobScope } from '@/lib/llm/types';
import type { PartOfSpeech as POSType } from '@/lib/types';

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

/**
 * Format a scope for display
 */
function formatScopeDescription(scope: JobScope | null, totalItems: number): string {
  if (!scope) return `${totalItems} items`;
  
  switch (scope.kind) {
    case 'ids':
      return `${scope.ids.length} ${scope.targetType} by ID selection`;
    case 'frame_ids': {
      const frameCount = scope.frameIds?.length ?? 0;
      const target = scope.flagTarget === 'both' 
        ? 'frames & lexical units' 
        : scope.flagTarget === 'frame'
          ? 'frames'
          : 'lexical units';
      return `${frameCount} frames (${target})`;
    }
    case 'filters':
      return `Filtered ${scope.targetType}${scope.filters?.limit ? ` (limit: ${scope.filters.limit})` : ''}`;
    default:
      return `${totalItems} items`;
  }
}

// ============================================================================
// Status & Badge Components
// ============================================================================

export const StatusPill = memo(function StatusPill({ 
  status, 
  size = 'sm' 
}: { 
  status: SerializedJob['status'];
  size?: 'sm' | 'lg';
}) {
  const { label, color, icon } = useMemo(() => {
    switch (status) {
      case 'queued':
        return { 
          label: 'Queued', 
          color: 'bg-amber-50 text-amber-700 border-amber-200',
          icon: (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )
        };
      case 'running':
        return { 
          label: 'Running', 
          color: 'bg-blue-50 text-blue-600 border-blue-200',
          icon: (
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )
        };
      case 'completed':
        return { 
          label: 'Completed', 
          color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          icon: (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )
        };
      case 'failed':
        return { 
          label: 'Failed', 
          color: 'bg-red-50 text-red-700 border-red-200',
          icon: (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )
        };
      case 'cancelled':
        return { 
          label: 'Cancelled', 
          color: 'bg-gray-100 text-gray-600 border-gray-200',
          icon: (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          )
        };
      case 'paused':
        return { 
          label: 'Paused', 
          color: 'bg-orange-50 text-orange-700 border-orange-200',
          icon: (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )
        };
      default:
        return { 
          label: status, 
          color: 'bg-gray-100 text-gray-600 border-gray-200',
          icon: null
        };
    }
  }, [status]);

  const sizeClasses = size === 'lg' 
    ? 'px-3 py-1.5 text-sm gap-2' 
    : 'px-2 py-0.5 text-[11px] gap-1';

  return (
    <span className={`inline-flex items-center rounded-full border font-medium ${color} ${sizeClasses}`}>
      {icon}
      {label}
    </span>
  );
});

export const McpModePill = memo(function McpModePill({
  enabled,
  size = 'sm',
}: {
  enabled: boolean;
  size?: 'sm' | 'lg';
}) {
  const { label, color, icon, title } = useMemo(() => {
    if (enabled) {
      return {
        label: 'AGENT ON',
        title: 'Agentic mode enabled (MCP tools allowed)',
        color: 'bg-blue-50 text-blue-700 border-blue-200',
        icon: (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        ),
      };
    }

    return {
      label: 'AGENT OFF',
      title: 'Agentic mode disabled (no MCP tools)',
      color: 'bg-gray-100 text-gray-600 border-gray-200',
      icon: (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
          />
        </svg>
      ),
    };
  }, [enabled]);

  const sizeClasses = size === 'lg' ? 'px-3 py-1.5 text-sm gap-2' : 'px-2 py-0.5 text-[11px] gap-1';

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${color} ${sizeClasses}`}
      title={title}
    >
      {icon}
      {label}
    </span>
  );
});

export const JobTypeBadge = memo(function JobTypeBadge({ 
  jobType 
}: { 
  jobType: string | null | undefined;
}) {
  const { label, color } = useMemo(() => {
    switch (jobType) {
      case 'flag':
        return { label: 'Flag', color: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'edit':
        return { label: 'Edit', color: 'bg-sky-50 text-sky-700 border-sky-200' };
      case 'allocate_contents':
        return { label: 'Allocate Contents', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      case 'allocate':
        return { label: 'Allocate', color: 'bg-teal-50 text-teal-700 border-teal-200' };
      case 'split':
        return { label: 'Split', color: 'bg-orange-50 text-orange-700 border-orange-200' };
      case 'review':
        return { label: 'Review', color: 'bg-rose-50 text-rose-700 border-rose-200' };
      default:
        return { label: jobType ?? 'Unknown', color: 'bg-gray-50 text-gray-600 border-gray-200' };
    }
  }, [jobType]);

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
});

export const ServiceTierBadge = memo(function ServiceTierBadge({ 
  tier 
}: { 
  tier: string | null | undefined;
}) {
  const { label, color } = useMemo(() => {
    switch (tier) {
      case 'priority':
        return { label: 'Priority', color: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'flex':
        return { label: 'Flex', color: 'bg-green-50 text-green-700 border-green-200' };
      case 'default':
      default:
        return { label: 'Default', color: 'bg-gray-50 text-gray-600 border-gray-200' };
    }
  }, [tier]);

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
});

// ============================================================================
// Metric Components
// ============================================================================

export const Metric = memo(function Metric({ 
  label, 
  value, 
  helper,
  variant = 'default',
  icon,
  size = 'default'
}: { 
  label: string; 
  value: string | JSX.Element; 
  helper?: string;
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info';
  icon?: React.ReactNode;
  size?: 'default' | 'sm';
}) {
  const variantClasses = useMemo(() => {
    switch (variant) {
      case 'success':
        return 'border-emerald-200 bg-emerald-50/50';
      case 'error':
        return 'border-red-200 bg-red-50/50';
      case 'warning':
        return 'border-amber-200 bg-amber-50/50';
      case 'info':
        return 'border-blue-200 bg-blue-50/50';
      default:
        return 'border-gray-200 bg-white';
    }
  }, [variant]);

  const iconColor = useMemo(() => {
    switch (variant) {
      case 'success': return 'text-emerald-500';
      case 'error': return 'text-red-500';
      case 'warning': return 'text-amber-500';
      case 'info': return 'text-blue-500';
      default: return 'text-gray-400';
    }
  }, [variant]);

  if (size === 'sm') {
    return (
      <div className={`rounded-lg border px-2.5 py-2 transition-colors flex-1 min-w-0 ${variantClasses}`}>
        <div className="flex items-center gap-1.5">
          {icon && <span className={`${iconColor} flex-shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5`}>{icon}</span>}
          <span className="text-[11px] font-medium text-gray-500 truncate">{label}</span>
          <span className="text-[11px] font-semibold text-gray-900 ml-auto flex-shrink-0">{value}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-3 transition-colors ${variantClasses}`}>
      <div className="flex items-center gap-1.5">
        {icon && <span className={iconColor}>{icon}</span>}
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <div className="mt-1 text-lg font-semibold text-gray-900">{value}</div>
      {helper && <div className="text-[11px] text-gray-500">{helper}</div>}
    </div>
  );
});

// ============================================================================
// Configuration Components
// ============================================================================

// Re-export JobConfig type alias for backwards compatibility
export type JobConfig = ParsedJobConfig;

/**
 * Helper to safely parse a job's config JSON
 */
export function parseJobConfig(config: unknown): ParsedJobConfig | null {
  if (!config || typeof config !== 'object') return null;
  return config as ParsedJobConfig;
}

/**
 * Helper to safely parse a job's scope JSON
 */
export function parseJobScope(scope: unknown): JobScope | null {
  if (!scope || typeof scope !== 'object') return null;
  const parsed = scope as { kind?: string };
  if (!parsed.kind || !['ids', 'frame_ids', 'filters'].includes(parsed.kind)) {
    return null;
  }
  return scope as JobScope;
}

export const ConfigCard = memo(function ConfigCard({ 
  config,
  scope,
  totalItems,
  jobType
}: { 
  config: ParsedJobConfig | null;
  scope: JobScope | null;
  totalItems: number;
  jobType: string | null | undefined;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const scopeSummary = useMemo(() => {
    return formatScopeDescription(scope, totalItems);
  }, [scope, totalItems]);

  if (!config) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/50 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg 
            className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Configuration</span>
        </div>
        <span className="text-[11px] text-gray-400 font-mono">
          {config.model ?? 'Unknown model'}
        </span>
      </button>
      
      {isExpanded && (
        <div className="border-t border-gray-200 bg-white p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-[11px] text-gray-500 mb-1">Model</div>
              <div className="text-sm font-mono font-medium text-gray-900">{config.model ?? '—'}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-500 mb-1">Service Tier</div>
              <ServiceTierBadge tier={config.serviceTier} />
            </div>
            <div>
              <div className="text-[11px] text-gray-500 mb-1">Scope</div>
              <div className="text-sm font-medium text-gray-900">{scopeSummary}</div>
            </div>
            {config.targetFields && config.targetFields.length > 0 && (
              <div>
                <div className="text-[11px] text-gray-500 mb-1">Target Fields</div>
                <div className="flex flex-wrap gap-1">
                  {config.targetFields.map((field: string) => (
                    <span key={field} className="inline-flex items-center rounded bg-gray-200 px-1.5 py-0.5 text-[11px] font-medium text-gray-700">
                      {field}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {config.reasoning?.effort && (
              <div>
                <div className="text-[11px] text-gray-500 mb-1">Reasoning Effort</div>
                <div className="text-sm font-medium text-gray-900 capitalize">{config.reasoning.effort}</div>
              </div>
            )}
            {jobType === 'allocate_contents' && config.reallocationEntityTypes && config.reallocationEntityTypes.length > 0 && (
              <div>
                <div className="text-[11px] text-gray-500 mb-1">Entity Types</div>
                <div className="flex flex-wrap gap-1">
                  {config.reallocationEntityTypes.map((type: string) => (
                    <span key={type} className="inline-flex items-center rounded bg-indigo-100 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700">
                      {type}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export const CollapsiblePrompt = memo(function CollapsiblePrompt({ 
  prompt 
}: { 
  prompt: string | undefined;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [prompt]);

  if (!prompt) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/50 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg 
            className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Prompt Template</span>
        </div>
        <span className="text-[11px] text-gray-400">
          {prompt.length} characters
        </span>
      </button>
      
      {isExpanded && (
        <div className="border-t border-gray-200 bg-white">
          <div className="flex items-center justify-end px-3 py-1.5 border-b border-gray-100">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
            >
              {copied ? (
                <>
                  <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </>
              )}
            </button>
          </div>
          <pre className="p-4 text-xs font-mono text-gray-800 overflow-x-auto whitespace-pre-wrap max-h-80 overflow-y-auto">
            {prompt}
          </pre>
        </div>
      )}
    </div>
  );
});

// ============================================================================
// Progress Components
// ============================================================================

export const ProgressBar = memo(function ProgressBar({
  label,
  current,
  total,
  variant = 'default',
  showPercentage = true,
  helperText
}: {
  label: string;
  current: number;
  total: number;
  variant?: 'default' | 'success' | 'error' | 'submitting' | 'processing';
  showPercentage?: boolean;
  helperText?: string;
}) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  
  const { bgColor, fillColor, textColor } = useMemo(() => {
    switch (variant) {
      case 'submitting':
        return { bgColor: 'bg-blue-100', fillColor: 'bg-blue-500', textColor: 'text-blue-600' };
      case 'processing':
        return { bgColor: 'bg-emerald-100', fillColor: 'bg-emerald-500', textColor: 'text-emerald-700' };
      case 'success':
        return { bgColor: 'bg-emerald-100', fillColor: 'bg-emerald-500', textColor: 'text-emerald-700' };
      case 'error':
        return { bgColor: 'bg-red-100', fillColor: 'bg-red-500', textColor: 'text-red-700' };
      default:
        return { bgColor: 'bg-gray-200', fillColor: 'bg-gray-600', textColor: 'text-gray-700' };
    }
  }, [variant]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className={`text-sm font-medium ${textColor}`}>{label}</span>
        <span className={`text-sm ${textColor}`}>
          {showPercentage && `${percentage}% · `}{current.toLocaleString()} / {total.toLocaleString()}
        </span>
      </div>
      <div className={`h-2 w-full rounded-full ${bgColor} overflow-hidden`}>
        <div 
          className={`h-full rounded-full ${fillColor}`}
          style={{ 
            width: `${percentage}%`,
            transition: 'width 500ms ease-out'
          }}
        />
      </div>
      {helperText && (
        <div className="text-[11px] text-gray-500">{helperText}</div>
      )}
    </div>
  );
});

// ============================================================================
// Token & Cost Components
// ============================================================================

export const formatCost = (microunits: string | null | undefined): string => {
  if (!microunits) return '—';
  const cents = Number(microunits) / 10000; // 1 microunit = 0.0001 cents
  if (cents < 1) {
    return `$${(cents / 100).toFixed(4)}`;
  }
  return `$${(cents / 100).toFixed(2)}`;
};

export const formatTokens = (tokens: number | null | undefined): string => {
  if (tokens === null || tokens === undefined) return '—';
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toLocaleString();
};

// ============================================================================
// Error Component
// ============================================================================

export const ErrorBanner = memo(function ErrorBanner({ 
  error 
}: { 
  error: string | null | undefined;
}) {
  if (!error) return null;

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-red-800">Job Failed</h4>
          <p className="mt-1 text-sm text-red-700 break-words">{error}</p>
        </div>
      </div>
    </div>
  );
});

export const ItemList = memo(function ItemList({
  title,
  items,
  emptyMessage,
  totalCount,
  onLoadMore,
  jobIsSuperFrame,
  showFlaggedStatus,
}: {
  title: string;
  items: SerializedJob['items'];
  emptyMessage: string;
  totalCount: number;
  onLoadMore?: () => void;
  jobIsSuperFrame?: boolean;
  showFlaggedStatus?: boolean;
}) {
  const hasMore = items.length < totalCount;
  const remaining = totalCount - items.length;
  
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</h5>
        {items.length > 0 && (
          <span className="text-[11px] text-gray-500">Showing {items.length} of {totalCount}</span>
        )}
      </div>
      {items.length === 0 ? (
        <div className="rounded border border-dashed border-gray-200 p-3 text-[11px] text-gray-500">{emptyMessage}</div>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map(item => {
              const getItemColors = () => {
                switch (item.status) {
                  case 'queued':
                  case 'submitting':
                  case 'processing':
                    return 'border-blue-200 bg-blue-50 text-blue-600';
                  case 'succeeded':
                    return 'border-green-200 bg-green-50 text-green-700';
                  case 'failed':
                    return 'border-red-200 bg-red-50 text-red-700';
                  case 'skipped':
                    return 'border-gray-200 bg-gray-50 text-gray-700';
                  default:
                    return 'border-gray-200 bg-gray-50 text-gray-700';
                }
              };
              
              // Always show code (fallback to ID)
              const displayName = item.entry.code ?? item.id;
              
              return (
                <li key={item.id} className={`rounded border px-3 py-2 text-[11px] ${getItemColors()}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold">{displayName}</span>
                      <span className="ml-2 uppercase opacity-75">
                        {item.entry.pos === 'frames' 
                          ? (item.entry.isSuperFrame ?? jobIsSuperFrame ? 'SUPER FRAME' : 'FRAME')
                          : item.entry.pos}
                      </span>
                    </div>
                    <span className="opacity-75">{item.status}</span>
                  </div>
                  {item.last_error && <div className="mt-1 text-[10px] text-red-600">{item.last_error}</div>}
                  {item.response_payload &&
                    item.status === 'succeeded' &&
                    ((showFlaggedStatus && item.flagged !== null && item.flagged !== undefined) || item.has_edits) && (
                      <div className="mt-1 flex items-center gap-2 text-[10px] opacity-75">
                        {showFlaggedStatus && (
                          <span>Flagged: {item.flagged ? 'Yes' : 'No'}</span>
                        )}
                        {item.has_edits && (
                          <span className="rounded bg-blue-100 px-1.5 py-0.5 font-semibold text-blue-600">
                            AI Edits Staged
                          </span>
                        )}
                      </div>
                    )}
                </li>
              );
            })}
          </ul>
          {hasMore && onLoadMore && (
            <button
              onClick={onLoadMore}
              className="mt-2 w-full rounded border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Load More ({remaining} remaining)
            </button>
          )}
        </>
      )}
    </div>
  );
});

