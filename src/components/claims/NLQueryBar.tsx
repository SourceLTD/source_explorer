'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpIcon } from '@heroicons/react/24/solid';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import type { ClaimsQueryFilter } from '@/lib/claims/query-schema';

interface NLQueryBarProps {
  onSubmit: (query: string) => Promise<void>;
  loading?: boolean;
  explanation?: string | null;
  filter?: ClaimsQueryFilter | null;
  disabled?: boolean;
}

function filterForDisplay(filter: ClaimsQueryFilter): Omit<ClaimsQueryFilter, 'explanation'> {
  const { explanation: _explanation, ...rest } = filter;
  return rest;
}

export default function NLQueryBar({
  onSubmit,
  loading = false,
  explanation,
  filter,
  disabled = false,
}: NLQueryBarProps) {
  const [query, setQuery] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [query, resizeTextarea]);

  useEffect(() => {
    if (filter) setShowFilter(false);
  }, [filter]);

  const submit = async () => {
    const trimmed = query.trim();
    if (!trimmed || loading || disabled) return;
    await onSubmit(trimmed);
    setQuery('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  const displayFilter = filter ? filterForDisplay(filter) : null;
  const filterJson = displayFilter ? JSON.stringify(displayFilter, null, 2) : null;

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-4">
      <div className="mx-auto max-w-3xl">
        {explanation && (
          <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5">
            <p className="text-sm text-gray-700">{explanation}</p>
            {filter && (
              <button
                type="button"
                onClick={() => setShowFilter((v) => !v)}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
              >
                {showFilter ? (
                  <>
                    <ChevronUpIcon className="h-3.5 w-3.5" />
                    Hide generated query
                  </>
                ) : (
                  <>
                    <ChevronDownIcon className="h-3.5 w-3.5" />
                    Show generated query
                  </>
                )}
              </button>
            )}
            {showFilter && filterJson && (
              <pre className="mt-2 overflow-x-auto rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs text-gray-800 font-mono leading-relaxed">
                {filterJson}
              </pre>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="flex items-end gap-2 rounded-2xl border border-gray-300 bg-gray-50 px-4 py-3 shadow-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
            <textarea
              ref={textareaRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='Ask about this graph… e.g. "Find all Person instances employed by Acme"'
              disabled={loading || disabled}
              rows={2}
              className="flex-1 resize-none bg-transparent px-1 py-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none disabled:opacity-50 min-h-[56px] max-h-[160px]"
            />
            <button
              type="submit"
              disabled={loading || disabled || !query.trim()}
              className="mb-0.5 flex-shrink-0 rounded-xl bg-blue-600 p-2 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Search"
            >
              <ArrowUpIcon className="h-4 w-4" />
            </button>
          </div>
        </form>

        <p className="mt-2 text-center text-xs text-gray-400">
          {loading ? 'Searching…' : 'Enter to search · Shift+Enter for new line'}
        </p>
      </div>
    </div>
  );
}
