'use client';

import React, { useEffect, useRef, useState } from 'react';
import LoadingSpinner from '../LoadingSpinner';

const INPUT_CLASS =
  'w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500';

// ---------------------------------------------------------------------------
// Text filter
// ---------------------------------------------------------------------------

export function TextFilterField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={INPUT_CLASS}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multi-select chip group (e.g. entity types, operations)
// ---------------------------------------------------------------------------

export interface ChipOption {
  value: string;
  label: string;
}

export function ToggleChipGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: ChipOption[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.length === 0 ? (
          <span className="text-sm text-gray-400 italic">None available</span>
        ) : (
          options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onToggle(opt.value)}
              className={`px-3 py-1 text-sm font-medium rounded-xl transition-colors cursor-pointer ${
                selected.includes(opt.value)
                  ? 'bg-blue-100 text-blue-600 border border-blue-200'
                  : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tri-state Yes/No toggle (true / false / unset)
// ---------------------------------------------------------------------------

type ToggleColor = 'blue' | 'orange' | 'green' | 'amber' | 'red' | 'emerald';

const COLOR_CLASSES: Record<ToggleColor, string> = {
  blue: 'bg-blue-100 text-blue-600 border border-blue-200',
  orange: 'bg-orange-100 text-orange-800 border border-orange-200',
  green: 'bg-green-100 text-green-800 border border-green-200',
  amber: 'bg-amber-100 text-amber-800 border border-amber-200',
  red: 'bg-red-100 text-red-800 border border-red-200',
  emerald: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
};

const INACTIVE_CLASS = 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200';

export function TriStateToggle({
  label,
  value,
  onChange,
  trueLabel = 'Yes',
  falseLabel = 'No',
  color = 'blue',
}: {
  label: string;
  value: boolean | undefined;
  onChange: (value: boolean | undefined) => void;
  trueLabel?: string;
  falseLabel?: string;
  color?: ToggleColor;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      <div className="flex gap-2">
        <button
          onClick={() => onChange(value === true ? undefined : true)}
          className={`px-3 py-1 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
            value === true ? COLOR_CLASSES[color] : INACTIVE_CLASS
          }`}
        >
          {trueLabel}
        </button>
        <button
          onClick={() => onChange(value === false ? undefined : false)}
          className={`px-3 py-1 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
            value === false ? COLOR_CLASSES[color] : INACTIVE_CLASS
          }`}
        >
          {falseLabel}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Searchable multi-select dropdown (e.g. jobs, lexfiles, concepts)
// ---------------------------------------------------------------------------

export interface SelectOption {
  id: string;
  /** Primary line. May be a node for rich rendering. */
  label: React.ReactNode;
  /** Secondary muted line. */
  sublabel?: React.ReactNode;
}

export function SearchableMultiSelect({
  label,
  options,
  selected,
  onToggle,
  searchQuery,
  onSearchQueryChange,
  placeholder = 'Search...',
  loading = false,
  emptyText = 'No matches',
  noun = 'item',
  helpText,
}: {
  label: string;
  options: SelectOption[];
  selected: string[];
  onToggle: (id: string) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  placeholder?: string;
  loading?: boolean;
  emptyText?: string;
  /** Singular noun used in the "N items selected" summary. */
  noun?: string;
  helpText?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={`${INPUT_CLASS} mb-2`}
      />
      {open && (
        <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-xl bg-white">
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <LoadingSpinner size="sm" noPadding />
            </div>
          ) : options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">{emptyText}</div>
          ) : (
            options.map((opt) => (
              <label
                key={opt.id}
                className="flex items-start px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt.id)}
                  onChange={() => onToggle(opt.id)}
                  className="mt-0.5 mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{opt.label}</div>
                  {opt.sublabel !== undefined && (
                    <div className="text-xs text-gray-500 font-mono truncate">{opt.sublabel}</div>
                  )}
                </div>
              </label>
            ))
          )}
        </div>
      )}
      {selected.length > 0 && (
        <div className="mt-2 text-xs text-gray-600">
          {selected.length} {noun}
          {selected.length !== 1 ? 's' : ''} selected
        </div>
      )}
      {helpText && <p className="mt-1 text-xs text-gray-500">{helpText}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date range
// ---------------------------------------------------------------------------

export function DateRangeField({
  label,
  after,
  before,
  onAfterChange,
  onBeforeChange,
}: {
  label: string;
  after: string;
  before: string;
  onAfterChange: (value: string) => void;
  onBeforeChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="space-y-2">
        <input
          type="date"
          value={after}
          onChange={(e) => onAfterChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
          placeholder="After"
        />
        <input
          type="date"
          value={before}
          onChange={(e) => onBeforeChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
          placeholder="Before"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Numeric range
// ---------------------------------------------------------------------------

export function NumericRangeField({
  label,
  min,
  max,
  onMinChange,
  onMaxChange,
}: {
  label: string;
  min: number | undefined;
  max: number | undefined;
  onMinChange: (value: number | undefined) => void;
  onMaxChange: (value: number | undefined) => void;
}) {
  const parse = (raw: string) => (raw ? parseInt(raw, 10) : undefined);
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          type="number"
          value={min ?? ''}
          onChange={(e) => onMinChange(parse(e.target.value))}
          placeholder="Min"
          min="0"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
        />
        <input
          type="number"
          value={max ?? ''}
          onChange={(e) => onMaxChange(parse(e.target.value))}
          placeholder="Max"
          min="0"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
        />
      </div>
    </div>
  );
}
