'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  XMarkIcon,
  ClockIcon,
  ChatBubbleLeftIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';
import type { RevisionChain, RevisionHistoryEntry } from '@/lib/version-control/types';

interface RevisionHistoryProps {
  changesetId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function RevisionHistory({ changesetId, isOpen, onClose }: RevisionHistoryProps) {
  const [chain, setChain] = useState<RevisionChain | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/changesets/${changesetId}/history`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to fetch history (${response.status})`);
      }
      const data: RevisionChain = await response.json();
      setChain(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch revision history');
    } finally {
      setLoading(false);
    }
  }, [changesetId]);

  useEffect(() => {
    if (isOpen) fetchHistory();
  }, [isOpen, fetchHistory]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden max-h-[80vh] flex flex-col">
        <header className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2">
            <ClockIcon className="w-5 h-5 text-gray-600" />
            <h2 className="text-base font-semibold text-gray-900">Revision History</h2>
            {chain && (
              <span className="text-xs text-gray-500">
                ({chain.total_revisions} version{chain.total_revisions === 1 ? '' : 's'})
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner size="md" noPadding />
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {chain && !loading && (
            <div className="relative">
              <div className="absolute left-3 top-4 bottom-4 w-px bg-gray-200" />
              <ul className="space-y-4 relative">
                {chain.entries.map((entry, idx) => (
                  <RevisionEntryItem
                    key={entry.id}
                    entry={entry}
                    isLatest={idx === chain.entries.length - 1}
                    isCurrent={entry.id === chain.current_id}
                    isExpanded={expandedEntry === entry.id}
                    onToggle={() =>
                      setExpandedEntry((prev) => (prev === entry.id ? null : entry.id))
                    }
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface RevisionEntryItemProps {
  entry: RevisionHistoryEntry;
  isLatest: boolean;
  isCurrent: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

function RevisionEntryItem({
  entry,
  isLatest,
  isCurrent,
  isExpanded,
  onToggle,
}: RevisionEntryItemProps) {
  const statusIcon = entry.status === 'discarded' ? (
    <XCircleIcon className="w-3.5 h-3.5 text-gray-400" />
  ) : entry.status === 'committed' ? (
    <CheckCircleIcon className="w-3.5 h-3.5 text-green-500" />
  ) : null;

  return (
    <li className="relative pl-8">
      <div
        className={`absolute left-1.5 top-2.5 w-3 h-3 rounded-full border-2 ${
          isLatest
            ? 'bg-indigo-500 border-indigo-500'
            : entry.status === 'discarded'
            ? 'bg-gray-200 border-gray-300'
            : 'bg-white border-gray-300'
        }`}
      />

      <button
        type="button"
        onClick={onToggle}
        className={`w-full text-left rounded-lg border p-3 transition-colors ${
          isCurrent
            ? 'border-indigo-200 bg-indigo-50'
            : entry.status === 'discarded'
            ? 'border-gray-200 bg-gray-50 opacity-60'
            : 'border-gray-200 bg-white hover:bg-gray-50'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-bold text-gray-700">
              Rev {entry.revision_number}
            </span>
            {statusIcon}
            {isLatest && (
              <span className="text-[10px] font-medium text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded">
                Latest
              </span>
            )}
            {isCurrent && !isLatest && (
              <span className="text-[10px] font-medium text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                Viewing
              </span>
            )}
          </div>
          <span className="text-[10px] text-gray-400 shrink-0">
            {new Date(entry.created_at).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        {entry.revision_prompt && (
          <div className="mt-2 flex items-start gap-1.5">
            <ChatBubbleLeftIcon className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
            <p className="text-xs text-gray-600 line-clamp-2">
              {entry.revision_prompt}
            </p>
          </div>
        )}

        <div className="mt-1 text-[10px] text-gray-400">
          {entry.field_changes.length} field change{entry.field_changes.length === 1 ? '' : 's'}
          {' · '}by {entry.created_by}
        </div>
      </button>

      {isExpanded && (
        <div className="mt-2 ml-2 border border-gray-200 rounded-lg overflow-hidden">
          <ul className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
            {entry.field_changes.map((fc, i) => (
              <li key={i} className="px-3 py-2 text-xs">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-blue-600 shrink-0">
                    {fc.field_name}
                  </span>
                  <span className={`text-[10px] px-1 py-0.5 rounded ${
                    fc.status === 'approved'
                      ? 'bg-green-100 text-green-700'
                      : fc.status === 'rejected'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {fc.status}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-gray-400 line-through truncate">
                    {formatValue(fc.old_value)}
                  </span>
                  <span className="text-gray-300 shrink-0">→</span>
                  <span className="text-gray-900 font-medium truncate">
                    {formatValue(fc.new_value)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value.length > 60 ? value.slice(0, 60) + '...' : value;
  if (Array.isArray(value)) return value.length === 0 ? '[]' : `[${value.length} items]`;
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 60);
  return String(value);
}
