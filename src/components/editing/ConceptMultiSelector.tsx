'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { FieldEditorProps, FrameOption } from './types';

interface FrameMultiSelectorProps extends FieldEditorProps {
  value: string[];
  onChange: (value: string[]) => void;
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

export function FrameMultiSelector({
  value,
  onChange,
  onSave,
  onCancel,
  isSaving,
  limit = 100,
  placeholder = 'Search frames by id, code, or label...'
}: FrameMultiSelectorProps) {
  const [frames, setFrames] = useState<FrameOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFrames, setSelectedFrames] = useState<FrameOption[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const isNumericId = (v: string) => /^\d+$/.test(v.trim());

  const fetchFrames = async (searchQuery: string) => {
    setIsLoading(true);
    try {
      const queryParams = new URLSearchParams();
      const trimmed = searchQuery.trim();
      if (trimmed) {
        queryParams.set('search', trimmed);
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

  useEffect(() => {
    if (!isOpen) return;
    const timeoutId = setTimeout(() => {
      void fetchFrames(query);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [isOpen, query, limit]);

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

  useEffect(() => {
    if (value.length === 0) {
      setSelectedFrames([]);
      return;
    }

    const missingIds = value.filter(id => !selectedFrames.some(f => f.id === id));
    if (missingIds.length === 0) return;

    void (async () => {
      try {
        const params = new URLSearchParams();
        params.set('ids', missingIds.join(','));
        params.set('limit', String(missingIds.length + 5));
        const resp = await fetch(`/api/frames?${params.toString()}`, { cache: 'no-store' });
        if (!resp.ok) return;
        const data: FrameOption[] = await resp.json();
        if (Array.isArray(data)) {
          setSelectedFrames(prev => {
            const existing = new Set(prev.map(f => f.id));
            const newFrames = data.filter(f => !existing.has(f.id));
            return [...prev, ...newFrames];
          });
        }
      } catch (error) {
        console.error('Failed to resolve selected frames:', error);
      }
    })();
  }, [value]);

  const handleAddFrame = (frame: FrameOption) => {
    if (!value.includes(frame.id)) {
      onChange([...value, frame.id]);
      setSelectedFrames(prev => [...prev, frame]);
    }
    setQuery('');
    setIsOpen(false);
  };

  const handleRemoveFrame = (frameId: string) => {
    onChange(value.filter(id => id !== frameId));
    setSelectedFrames(prev => prev.filter(f => f.id !== frameId));
  };

  const displayedSelectedFrames = useMemo(() => {
    return value.map(id => selectedFrames.find(f => f.id === id)).filter(Boolean) as FrameOption[];
  }, [value, selectedFrames]);

  const availableFrames = useMemo(() => {
    return frames.filter(f => !value.includes(f.id));
  }, [frames, value]);

  return (
    <div className="space-y-2">
      {displayedSelectedFrames.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {displayedSelectedFrames.map(frame => (
            <span
              key={frame.id}
              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-sm"
            >
              {renderFrameDisplay(frame)}
              <button
                type="button"
                onClick={() => handleRemoveFrame(frame.id)}
                className="p-0.5 hover:bg-blue-100 rounded cursor-pointer"
                disabled={isSaving}
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

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
            ) : availableFrames.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">
                {query ? 'No frames found' : 'Type to search frames'}
              </div>
            ) : (
              availableFrames.map((frame) => (
                <button
                  key={frame.id}
                  type="button"
                  onClick={() => handleAddFrame(frame)}
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
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="text-xs text-gray-600">
        {value.length === 0 ? (
          <span className="text-gray-500">No frames selected</span>
        ) : (
          <span>{value.length} frame{value.length !== 1 ? 's' : ''} selected</span>
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
