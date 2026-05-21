'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  FunnelIcon, 
  XMarkIcon, 
  ChevronDownIcon, 
  MagnifyingGlassIcon,
  CalendarIcon,
  HashtagIcon,
  CheckIcon,
  XCircleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import LoadingSpinner from './LoadingSpinner';
import { SparklesIcon } from '@heroicons/react/24/outline';
import { POS_LABELS } from '@/lib/types';
import type { DataTableRenderMode } from './DataTable/types';
import type { FilterState } from './DataTable/filterState';

interface Concept {
  id: string;
  label: string;
  code?: string | null;
}

interface FilterPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onClearAll: () => void;
  className?: string;
  mode?: DataTableRenderMode;
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
        className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors cursor-pointer"
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
  className,
  mode = 'lexical_units'
}: FilterPanelProps) {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['categories']));
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [loadingConcepts, setLoadingConcepts] = useState(false);
  const [conceptSearchQuery, setConceptSearchQuery] = useState('');
  const [lexfileSearchQuery, setLexfileSearchQuery] = useState('');
  const [conceptDropdownOpen, setConceptDropdownOpen] = useState(false);
  const [lexfileDropdownOpen, setLexfileDropdownOpen] = useState(false);
  const [jobs, setJobs] = useState<Array<{ id: string; label: string | null; status: string; flagged_items: number; created_at: string }>>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobSearchQuery, setJobSearchQuery] = useState('');
  const [jobDropdownOpen, setJobDropdownOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const conceptDropdownContainerRef = useRef<HTMLDivElement>(null);
  const jobDropdownContainerRef = useRef<HTMLDivElement>(null);
  const isConceptsMode = mode === 'concepts';
  const isSensesMode = mode === 'senses';
  const canFilterByParentConceptId = mode === 'concepts';
  
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

  useEffect(() => {
    if (!canFilterByParentConceptId) return;
    if (!filters.parent_concept_id) return;
    setOpenSections(prev => {
      if (prev.has('hierarchy')) return prev;
      const next = new Set(prev);
      next.add('hierarchy');
      return next;
    });
  }, [canFilterByParentConceptId, filters.parent_concept_id]);

  useEffect(() => {
    if (!isConceptsMode) return;
    if (filters.childrenCountValue === undefined) return;
    setOpenSections(prev => {
      if (prev.has('relationships')) return prev;
      const next = new Set(prev);
      next.add('relationships');
      return next;
    });
  }, [isConceptsMode, filters.childrenCountValue]);

  useEffect(() => {
    const fetchConcepts = async () => {
      if (!conceptDropdownOpen && !filters.concept_id) return;

      setLoadingConcepts(true);
      try {
        const queryParams = new URLSearchParams();
        if (conceptSearchQuery) {
          queryParams.set('search', conceptSearchQuery);
        }
        
        if (filters.concept_id) {
          queryParams.set('ids', filters.concept_id);
        }
        
        queryParams.set('limit', '100');

        const response = await fetch(`/api/concepts?${queryParams.toString()}`);
        if (response.ok) {
          const data = await response.json();
          setConcepts(data);
        }
      } catch (error) {
        console.error('Error fetching concepts:', error);
      } finally {
        setLoadingConcepts(false);
      }
    };

    const debounceTimer = setTimeout(fetchConcepts, 300);
    return () => clearTimeout(debounceTimer);
  }, [conceptSearchQuery, conceptDropdownOpen, filters.concept_id]);

  // Fetch recent AI jobs for the 'Flagged by' filter
  useEffect(() => {
    const fetchJobs = async () => {
      setJobsLoading(true);
      try {
        const response = await fetch('/api/llm-jobs?includeCompleted=true&refresh=false&limit=50');
        if (response.ok) {
          const data = await response.json();
          const list = Array.isArray(data.jobs) ? data.jobs : [];
          setJobs(list.map((j: any) => ({
            id: String(j.id),
            label: j.label ?? null,
            status: j.status,
            flagged_items: Number(j.flagged_items ?? 0),
            created_at: String(j.created_at),
          })));
        }
      } catch (error) {
        console.error('Error fetching jobs:', error);
      } finally {
        setJobsLoading(false);
      }
    };

    fetchJobs();
  }, []);

  // Close panel when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        buttonRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        onToggle();
      }
    };

    // Add a small delay to prevent immediate closing
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onToggle]);

  const updateFilter = (key: keyof FilterState, value: unknown) => {
    let normalizedValue = value;

    if (Array.isArray(normalizedValue)) {
      normalizedValue = normalizedValue.length > 0 ? normalizedValue : undefined;
    } else if (normalizedValue === '') {
      normalizedValue = undefined;
    }

    if (key === 'parent_concept_id' && typeof normalizedValue === 'string') {
      normalizedValue = normalizedValue.replace(/[^\d]/g, '');
      if (normalizedValue === '') {
        normalizedValue = undefined;
      }
    }

    onFiltersChange({
      ...filters,
      [key]: normalizedValue as FilterState[keyof FilterState]
    });
  };

  const updateChildrenCountValue = (rawValue: string) => {
    const value = rawValue === '' ? undefined : parseInt(rawValue, 10);
    if (value === undefined || Number.isNaN(value)) {
      onFiltersChange({
        ...filters,
        childrenCountValue: undefined,
        childrenCountOp: undefined,
      });
      return;
    }

    onFiltersChange({
      ...filters,
      childrenCountValue: value,
      childrenCountOp: filters.childrenCountOp ?? 'gt',
    });
  };

  const toggleConceptId = (frameId: string) => {
    const currentIds = selectedConceptIds;
    const newIds = currentIds.includes(frameId)
      ? currentIds.filter(id => id !== frameId)
      : [...currentIds, frameId];
    
    updateFilter('concept_id', newIds.length > 0 ? newIds.join(',') : undefined);
  };

  const toggleLexfile = (lexfile: string) => {
    const currentLexfiles = filters.lexfile ? filters.lexfile.split(',') : [];
    const newLexfiles = currentLexfiles.includes(lexfile)
      ? currentLexfiles.filter(lf => lf !== lexfile)
      : [...currentLexfiles, lexfile];
    
    updateFilter('lexfile', newLexfiles.length > 0 ? newLexfiles.join(',') : undefined);
  };

  const togglePos = (pos: string) => {
    const allPos = ['verb', 'noun', 'adjective', 'adverb'];
    const currentPos = filters.pos === 'none' ? [] : (filters.pos ? filters.pos.split(',') : allPos);
    const newPos = currentPos.includes(pos)
      ? currentPos.filter(p => p !== pos)
      : [...currentPos, pos];
    
    const isAllSelected = allPos.every(p => newPos.includes(p));
    updateFilter('pos', isAllSelected ? undefined : (newPos.length > 0 ? newPos.join(',') : 'none'));
  };

  const selectedConceptIds = useMemo(() => {
    if (!filters.concept_id) return [] as string[];
    return filters.concept_id
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);
  }, [filters.concept_id]);

  const selectedLexfiles = filters.lexfile ? filters.lexfile.split(',') : [];
  const selectedPos = filters.pos === 'none' ? [] : (filters.pos ? filters.pos.split(',') : ['verb', 'noun', 'adjective', 'adverb']);
  
  const filteredConcepts = concepts;

  // Resolve labels to IDs when concepts are loaded
  useEffect(() => {
    if (concepts.length === 0 || !filters.concept_id) return;

    const rawValues = filters.concept_id.split(',').map(id => id.trim()).filter(Boolean);
    const hasLabels = rawValues.some(id => !/^\d+$/.test(id));
    if (!hasLabels) return;

    const resolved = rawValues.map(value => {
      if (/^\d+$/.test(value)) return value;
      const match = concepts.find(f => f.label.toLowerCase() === value.toLowerCase());
      return match ? match.id : value;
    });

    const resolvedValue = resolved.join(',');
    if (resolvedValue !== filters.concept_id) {
      onFiltersChange({ ...filters, concept_id: resolvedValue });
    }
  }, [concepts, filters, onFiltersChange]);

  useEffect(() => {
    if (!conceptDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        conceptDropdownContainerRef.current &&
        !conceptDropdownContainerRef.current.contains(event.target as Node)
      ) {
        setConceptDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [conceptDropdownOpen]);

  useEffect(() => {
    if (!jobDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        jobDropdownContainerRef.current &&
        !jobDropdownContainerRef.current.contains(event.target as Node)
      ) {
        setJobDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [jobDropdownOpen]);

  const hasActiveFilters = Object.values(filters).some(value => 
    value !== undefined && value !== ''
  );

  const activeFilterCount = Object.values(filters).filter(value => 
    value !== undefined && value !== ''
  ).length;

  // Verb lexfiles from WordNet
  const lexfileOptions = [
    'verb.body',
    'verb.change',
    'verb.cognition',
    'verb.communication',
    'verb.competition',
    'verb.consumption',
    'verb.contact',
    'verb.creation',
    'verb.emotion',
    'verb.motion',
    'verb.perception',
    'verb.possession',
    'verb.social',
    'verb.stative',
    'verb.weather'
  ];

  const filteredLexfiles = lexfileSearchQuery
    ? lexfileOptions.filter(lexfile => 
        lexfile.toLowerCase().includes(lexfileSearchQuery.toLowerCase())
      )
    : lexfileOptions;

  const posOptions = Object.entries(POS_LABELS);

  const filteredJobs = jobSearchQuery
    ? jobs.filter(job => {
        const query = jobSearchQuery.toLowerCase();
        const displayLabel = job.label ?? `Job ${job.id}`;
        return displayLabel.toLowerCase().includes(query) || job.id.includes(query);
      })
    : jobs;

  return (
    <>
      {/* Filter Toggle Button */}
      <button
        ref={buttonRef}
        onClick={onToggle}
        className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-gray-300 rounded-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors cursor-pointer ${
          hasActiveFilters ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-white text-gray-700'
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
        <div 
          ref={panelRef}
          className={`absolute top-full left-0 mt-2 w-[32rem] bg-white border border-gray-200 rounded-xl z-50 ${className || ''}`}
        >
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
                  className="text-sm text-blue-600 hover:text-blue-600 font-medium cursor-pointer"
                >
                  Clear all
                </button>
              )}
              <button
                onClick={onToggle}
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Filter Sections */}
          <div className="max-h-[32rem] overflow-y-auto">
            {/* Category Filters */}
            {(mode === 'lexical_units' || isSensesMode) && (
              <FilterSection
                title="Categories"
                icon={<HashtagIcon className="w-4 h-4 text-gray-600" />}
                isOpen={openSections.has('categories')}
                onToggle={() => toggleSection('categories')}
              >
                <div className="relative">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700">Part of Speech</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => updateFilter('pos', undefined)}
                        className="text-xs text-blue-600 hover:text-blue-600 font-medium cursor-pointer"
                      >
                        All
                      </button>
                      <span className="text-xs text-gray-300">|</span>
                      <button
                        onClick={() => updateFilter('pos', 'none')}
                        className="text-xs text-blue-600 hover:text-blue-600 font-medium cursor-pointer"
                      >
                        None
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {posOptions
                      .filter(([pos]) => ['verb', 'noun', 'adjective', 'adverb'].includes(pos))
                      .map(([pos, label]) => (
                        <label
                          key={pos}
                          className={`flex items-center px-3 py-2 rounded-xl border transition-colors cursor-pointer ${
                            selectedPos.includes(pos)
                              ? 'bg-blue-50 border-blue-200 text-blue-600'
                              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedPos.includes(pos)}
                            onChange={() => togglePos(pos)}
                            className="mr-3 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium">{label}</span>
                        </label>
                      ))}
                  </div>
                </div>
                {mode === 'lexical_units' && (
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Lexfile</label>
                    <input
                      type="text"
                      value={lexfileSearchQuery}
                      onChange={(e) => setLexfileSearchQuery(e.target.value)}
                      onFocus={() => setLexfileDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setLexfileDropdownOpen(false), 200)}
                      placeholder="Search lexfiles..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 mb-2"
                    />
                    {lexfileDropdownOpen && (
                      <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-xl bg-white">
                        {filteredLexfiles.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-gray-500">No lexfiles found</div>
                        ) : (
                          filteredLexfiles.map((lexfile) => (
                            <label
                              key={lexfile}
                              className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                            >
                              <input
                                type="checkbox"
                                checked={selectedLexfiles.includes(lexfile)}
                                onChange={() => toggleLexfile(lexfile)}
                                className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900">{lexfile}</div>
                              </div>
                            </label>
                          ))
                        )}
                      </div>
                    )}
                    {selectedLexfiles.length > 0 && (
                      <div className="mt-2 text-xs text-gray-600">
                        {selectedLexfiles.length} lexfile{selectedLexfiles.length !== 1 ? 's' : ''} selected
                      </div>
                    )}
                  </div>
                )}
                <div className="relative" ref={conceptDropdownContainerRef}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Concept ID</label>
                  <input
                    type="text"
                    value={conceptSearchQuery}
                    onChange={(e) => setConceptSearchQuery(e.target.value)}
                    onFocus={() => setConceptDropdownOpen(true)}
                    placeholder="Search concepts..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 mb-2"
                  />
                  {conceptDropdownOpen && (
                    <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-xl bg-white">
                      {loadingConcepts ? (
                        <div className="flex items-center justify-center py-6">
                          <LoadingSpinner size="sm" noPadding />
                        </div>
                      ) : filteredConcepts.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-500">No concepts found</div>
                      ) : (
                        filteredConcepts.map((concept) => (
                          <label
                            key={concept.id}
                            className="flex items-start px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                          >
                            <input
                              type="checkbox"
                              checked={selectedConceptIds.includes(concept.id)}
                              onChange={() => toggleConceptId(concept.id)}
                              className="mt-0.5 mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">
                              {(() => {
                                const displayValue = concept.code || concept.label;
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
                              })()}
                            </div>
                              <div className="text-xs text-gray-500 font-mono truncate">
                                {concept.id}{concept.code ? ` · ${concept.label}` : ''}
                              </div>
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                  )}
                  {selectedConceptIds.length > 0 && (
                    <div className="mt-2 text-xs text-gray-600">
                      {selectedConceptIds.length} concept{selectedConceptIds.length !== 1 ? 's' : ''} selected
                    </div>
                  )}
                </div>
              </FilterSection>
            )}

            {/* Frame hierarchy filters */}
            {canFilterByParentConceptId && (
              <FilterSection
                title="Hierarchy"
                icon={<HashtagIcon className="w-4 h-4 text-gray-600" />}
                isOpen={openSections.has('hierarchy')}
                onToggle={() => toggleSection('hierarchy')}
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Parent Concept ID</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={filters.parent_concept_id || ''}
                    onChange={(e) => updateFilter('parent_concept_id', e.target.value)}
                    placeholder="e.g., 12345"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Show only concepts that inherit from this concept.
                  </p>
                </div>
              </FilterSection>
            )}

            {/* Text Filters */}
            <FilterSection
              title="Text Search"
              icon={<MagnifyingGlassIcon className="w-4 h-4 text-gray-600" />}
              isOpen={openSections.has('text')}
              onToggle={() => toggleSection('text')}
            >
              {isConceptsMode ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Concept Name</label>
                    <input
                      type="text"
                      value={filters.label || ''}
                      onChange={(e) => updateFilter('label', e.target.value)}
                      placeholder="Search in concept names..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Definition</label>
                    <input
                      type="text"
                      value={filters.definition || ''}
                      onChange={(e) => updateFilter('definition', e.target.value)}
                      placeholder="Search in definitions..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Short Definition</label>
                    <input
                      type="text"
                      value={filters.short_definition || ''}
                      onChange={(e) => updateFilter('short_definition', e.target.value)}
                      placeholder="Search in short definitions..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                    />
                  </div>
                </>
              ) : isSensesMode ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Definition</label>
                    <input
                      type="text"
                      value={filters.definition || ''}
                      onChange={(e) => updateFilter('definition', e.target.value)}
                      placeholder="Search in definitions..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Lemmas</label>
                    <input
                      type="text"
                      value={filters.lemmas || ''}
                      onChange={(e) => updateFilter('lemmas', e.target.value)}
                      placeholder="Search in lemmas..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Archetype</label>
                    <input
                      type="text"
                      value={filters.archetype || ''}
                      onChange={(e) => updateFilter('archetype', e.target.value)}
                      placeholder="Search archetypes..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Gloss</label>
                    <input
                      type="text"
                      value={filters.gloss || ''}
                      onChange={(e) => updateFilter('gloss', e.target.value)}
                      placeholder="Search in glosses..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Lemmas</label>
                    <input
                      type="text"
                      value={filters.lemmas || ''}
                      onChange={(e) => updateFilter('lemmas', e.target.value)}
                      placeholder="Search in lemmas..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Examples</label>
                    <input
                      type="text"
                      value={filters.examples || ''}
                      onChange={(e) => updateFilter('examples', e.target.value)}
                      placeholder="Search in examples..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Concepts</label>
                    <input
                      type="text"
                      value={filters.frames || ''}
                      onChange={(e) => updateFilter('frames', e.target.value)}
                      placeholder="Search in concepts..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                    />
                  </div>
                </>
              )}
              {!isSensesMode && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Flagged Reason</label>
                <input
                  type="text"
                  value={filters.flaggedReason || ''}
                  onChange={(e) => updateFilter('flaggedReason', e.target.value)}
                  placeholder="Search in flagged reason..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                />
              </div>
              )}
              {!isSensesMode && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unverifiable Reason</label>
                <input
                  type="text"
                  value={filters.unverifiableReason || ''}
                  onChange={(e) => updateFilter('unverifiableReason', e.target.value)}
                  placeholder="Search in unverifiable reason..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                />
              </div>
              )}
            </FilterSection>

            {/* AI Jobs Filters */}
            {!isSensesMode && (
            <FilterSection
              title="AI Jobs"
              icon={<SparklesIcon className="w-4 h-4 shrink-0 text-gray-600" />}
              isOpen={openSections.has('ai-jobs')}
              onToggle={() => toggleSection('ai-jobs')}
            >
              <div className="relative" ref={jobDropdownContainerRef}>
                <label className="block text-sm font-medium text-gray-700 mb-1">Flagged by (Job)</label>
                {jobsLoading ? (
                  <LoadingSpinner size="sm" label="Loading jobs…" className="!flex-row !gap-2 !py-2" />
                ) : (
                  <>
                    <input
                      type="text"
                      value={jobSearchQuery}
                      onChange={(e) => setJobSearchQuery(e.target.value)}
                      onFocus={() => setJobDropdownOpen(true)}
                      placeholder="Search jobs..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 mb-2"
                    />
                    {jobDropdownOpen && (
                      <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-xl bg-white">
                        {filteredJobs.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-gray-500">No jobs found</div>
                        ) : (
                          filteredJobs.map((job) => (
                            <label
                              key={job.id}
                              className="flex items-start px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                            >
                              <input
                                type="radio"
                                name="flaggedByJobId"
                                checked={filters.flaggedByJobId === job.id}
                                onChange={() => {
                                  updateFilter('flaggedByJobId', job.id);
                                  setJobDropdownOpen(false);
                                }}
                                className="mt-0.5 mr-3 border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">
                                  {job.label ?? `Job ${job.id}`}
                                </div>
                                <div className="text-xs text-gray-500 font-mono truncate">
                                  ID: {job.id}{job.flagged_items ? ` · ${job.flagged_items} flagged` : ''}
                                </div>
                              </div>
                            </label>
                          ))
                        )}
                      </div>
                    )}
                    {filters.flaggedByJobId && (
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-gray-600">
                          1 job selected
                        </span>
                        <button
                          onClick={() => updateFilter('flaggedByJobId', undefined)}
                          className="text-xs text-red-600 hover:text-red-700 font-medium cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </>
                )}
                <p className="mt-1 text-xs text-gray-500">Show entries the AI flagged in a specific job.</p>
              </div>
            </FilterSection>
            )}

            {/* Boolean Filters */}
            <FilterSection
              title="Properties"
              icon={<CheckIcon className="w-4 h-4 text-gray-600" />}
              isOpen={openSections.has('properties')}
              onToggle={() => toggleSection('properties')}
            >
              {mode === 'concepts' ? (
                <div className="text-sm text-gray-500 italic">No concept properties to filter.</div>
              ) : isSensesMode ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Concept Link Warning</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateFilter('conceptWarning', filters.conceptWarning === 'none' ? undefined : 'none')}
                      className={`px-3 py-1 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                        filters.conceptWarning === 'none'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                      }`}
                    >
                      No concept
                    </button>
                    <button
                      onClick={() => updateFilter('conceptWarning', filters.conceptWarning === 'multiple' ? undefined : 'multiple')}
                      className={`px-3 py-1 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                        filters.conceptWarning === 'multiple'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                      }`}
                    >
                      Multiple concepts
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {mode === 'lexical_units' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Multi-word Expression</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateFilter('isMwe', filters.isMwe === true ? undefined : true)}
                          className={`px-3 py-1 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                            filters.isMwe === true 
                              ? 'bg-blue-100 text-blue-600 border border-blue-200' 
                              : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                          }`}
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => updateFilter('isMwe', filters.isMwe === false ? undefined : false)}
                          className={`px-3 py-1 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                            filters.isMwe === false 
                              ? 'bg-blue-100 text-blue-600 border border-blue-200' 
                              : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                          }`}
                        >
                          No
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
              {!isSensesMode && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Flagged</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateFilter('flagged', filters.flagged === true ? undefined : true)}
                    className={`px-3 py-1 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                      filters.flagged === true 
                        ? 'bg-orange-100 text-orange-800 border border-orange-200' 
                        : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => updateFilter('flagged', filters.flagged === false ? undefined : false)}
                    className={`px-3 py-1 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                      filters.flagged === false 
                        ? 'bg-orange-100 text-orange-800 border border-orange-200' 
                        : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>
              )}
              {!isSensesMode && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Verifiable</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateFilter('verifiable', filters.verifiable === true ? undefined : true)}
                    className={`px-3 py-1 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                      filters.verifiable === true 
                        ? 'bg-green-100 text-green-800 border border-green-200' 
                        : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => updateFilter('verifiable', filters.verifiable === false ? undefined : false)}
                    className={`px-3 py-1 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                      filters.verifiable === false 
                        ? 'bg-green-100 text-green-800 border border-green-200' 
                        : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>
              )}
              
              {/* Pending State Filters */}
              {!isSensesMode && (
              <div className="pt-3 border-t border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-2">Pending Changes</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => updateFilter('pendingCreate', filters.pendingCreate === true ? undefined : true)}
                    className={`px-3 py-1 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                      filters.pendingCreate === true 
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                        : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    Pending Creation
                  </button>
                  <button
                    onClick={() => updateFilter('pendingUpdate', filters.pendingUpdate === true ? undefined : true)}
                    className={`px-3 py-1 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                      filters.pendingUpdate === true 
                        ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                        : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    Pending Update
                  </button>
                  <button
                    onClick={() => updateFilter('pendingDelete', filters.pendingDelete === true ? undefined : true)}
                    className={`px-3 py-1 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                      filters.pendingDelete === true 
                        ? 'bg-red-100 text-red-800 border border-red-200' 
                        : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    Pending Deletion
                  </button>
                </div>
              </div>
              )}
            </FilterSection>

            {/* Numeric Filters - only show for non-frames modes */}
            {mode === 'lexical_units' && (
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
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                    />
                    <input
                      type="number"
                      value={filters.parentsCountMax || ''}
                      onChange={(e) => updateFilter('parentsCountMax', e.target.value ? parseInt(e.target.value) : undefined)}
                      placeholder="Max"
                      min="0"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
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
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                    />
                    <input
                      type="number"
                      value={filters.childrenCountMax || ''}
                      onChange={(e) => updateFilter('childrenCountMax', e.target.value ? parseInt(e.target.value) : undefined)}
                      placeholder="Max"
                      min="0"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                    />
                  </div>
                </div>
              </FilterSection>
            )}

            {isConceptsMode && (
              <FilterSection
                title="Words"
                icon={<HashtagIcon className="w-4 h-4 text-gray-600" />}
                isOpen={openSections.has('relationships')}
                onToggle={() => toggleSection('relationships')}
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Children Count</label>
                  <div className="flex gap-2">
                    <select
                      value={filters.childrenCountOp ?? 'gt'}
                      onChange={(e) => updateFilter('childrenCountOp', e.target.value as FilterState['childrenCountOp'])}
                      className="w-24 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                    >
                      <option value="gt">{'>'}</option>
                      <option value="lt">{'<'}</option>
                      <option value="eq">=</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      value={filters.childrenCountValue ?? ''}
                      onChange={(e) => updateChildrenCountValue(e.target.value)}
                      placeholder="Count"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                    />
                  </div>
                </div>
              </FilterSection>
            )}

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
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                    placeholder="After"
                  />
                  <input
                    type="date"
                    value={filters.createdBefore || ''}
                    onChange={(e) => updateFilter('createdBefore', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                    placeholder="After"
                  />
                  <input
                    type="date"
                    value={filters.updatedBefore || ''}
                    onChange={(e) => updateFilter('updatedBefore', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                    placeholder="Before"
                  />
                </div>
              </div>
            </FilterSection>

            {/* Unallocated Entries - only for lexical units */}
            {mode === 'lexical_units' && (
              <FilterSection
                title="Unallocated entries"
                icon={<XCircleIcon className="w-4 h-4 text-gray-600" />}
                isOpen={openSections.has('unallocated')}
                onToggle={() => toggleSection('unallocated')}
              >
                <div className="relative">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.excludeNullConcept !== false} // Default to true
                      onChange={(e) => updateFilter('excludeNullConcept', e.target.checked ? true : false)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Exclude entries without concepts</span>
                  </label>
                </div>
              </FilterSection>
            )}
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
                  className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1 cursor-pointer"
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
