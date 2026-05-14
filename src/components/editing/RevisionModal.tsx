'use client';

import React, { useState, useCallback } from 'react';
import { XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';

interface RevisionModalProps {
  changesetId: string;
  entitySummary: string;
  isOpen: boolean;
  onClose: () => void;
  onRevisionComplete: (newChangesetId: string) => void;
}

interface RevisionResponse {
  new_changeset_id: string;
  revision_number: number;
  reasoning: string;
  field_changes: Array<{
    field_name: string;
    old_value: unknown;
    new_value: unknown;
  }>;
}

export function RevisionModal({
  changesetId,
  entitySummary,
  isOpen,
  onClose,
  onRevisionComplete,
}: RevisionModalProps) {
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RevisionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`/api/changesets/${changesetId}/revise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_prompt: prompt.trim() }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Revision failed (${response.status})`);
      }

      const data: RevisionResponse = await response.json();
      setResult(data);
      onRevisionComplete(data.new_changeset_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create revision');
    } finally {
      setSubmitting(false);
    }
  }, [changesetId, prompt, submitting, onRevisionComplete]);

  const handleReset = () => {
    setPrompt('');
    setResult(null);
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
        <header className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <ArrowPathIcon className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-semibold text-gray-900">Revise Changeset</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </header>

        <div className="px-5 py-4 space-y-4">
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">
              Changeset #{changesetId}
            </p>
            <p className="text-sm text-gray-800">{entitySummary}</p>
          </div>

          {result ? (
            <div className="space-y-3">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm font-medium text-green-800 mb-1">
                  Revision #{result.revision_number} created
                </p>
                <p className="text-xs text-green-700">{result.reasoning}</p>
              </div>

              {result.field_changes.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                    <p className="text-xs font-medium text-gray-600">
                      Revised field changes ({result.field_changes.length})
                    </p>
                  </div>
                  <ul className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
                    {result.field_changes.map((fc, i) => (
                      <li key={i} className="px-3 py-2 text-xs flex items-baseline gap-2">
                        <span className="font-mono text-blue-600 shrink-0">
                          {fc.field_name}
                        </span>
                        <span className="text-gray-300 shrink-0">=</span>
                        <span className="text-gray-900 font-medium truncate flex-1">
                          {formatValue(fc.new_value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex-1 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Revise Again
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  How should this change be revised?
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder='e.g. "Make the definition more concise", "Change the parent frame to MOTION", "Add an example sentence"...'
                  rows={4}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                  disabled={submitting}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  Cmd+Enter to submit
                </p>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!prompt.trim() || submitting}
                className={`w-full py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  prompt.trim() && !submitting
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <LoadingSpinner size="sm" noPadding />
                    Revising...
                  </span>
                ) : (
                  'Submit Revision'
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value.length > 80 ? value.slice(0, 80) + '...' : value;
  if (Array.isArray(value)) return value.length === 0 ? '[]' : `[${value.length} items]`;
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 80);
  return String(value);
}
