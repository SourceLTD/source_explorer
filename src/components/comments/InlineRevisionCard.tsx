'use client';

import React, { useState, useMemo } from 'react';
import { 
  CheckIcon, 
  XMarkIcon, 
  PencilIcon, 
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';
import LoadingSpinner from '@/components/LoadingSpinner';

// Types for AI revision data
export interface AIRevision {
  id: string;
  action: 'approve' | 'reject' | 'modify' | 'keep_as_is';
  modifications: Array<{
    field: string;
    old_value: unknown;
    new_value: unknown;
  }> | null;
  justification: string | null;
  confidence: number | null;
  status: 'pending' | 'accepted' | 'rejected' | 'partial';
  accepted_fields: string[];
  rejected_fields: string[];
  created_at: string;
  resolved_at: string | null;
}

interface InlineRevisionCardProps {
  revision: AIRevision;
  onResolve: (revisionId: string, acceptedFields: string[], rejectedFields: string[]) => Promise<void>;
  /** Callback when changeset should be refreshed after resolution */
  onChangesetUpdated?: () => void;
}

const ACTION_CONFIG = {
  approve: {
    icon: CheckIcon,
    label: 'Recommends Approval',
    color: 'green',
  },
  reject: {
    icon: XMarkIcon,
    label: 'Recommends Rejection',
    color: 'red',
  },
  modify: {
    icon: PencilIcon,
    label: 'Suggests Modifications',
    color: 'amber',
  },
  keep_as_is: {
    icon: ArrowPathIcon,
    label: 'Keep As-Is',
    color: 'gray',
  },
};

const colorMap = {
  green: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    icon: 'text-green-600',
    badge: 'bg-green-100 text-green-700',
    headerBg: 'bg-gradient-to-r from-green-50 to-emerald-50',
  },
  red: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: 'text-red-600',
    badge: 'bg-red-100 text-red-700',
    headerBg: 'bg-gradient-to-r from-red-50 to-rose-50',
  },
  amber: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: 'text-amber-600',
    badge: 'bg-amber-100 text-amber-700',
    headerBg: 'bg-gradient-to-r from-amber-50 to-yellow-50',
  },
  gray: {
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    icon: 'text-gray-600',
    badge: 'bg-gray-100 text-gray-700',
    headerBg: 'bg-gradient-to-r from-gray-50 to-slate-50',
  },
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(empty)';
  if (typeof value === 'string') return value || '(empty string)';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '(empty array)';
  return JSON.stringify(value);
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function InlineRevisionCard({
  revision,
  onResolve,
  onChangesetUpdated,
}: InlineRevisionCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(() => {
    // Default: all fields selected for modify action
    if (revision.modifications && revision.action === 'modify') {
      return new Set(revision.modifications.map(m => m.field));
    }
    return new Set();
  });
  const [isResolving, setIsResolving] = useState(false);

  const config = ACTION_CONFIG[revision.action];
  const colorClasses = colorMap[config.color as keyof typeof colorMap];
  const Icon = config.icon;

  const modifications = revision.modifications ?? [];
  const hasModifications = modifications.length > 0;
  
  // Smart collapse: expand if <= 3 fields, collapse if more
  const shouldAutoExpand = modifications.length <= 3;
  const [showAllFields, setShowAllFields] = useState(shouldAutoExpand);

  const isResolved = revision.status !== 'pending';

  // Determine what fields to show
  const visibleModifications = useMemo(() => {
    if (showAllFields || modifications.length <= 3) {
      return modifications;
    }
    return modifications.slice(0, 3);
  }, [modifications, showAllFields]);

  const handleFieldToggle = (fieldName: string) => {
    if (isResolved) return;
    
    setSelectedFields(prev => {
      const next = new Set(prev);
      if (next.has(fieldName)) {
        next.delete(fieldName);
      } else {
        next.add(fieldName);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (isResolved) return;
    setSelectedFields(new Set(modifications.map(m => m.field)));
  };

  const handleDeselectAll = () => {
    if (isResolved) return;
    setSelectedFields(new Set());
  };

  const handleAccept = async () => {
    if (isResolving || isResolved) return;
    
    setIsResolving(true);
    try {
      const acceptedFields = Array.from(selectedFields);
      const rejectedFields = modifications
        .map(m => m.field)
        .filter(f => !selectedFields.has(f));
      
      await onResolve(revision.id, acceptedFields, rejectedFields);
      onChangesetUpdated?.();
    } finally {
      setIsResolving(false);
    }
  };

  const handleDenyAll = async () => {
    if (isResolving || isResolved) return;
    
    setIsResolving(true);
    try {
      const allFields = modifications.map(m => m.field);
      await onResolve(revision.id, [], allFields);
      onChangesetUpdated?.();
    } finally {
      setIsResolving(false);
    }
  };

  // Render resolved state
  if (isResolved) {
    const statusConfig = {
      accepted: { icon: CheckCircleIcon, text: 'Accepted', color: 'text-green-600' },
      rejected: { icon: XCircleIcon, text: 'Rejected', color: 'text-red-600' },
      partial: { icon: CheckCircleIcon, text: 'Partially Accepted', color: 'text-amber-600' },
    };
    const status = statusConfig[revision.status as keyof typeof statusConfig];
    const StatusIcon = status?.icon ?? CheckCircleIcon;

    return (
      <div className={`rounded-xl border ${colorClasses.border} overflow-hidden opacity-75`}>
        {/* Header */}
        <div className={`px-4 py-3 ${colorClasses.headerBg} border-b ${colorClasses.border}`}>
          <div className="flex items-center gap-2">
            <SparklesIcon className="w-4 h-4 text-purple-500" />
            <span className="text-sm font-medium text-gray-700">AI Suggestion</span>
            <span className={`ml-auto flex items-center gap-1 text-xs font-medium ${status?.color ?? 'text-gray-600'}`}>
              <StatusIcon className="w-4 h-4" />
              {status?.text ?? revision.status}
            </span>
          </div>
        </div>
        
        {/* Collapsed summary */}
        <div className="px-4 py-3 bg-white">
          <p className="text-sm text-gray-500 line-clamp-2">
            {revision.justification || `${config.label} - ${revision.status}`}
          </p>
          {revision.resolved_at && (
            <p className="text-xs text-gray-400 mt-2">
              Resolved {formatTime(revision.resolved_at)}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border-2 ${colorClasses.border} overflow-hidden shadow-sm`}>
      {/* Header */}
      <div 
        className={`px-4 py-3 ${colorClasses.headerBg} border-b ${colorClasses.border} cursor-pointer`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-lg ${colorClasses.badge}`}>
            <Icon className={`w-4 h-4 ${colorClasses.icon}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <SparklesIcon className="w-4 h-4 text-purple-500" />
              <span className="text-sm font-semibold text-gray-800">AI {config.label}</span>
              {revision.confidence !== null && (
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colorClasses.badge}`}>
                  {Math.round(revision.confidence * 100)}% confident
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{formatTime(revision.created_at)}</p>
          </div>
          <button className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
            {isExpanded ? (
              <ChevronUpIcon className="w-5 h-5" />
            ) : (
              <ChevronDownIcon className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Expandable content */}
      {isExpanded && (
        <div className="bg-white">
          {/* Justification */}
          {revision.justification && (
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {revision.justification}
              </p>
            </div>
          )}

          {/* Modifications (for modify action) */}
          {revision.action === 'modify' && hasModifications && (
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Suggested Changes ({modifications.length})
                </h4>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSelectAll}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Select All
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={handleDeselectAll}
                    className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                  >
                    Deselect All
                  </button>
                  {modifications.length > 3 && (
                    <>
                      <span className="text-gray-300">|</span>
                      <button
                        onClick={() => setShowAllFields(!showAllFields)}
                        className="text-xs text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1"
                      >
                        {showAllFields ? 'Collapse' : `Show All (${modifications.length})`}
                        {showAllFields ? (
                          <ChevronUpIcon className="w-3 h-3" />
                        ) : (
                          <ChevronDownIcon className="w-3 h-3" />
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {visibleModifications.map((mod) => {
                  const isSelected = selectedFields.has(mod.field);
                  
                  return (
                    <div
                      key={mod.field}
                      onClick={() => handleFieldToggle(mod.field)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        isSelected 
                          ? 'border-blue-300 bg-blue-50/50 ring-1 ring-blue-200' 
                          : 'border-gray-200 bg-gray-50/50 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox */}
                        <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          isSelected 
                            ? 'bg-blue-500 border-blue-500' 
                            : 'border-gray-300 bg-white'
                        }`}>
                          {isSelected && <CheckIcon className="w-3 h-3 text-white" />}
                        </div>
                        
                        {/* Field content */}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                            {mod.field}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-gray-400 block mb-1">Current:</span>
                              <code className="block p-2 bg-red-50 text-red-700 rounded border border-red-100 break-all max-h-20 overflow-y-auto">
                                {formatValue(mod.old_value)}
                              </code>
                            </div>
                            <div>
                              <span className="text-gray-400 block mb-1">Suggested:</span>
                              <code className="block p-2 bg-green-50 text-green-700 rounded border border-green-100 break-all max-h-20 overflow-y-auto">
                                {formatValue(mod.new_value)}
                              </code>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                
                {!showAllFields && modifications.length > 3 && (
                  <button
                    onClick={() => setShowAllFields(true)}
                    className="w-full py-2 text-xs text-gray-500 hover:text-gray-700 font-medium text-center border border-dashed border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                  >
                    Show {modifications.length - 3} more fields...
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3">
            <div className="text-xs text-gray-500">
              {revision.action === 'modify' && hasModifications && (
                <span>{selectedFields.size} of {modifications.length} selected</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDenyAll}
                disabled={isResolving}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Deny All
              </button>
              <button
                onClick={handleAccept}
                disabled={isResolving || (revision.action === 'modify' && selectedFields.size === 0)}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                  revision.action === 'approve' ? 'bg-green-600 hover:bg-green-700' :
                  revision.action === 'reject' ? 'bg-red-600 hover:bg-red-700' :
                  revision.action === 'modify' ? 'bg-blue-600 hover:bg-blue-700' :
                  'bg-gray-600 hover:bg-gray-700'
                }`}
              >
                {isResolving && <LoadingSpinner size="sm" noPadding className="text-white" />}
                {revision.action === 'modify' 
                  ? `Accept Selected (${selectedFields.size})`
                  : revision.action === 'approve'
                  ? 'Approve All'
                  : revision.action === 'reject'
                  ? 'Reject All'
                  : 'Accept'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
