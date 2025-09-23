'use client';

import React, { useState, useCallback } from 'react';
import { FilterConfig, POS_LABELS } from '@/lib/types';

interface FilterValue {
  [key: string]: string | number | boolean | undefined;
}

interface AdvancedFilterProps {
  filters: FilterValue;
  onFiltersChange: (filters: FilterValue) => void;
  onReset: () => void;
  className?: string;
}

const FILTER_CONFIGS: FilterConfig[] = [
  {
    type: 'text',
    label: 'Search in Lemmas',
    field: 'lemmaContains',
    placeholder: 'Search lemmas...',
  },
  {
    type: 'text',
    label: 'Search in Definition',
    field: 'glossContains',
    placeholder: 'Search definitions...',
  },
  {
    type: 'select',
    label: 'Part of Speech',
    field: 'pos',
    options: [
      { value: '', label: 'All' },
      ...Object.entries(POS_LABELS).map(([value, label]) => ({ value, label })),
    ],
  },
  {
    type: 'text',
    label: 'Lexical File',
    field: 'lexfile',
    placeholder: 'Filter by lexfile...',
  },
  {
    type: 'boolean',
    label: 'Multi-Word Expression',
    field: 'isMwe',
  },
  {
    type: 'boolean',
    label: 'Transitive Verb',
    field: 'transitive',
  },
  {
    type: 'boolean',
    label: 'Has Particles',
    field: 'hasParticles',
  },
  {
    type: 'boolean',
    label: 'Has Frames',
    field: 'hasFrames',
  },
  {
    type: 'boolean',
    label: 'Has Examples',
    field: 'hasExamples',
  },
  {
    type: 'range',
    label: 'Parent Count',
    field: 'parentRange',
    min: 0,
    max: 50,
  },
  {
    type: 'range',
    label: 'Children Count',
    field: 'childrenRange',
    min: 0,
    max: 100,
  },
  {
    type: 'date',
    label: 'Created After',
    field: 'createdAfter',
  },
  {
    type: 'date',
    label: 'Created Before',
    field: 'createdBefore',
  },
];

export default function AdvancedFilter({ filters, onFiltersChange, onReset, className }: AdvancedFilterProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleFilterChange = useCallback((field: string, value: string | number | boolean | undefined | number[]) => {
    const newFilters = { ...filters };
    
    if (value === '' || value === null || value === undefined) {
      delete newFilters[field];
    } else {
      newFilters[field] = value;
    }

    // Handle special cases for range filters
    if (field === 'parentRange') {
      if (value && value.length === 2) {
        newFilters.minParents = value[0];
        newFilters.maxParents = value[1];
      } else {
        delete newFilters.minParents;
        delete newFilters.maxParents;
      }
      delete newFilters.parentRange;
    } else if (field === 'childrenRange') {
      if (value && value.length === 2) {
        newFilters.minChildren = value[0];
        newFilters.maxChildren = value[1];
      } else {
        delete newFilters.minChildren;
        delete newFilters.maxChildren;
      }
      delete newFilters.childrenRange;
    }

    onFiltersChange(newFilters);
  }, [filters, onFiltersChange]);

  const handleReset = useCallback(() => {
    onReset();
    setIsExpanded(false);
  }, [onReset]);

  const activeFilterCount = Object.keys(filters).filter(key => 
    !['page', 'limit', 'sortBy', 'sortOrder', 'search'].includes(key) && 
    filters[key] !== undefined && 
    filters[key] !== null && 
    filters[key] !== ''
  ).length;

  const renderFilterInput = (config: FilterConfig) => {
    const value = config.field === 'parentRange' 
      ? [filters.minParents || 0, filters.maxParents || config.max || 50]
      : config.field === 'childrenRange'
      ? [filters.minChildren || 0, filters.maxChildren || config.max || 100]
      : filters[config.field] || '';

    switch (config.type) {
      case 'text':
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleFilterChange(config.field, e.target.value)}
            placeholder={config.placeholder}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-400"
          />
        );

      case 'select':
        return (
          <select
            value={value}
            onChange={(e) => handleFilterChange(config.field, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
          >
            {config.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'boolean':
        return (
          <select
            value={value === undefined ? '' : value.toString()}
            onChange={(e) => {
              const val = e.target.value;
              handleFilterChange(
                config.field, 
                val === '' ? undefined : val === 'true'
              );
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
          >
            <option value="">All</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        );

      case 'date':
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => handleFilterChange(config.field, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
          />
        );

      case 'range':
        return (
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <input
                type="number"
                value={Array.isArray(value) ? value[0] : config.min || 0}
                onChange={(e) => {
                  const newValue = [
                    parseInt(e.target.value) || 0,
                    Array.isArray(value) ? value[1] : config.max || 50
                  ];
                  handleFilterChange(config.field, newValue);
                }}
                min={config.min}
                max={config.max}
                placeholder="Min"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
              />
              <span className="text-gray-400">to</span>
              <input
                type="number"
                value={Array.isArray(value) ? value[1] : config.max || 50}
                onChange={(e) => {
                  const newValue = [
                    Array.isArray(value) ? value[0] : config.min || 0,
                    parseInt(e.target.value) || 0
                  ];
                  handleFilterChange(config.field, newValue);
                }}
                min={config.min}
                max={config.max}
                placeholder="Max"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-sm ${className || ''}`}>
      {/* Filter Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 focus:outline-none"
          >
            <svg 
              className="w-5 h-5 text-blue-600" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.707A1 1 0 013 7V4z" 
              />
            </svg>
            <span className="font-medium">Advanced Filters</span>
            {activeFilterCount > 0 && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {activeFilterCount}
              </span>
            )}
          </button>
          <svg 
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {activeFilterCount > 0 && (
          <button
            onClick={handleReset}
            className="flex items-center space-x-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>Clear All</span>
          </button>
        )}
      </div>

      {/* Filter Content */}
      {isExpanded && (
        <div className="p-4 border-t border-gray-100 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {FILTER_CONFIGS.map((config) => (
              <div key={config.field} className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  {config.label}
                </label>
                {renderFilterInput(config)}
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-gray-200">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => handleFilterChange('isMwe', true)}
                className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 rounded-full hover:bg-blue-200 transition-colors"
              >
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Multi-word only
              </button>
              <button
                onClick={() => handleFilterChange('hasExamples', true)}
                className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-green-700 bg-green-100 rounded-full hover:bg-green-200 transition-colors"
              >
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                With examples
              </button>
              <button
                onClick={() => handleFilterChange('transitive', true)}
                className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-100 rounded-full hover:bg-purple-200 transition-colors"
              >
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Transitive verbs
              </button>
            </div>

            <div className="text-xs text-gray-500">
              {activeFilterCount === 0 ? 'No filters applied' : `${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'} applied`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}