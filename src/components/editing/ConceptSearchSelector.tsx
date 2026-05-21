'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';
import { FieldEditorProps, ConceptOption } from './types';

interface ConceptSearchSelectorProps extends FieldEditorProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * Max results returned by the concepts endpoint per query.
   * Keep small-ish; users should type to refine.
   */
  limit?: number;
  placeholder?: string;
}

function renderConceptDisplay(concept: ConceptOption) {
  const displayValue = concept.code?.trim() || concept.label;
  const dotIndex = displayValue.indexOf('.');
  if (dotIndex !== -1) {
    return (
      <>
        {displayValue.substring(0, dotIndex + 1)}
        <span className="font-bold">{displayValue.substring(dotIndex + 1)}</span>
      </>
    );
  }
  return displayValue;
}

export function ConceptSearchSelector({
  value,
  onChange,
  onSave,
  onCancel,
  isSaving,
  limit = 100,
  placeholder = 'Search concepts by id, code, or label...'
}: ConceptSearchSelectorProps) {
  const [concepts, setConcepts] = useState<ConceptOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<ConceptOption | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastQueryRef = useRef<string>('');

  const isNumericId = (v: string) => /^\d+$/.test(v.trim());

  const fetchConcepts = async (searchQuery: string) => {
    setIsLoading(true);
    try {
      const queryParams = new URLSearchParams();

      const trimmed = searchQuery.trim();
      if (trimmed) {
        queryParams.set('search', trimmed);
      } else if (value && isNumericId(value)) {
        queryParams.set('ids', value);
      }

      queryParams.set('limit', String(limit));
      const response = await fetch(`/api/concepts?${queryParams.toString()}`, { cache: 'no-store' });
      if (!response.ok) {
        setConcepts([]);
        return;
      }
      const data: ConceptOption[] = await response.json();
      setConcepts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch concepts:', error);
      setConcepts([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch concepts when opened, when query changes, or when value changes (to keep selected resolvable).
  useEffect(() => {
    if (!isOpen && !value) return;

    const timeoutId = setTimeout(() => {
      const nextQuery = query;
      if (isOpen || value) {
        lastQueryRef.current = nextQuery;
        void fetchConcepts(nextQuery);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [isOpen, query, value, limit]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Keep a stable selected concept display even when the search results change.
  useEffect(() => {
    if (!value) {
      setSelectedConcept(null);
      return;
    }

    const inList = concepts.find(f => f.id === value) ?? null;
    if (inList) {
      setSelectedConcept(inList);
      return;
    }

    // If we don't have it loaded, fetch just the selected concept.
    if (isNumericId(value)) {
      void (async () => {
        try {
          const params = new URLSearchParams();
          params.set('ids', value);
          params.set('limit', '5');
          const resp = await fetch(`/api/concepts?${params.toString()}`, { cache: 'no-store' });
          if (!resp.ok) return;
          const data: ConceptOption[] = await resp.json();
          const match = Array.isArray(data) ? data.find(f => f.id === value) ?? null : null;
          if (match) setSelectedConcept(match);
        } catch (error) {
          console.error('Failed to resolve selected concept:', error);
        }
      })();
    }
  }, [value, concepts]);

  const noneSelected = value === '';

  const selectionSummary = useMemo(() => {
    if (noneSelected) return null;
    if (!selectedConcept) return value;
    const display = selectedConcept.code?.trim() || selectedConcept.label;
    return `${display} (#${selectedConcept.id})`;
  }, [noneSelected, selectedConcept, value]);

  return (
    <div className="space-y-2">
      <div className="relative" ref={containerRef}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          disabled={isSaving}
          className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
        />

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto border border-gray-300 rounded-xl bg-white shadow-sm">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <LoadingSpinner size="sm" noPadding />
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setQuery('');
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-gray-900">None</div>
                    {noneSelected && <span className="text-xs text-blue-600 font-medium">Selected</span>}
                  </div>
                </button>

                {concepts.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500">No concepts found</div>
                ) : (
                  concepts.map((concept) => {
                    const isSelected = concept.id === value;
                    return (
                      <button
                        key={concept.id}
                        type="button"
                        onClick={() => {
                          onChange(concept.id);
                          setQuery('');
                          setIsOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {renderConceptDisplay(concept)}
                            </div>
                            <div className="text-xs text-gray-500 font-mono truncate">
                              {concept.id}{concept.code ? ` · ${concept.label}` : ''}
                            </div>
                          </div>
                          {isSelected && <span className="text-xs text-blue-600 font-medium">Selected</span>}
                        </div>
                      </button>
                    );
                  })
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="text-xs text-gray-600">
        {noneSelected ? (
          <span className="text-gray-500">No concept selected</span>
        ) : (
          <>
            Selected: <span className="font-medium text-gray-900">{selectionSummary}</span>
          </>
        )}
      </div>

      <div className="flex space-x-2">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

