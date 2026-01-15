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
import type { DataTableMode } from './DataTable/types';
import type { FilterState } from './DataTable/filterState';

interface Frame {
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
  mode?: DataTableMode;
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
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loadingFrames, setLoadingFrames] = useState(false);
  const [frameSearchQuery, setFrameSearchQuery] = useState('');
  const [lexfileSearchQuery, setLexfileSearchQuery] = useState('');
  const [frameDropdownOpen, setFrameDropdownOpen] = useState(false);
  const [lexfileDropdownOpen, setLexfileDropdownOpen] = useState(false);
  const [jobs, setJobs] = useState<Array<{ id: string; label: string | null; status: string; flagged_items: number; created_at: string }>>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobSearchQuery, setJobSearchQuery] = useState('');
  const [jobDropdownOpen, setJobDropdownOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const frameDropdownContainerRef = useRef<HTMLDivElement>(null);
  const jobDropdownContainerRef = useRef<HTMLDivElement>(null);
  const isFramesMode = mode === 'frames' || mode === 'super_frames' || mode === 'frames_only';
  const canFilterBySuperFrameId = mode === 'frames' || mode === 'frames_only';
  
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

  // If a deep link sets a super_frame_id, make sure the relevant section is visible when opening the panel.
  useEffect(() => {
    if (!canFilterBySuperFrameId) return;
    if (!filters.super_frame_id) return;
    setOpenSections(prev => {
      if (prev.has('hierarchy')) return prev;
      const next = new Set(prev);
      next.add('hierarchy');
      return next;
    });
  }, [canFilterBySuperFrameId, filters.super_frame_id]);

  // Fetch frames when searching or when dropdown opens
  useEffect(() => {
    const fetchFrames = async () => {
      if (!frameDropdownOpen && !filters.frame_id) return;

      setLoadingFrames(true);
      try {
        const queryParams = new URLSearchParams();
        if (frameSearchQuery) {
          queryParams.set('search', frameSearchQuery);
        }
        
        // Always include selected frames so they show up in the list
        if (filters.frame_id) {
          queryParams.set('ids', filters.frame_id);
        }
        
        queryParams.set('limit', '100');

        const response = await fetch(`/api/frames?${queryParams.toString()}`);
        if (response.ok) {
          const data = await response.json();
          setFrames(data);
        }
      } catch (error) {
        console.error('Error fetching frames:', error);
      } finally {
        setLoadingFrames(false);
      }
    };

    const debounceTimer = setTimeout(fetchFrames, 300);
    return () => clearTimeout(debounceTimer);
  }, [frameSearchQuery, frameDropdownOpen, filters.frame_id]);

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

    // Guard: super frame IDs must be numeric; strip non-digits to avoid server BigInt() errors.
    if (key === 'super_frame_id' && typeof normalizedValue === 'string') {
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

  const toggleFrameId = (frameId: string) => {
    const currentIds = selectedFrameIds;
    const newIds = currentIds.includes(frameId)
      ? currentIds.filter(id => id !== frameId)
      : [...currentIds, frameId];
    
    updateFilter('frame_id', newIds.length > 0 ? newIds.join(',') : undefined);
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

  const selectedFrameIds = useMemo(() => {
    if (!filters.frame_id) return [] as string[];
    return filters.frame_id
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);
  }, [filters.frame_id]);

  const selectedLexfiles = filters.lexfile ? filters.lexfile.split(',') : [];
  const selectedPos = filters.pos === 'none' ? [] : (filters.pos ? filters.pos.split(',') : ['verb', 'noun', 'adjective', 'adverb']);
  
  const filteredFrames = frames;

  // Resolve labels to IDs when frames are loaded
  useEffect(() => {
    if (frames.length === 0 || !filters.frame_id) return;

    const rawValues = filters.frame_id.split(',').map(id => id.trim()).filter(Boolean);
    const hasLabels = rawValues.some(id => !/^\d+$/.test(id));
    if (!hasLabels) return;

    const resolved = rawValues.map(value => {
      if (/^\d+$/.test(value)) return value;
      const match = frames.find(f => f.label.toLowerCase() === value.toLowerCase());
      return match ? match.id : value;
    });

    const resolvedValue = resolved.join(',');
    if (resolvedValue !== filters.frame_id) {
      onFiltersChange({ ...filters, frame_id: resolvedValue });
    }
  }, [frames, filters, onFiltersChange]);

  useEffect(() => {
    if (!frameDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        frameDropdownContainerRef.current &&
        !frameDropdownContainerRef.current.contains(event.target as Node)
      ) {
        setFrameDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [frameDropdownOpen]);

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
            {/* Category Filters - only show for lexical units */}
            {mode === 'lexical_units' && (
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
                <div className="relative" ref={frameDropdownContainerRef}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Frame ID</label>
                  <input
                    type="text"
                    value={frameSearchQuery}
                    onChange={(e) => setFrameSearchQuery(e.target.value)}
                    onFocus={() => setFrameDropdownOpen(true)}
                    placeholder="Search frames..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 mb-2"
                  />
                  {frameDropdownOpen && (
                    <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-xl bg-white">
                      {loadingFrames ? (
                        <div className="flex items-center justify-center py-6">
                          <LoadingSpinner size="sm" noPadding />
                        </div>
                      ) : filteredFrames.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-500">No frames found</div>
                      ) : (
                        filteredFrames.map((frame) => (
                          <label
                            key={frame.id}
                            className="flex items-start px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                          >
                            <input
                              type="checkbox"
                              checked={selectedFrameIds.includes(frame.id)}
                              onChange={() => toggleFrameId(frame.id)}
                              className="mt-0.5 mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">
                              {(() => {
                                const displayValue = frame.code || frame.label;
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
                                {frame.id}{frame.code ? ` · ${frame.label}` : ''}
                              </div>
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                  )}
                  {selectedFrameIds.length > 0 && (
                    <div className="mt-2 text-xs text-gray-600">
                      {selectedFrameIds.length} frame{selectedFrameIds.length !== 1 ? 's' : ''} selected
                    </div>
                  )}
                </div>
              </FilterSection>
            )}

            {/* Frame hierarchy filters */}
            {canFilterBySuperFrameId && (
              <FilterSection
                title="Hierarchy"
                icon={<HashtagIcon className="w-4 h-4 text-gray-600" />}
                isOpen={openSections.has('hierarchy')}
                onToggle={() => toggleSection('hierarchy')}
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Super Frame ID</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={filters.super_frame_id || ''}
                    onChange={(e) => updateFilter('super_frame_id', e.target.value)}
                    placeholder="e.g., 12345"
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Show only child frames whose parent super frame matches this ID.
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
              {isFramesMode ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Frame Name</label>
                    <input
                      type="text"
                      value={filters.label || ''}
                      onChange={(e) => updateFilter('label', e.target.value)}
                      placeholder="Search in frame names..."
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Frames</label>
                    <input
                      type="text"
                      value={filters.frames || ''}
                      onChange={(e) => updateFilter('frames', e.target.value)}
                      placeholder="Search in frames..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                    />
                  </div>
                </>
              )}
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
            </FilterSection>

            {/* AI Jobs Filters */}
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

            {/* Boolean Filters */}
            <FilterSection
              title="Properties"
              icon={<CheckIcon className="w-4 h-4 text-gray-600" />}
              isOpen={openSections.has('properties')}
              onToggle={() => toggleSection('properties')}
            >
              {mode === 'frames' ? (
                <div className="text-sm text-gray-500 italic">No frame properties to filter.</div>
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
              
              {/* Pending State Filters */}
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
                      checked={filters.excludeNullFrame !== false} // Default to true
                      onChange={(e) => updateFilter('excludeNullFrame', e.target.checked ? true : false)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Exclude entries without frames</span>
                  </label>
                  <p className="mt-1 ml-6 text-xs text-gray-500">Only show lexical units that are assigned to a frame.</p>
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
