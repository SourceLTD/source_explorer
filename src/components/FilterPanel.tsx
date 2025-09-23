'use client';

import React, { useState } from 'react';
import { 
  FunnelIcon, 
  XMarkIcon, 
  ChevronDownIcon, 
  MagnifyingGlassIcon,
  CalendarIcon,
  HashtagIcon,
  CheckIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';
import { POS_LABELS } from '@/lib/types';

export interface FilterState {
  // Text filters
  gloss?: string;
  lemmas?: string;
  examples?: string;
  particles?: string;
  frames?: string;
  
  // Categorical filters
  pos?: string;
  lexfile?: string;
  
  // Boolean filters
  isMwe?: boolean;
  transitive?: boolean;
  
  // Numeric filters
  parentsCountMin?: number;
  parentsCountMax?: number;
  childrenCountMin?: number;
  childrenCountMax?: number;
  
  // Date filters
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
}

interface FilterPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onClearAll: () => void;
  className?: string;
}

interface FilterSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}

function FilterSection({ title, icon, children, isOpen, onToggle }: FilterSectionProps) {
  return (
    <div className="border-b border-gray-200 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-gray-900">{title}</span>
        </div>
        <ChevronDownIcon 
          className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>
      {isOpen && (
        <div className="px-6 pb-6 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

export default function FilterPanel({ 
  isOpen, 
  onToggle, 
  filters, 
  onFiltersChange, 
  onClearAll,
  className 
}: FilterPanelProps) {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['text']));
  
  const toggleSection = (section: string) => {
    setOpenSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  const updateFilter = (key: keyof FilterState, value: string | number | boolean | undefined) => {
    onFiltersChange({
      ...filters,
      [key]: value === '' ? undefined : value
    });
  };

  const hasActiveFilters = Object.values(filters).some(value => 
    value !== undefined && value !== ''
  );

  const activeFilterCount = Object.values(filters).filter(value => 
    value !== undefined && value !== ''
  ).length;

  // Known lexfile values from the seed data
  const lexfileOptions = [
    'verb.stative',
    'verb.possession', 
    'verb.communication',
    'verb.creation',
    'verb.body',
    'verb.perception',
    'noun.artifact',
    'noun.person',
    'noun.animal',
    'adj.all',
    'adv.all'
  ];

  return (
    <>
      {/* Filter Toggle Button */}
      <button
        onClick={onToggle}
        className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
          hasActiveFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white text-gray-700'
        }`}
      >
        <FunnelIcon className="w-4 h-4" />
        <span>Filters</span>
        {activeFilterCount > 0 && (
          <span className="bg-blue-600 text-white text-xs rounded-full px-2 py-0.5 min-w-[1.25rem] text-center">
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Filter Panel */}
      {isOpen && (
        <div className={`absolute top-full left-0 mt-2 w-[32rem] bg-white border border-gray-200 rounded-lg shadow-lg z-50 ${className || ''}`}>
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FunnelIcon className="w-5 h-5 text-gray-600" />
              <h3 className="font-semibold text-gray-900">Filters</h3>
            </div>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <button
                  onClick={onClearAll}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Clear all
                </button>
              )}
              <button
                onClick={onToggle}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Filter Sections */}
          <div className="max-h-[32rem] overflow-y-auto">
            {/* Text Filters */}
            <FilterSection
              title="Text Search"
              icon={<MagnifyingGlassIcon className="w-4 h-4 text-gray-600" />}
              isOpen={openSections.has('text')}
              onToggle={() => toggleSection('text')}
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Definition</label>
                <input
                  type="text"
                  value={filters.gloss || ''}
                  onChange={(e) => updateFilter('gloss', e.target.value)}
                  placeholder="Search in definitions..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lemmas</label>
                <input
                  type="text"
                  value={filters.lemmas || ''}
                  onChange={(e) => updateFilter('lemmas', e.target.value)}
                  placeholder="Search in lemmas..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Examples</label>
                <input
                  type="text"
                  value={filters.examples || ''}
                  onChange={(e) => updateFilter('examples', e.target.value)}
                  placeholder="Search in examples..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Particles</label>
                <input
                  type="text"
                  value={filters.particles || ''}
                  onChange={(e) => updateFilter('particles', e.target.value)}
                  placeholder="Search in particles..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Frames</label>
                <input
                  type="text"
                  value={filters.frames || ''}
                  onChange={(e) => updateFilter('frames', e.target.value)}
                  placeholder="Search in frames..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                />
              </div>
            </FilterSection>

            {/* Category Filters */}
            <FilterSection
              title="Categories"
              icon={<HashtagIcon className="w-4 h-4 text-gray-600" />}
              isOpen={openSections.has('categories')}
              onToggle={() => toggleSection('categories')}
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Part of Speech</label>
                <select
                  value={filters.pos || ''}
                  onChange={(e) => updateFilter('pos', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                >
                  <option value="">All</option>
                  {Object.entries(POS_LABELS).map(([pos, label]) => (
                    <option key={pos} value={pos}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lexical File</label>
                <select
                  value={filters.lexfile || ''}
                  onChange={(e) => updateFilter('lexfile', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                >
                  <option value="">All</option>
                  {lexfileOptions.map((lexfile) => (
                    <option key={lexfile} value={lexfile}>{lexfile}</option>
                  ))}
                </select>
              </div>
            </FilterSection>

            {/* Boolean Filters */}
            <FilterSection
              title="Properties"
              icon={<CheckIcon className="w-4 h-4 text-gray-600" />}
              isOpen={openSections.has('properties')}
              onToggle={() => toggleSection('properties')}
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Multi-word Expression</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateFilter('isMwe', filters.isMwe === true ? undefined : true)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      filters.isMwe === true 
                        ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                        : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => updateFilter('isMwe', filters.isMwe === false ? undefined : false)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      filters.isMwe === false 
                        ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                        : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Transitive</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateFilter('transitive', filters.transitive === true ? undefined : true)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      filters.transitive === true 
                        ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                        : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => updateFilter('transitive', filters.transitive === false ? undefined : false)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      filters.transitive === false 
                        ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                        : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>
            </FilterSection>

            {/* Numeric Filters */}
            <FilterSection
              title="Relationships"
              icon={<HashtagIcon className="w-4 h-4 text-gray-600" />}
              isOpen={openSections.has('relationships')}
              onToggle={() => toggleSection('relationships')}
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parent Count</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={filters.parentsCountMin || ''}
                    onChange={(e) => updateFilter('parentsCountMin', e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="Min"
                    min="0"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                  />
                  <input
                    type="number"
                    value={filters.parentsCountMax || ''}
                    onChange={(e) => updateFilter('parentsCountMax', e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="Max"
                    min="0"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Children Count</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={filters.childrenCountMin || ''}
                    onChange={(e) => updateFilter('childrenCountMin', e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="Min"
                    min="0"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                  />
                  <input
                    type="number"
                    value={filters.childrenCountMax || ''}
                    onChange={(e) => updateFilter('childrenCountMax', e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="Max"
                    min="0"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                  />
                </div>
              </div>
            </FilterSection>

            {/* Date Filters */}
            <FilterSection
              title="Dates"
              icon={<CalendarIcon className="w-4 h-4 text-gray-600" />}
              isOpen={openSections.has('dates')}
              onToggle={() => toggleSection('dates')}
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Created</label>
                <div className="space-y-2">
                  <input
                    type="date"
                    value={filters.createdAfter || ''}
                    onChange={(e) => updateFilter('createdAfter', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                    placeholder="After"
                  />
                  <input
                    type="date"
                    value={filters.createdBefore || ''}
                    onChange={(e) => updateFilter('createdBefore', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                    placeholder="Before"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Updated</label>
                <div className="space-y-2">
                  <input
                    type="date"
                    value={filters.updatedAfter || ''}
                    onChange={(e) => updateFilter('updatedAfter', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                    placeholder="After"
                  />
                  <input
                    type="date"
                    value={filters.updatedBefore || ''}
                    onChange={(e) => updateFilter('updatedBefore', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                    placeholder="Before"
                  />
                </div>
              </div>
            </FilterSection>
          </div>

          {/* Active Filters Summary */}
          {hasActiveFilters && (
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
                </span>
                <button
                  onClick={onClearAll}
                  className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
                >
                  <XCircleIcon className="w-4 h-4" />
                  Clear all
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
