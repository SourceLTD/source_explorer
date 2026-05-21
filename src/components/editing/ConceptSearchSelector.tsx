'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';
import { FieldEditorProps, FrameOption } from './types';

interface FrameSearchSelectorProps extends FieldEditorProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * Max results returned by the frames endpoint per query.
   * Keep small-ish; users should type to refine.
   */
  limit?: number;
  placeholder?: string;
}

function renderFrameDisplay(frame: FrameOption) {
  const displayValue = frame.code?.trim() || frame.label;
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

export function FrameSearchSelector({
  value,
  onChange,
  onSave,
  onCancel,
  isSaving,
  limit = 100,
  placeholder = 'Search frames by id, code, or label...'
}: FrameSearchSelectorProps) {
  const [frames, setFrames] = useState<FrameOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState<FrameOption | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastQueryRef = useRef<string>('');

  const isNumericId = (v: string) => /^\d+$/.test(v.trim());

  const fetchFrames = async (searchQuery: string) => {
    setIsLoading(true);
    try {
      const queryParams = new URLSearchParams();

      const trimmed = searchQuery.trim();
      if (trimmed) {
        queryParams.set('search', trimmed);
      } else if (value && isNumericId(value)) {
        // When no search term, prefer showing the currently selected frame
        // (mimics the lexical-units FilterPanel "Frame ID" UX).
        queryParams.set('ids', value);
      }

      queryParams.set('limit', String(limit));
      const response = await fetch(`/api/frames?${queryParams.toString()}`, { cache: 'no-store' });
      if (!response.ok) {
        setFrames([]);
        return;
      }
      const data: FrameOption[] = await response.json();
      setFrames(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch frames:', error);
      setFrames([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch frames when opened, when query changes, or when value changes (to keep selected resolvable).
  useEffect(() => {
    if (!isOpen && !value) return;

    const timeoutId = setTimeout(() => {
      // Avoid refetching the same query repeatedly when only focus changes.
      const nextQuery = query;
      if (isOpen || value) {
        lastQueryRef.current = nextQuery;
        void fetchFrames(nextQuery);
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

  // Keep a stable selected frame display even when the search results change.
  useEffect(() => {
    if (!value) {
      setSelectedFrame(null);
      return;
    }

    const inList = frames.find(f => f.id === value) ?? null;
    if (inList) {
      setSelectedFrame(inList);
      return;
    }

    // If we don't have it loaded, fetch just the selected frame.
    if (isNumericId(value)) {
      void (async () => {
        try {
          const params = new URLSearchParams();
          params.set('ids', value);
          params.set('limit', '5');
          const resp = await fetch(`/api/frames?${params.toString()}`, { cache: 'no-store' });
          if (!resp.ok) return;
          const data: FrameOption[] = await resp.json();
          const match = Array.isArray(data) ? data.find(f => f.id === value) ?? null : null;
          if (match) setSelectedFrame(match);
        } catch (error) {
          console.error('Failed to resolve selected frame:', error);
        }
      })();
    }
  }, [value, frames]);

  const noneSelected = value === '';

  const selectionSummary = useMemo(() => {
    if (noneSelected) return null;
    if (!selectedFrame) return value;
    const display = selectedFrame.code?.trim() || selectedFrame.label;
    return `${display} (#${selectedFrame.id})`;
  }, [noneSelected, selectedFrame, value]);

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

                {frames.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500">No frames found</div>
                ) : (
                  frames.map((frame) => {
                    const isSelected = frame.id === value;
                    return (
                      <button
                        key={frame.id}
                        type="button"
                        onClick={() => {
                          onChange(frame.id);
                          setQuery('');
                          setIsOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {renderFrameDisplay(frame)}
                            </div>
                            <div className="text-xs text-gray-500 font-mono truncate">
                              {frame.id}{frame.code ? ` · ${frame.label}` : ''}
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
          <span className="text-gray-500">No frame selected</span>
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

