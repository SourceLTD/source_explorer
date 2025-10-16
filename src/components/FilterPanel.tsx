'use client';

import React, { useState, useEffect, useRef } from 'react';
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

interface Frame {
  id: string;
  frame_name: string;
}

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
  frame_id?: string; // Comma-separated frame IDs
  
  // Boolean filters
  isMwe?: boolean;
  transitive?: boolean;
  flagged?: boolean;
  forbidden?: boolean;
  
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
  className 
}: FilterPanelProps) {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['text']));
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loadingFrames, setLoadingFrames] = useState(false);
  const [frameSearchQuery, setFrameSearchQuery] = useState('');
  const [lexfileSearchQuery, setLexfileSearchQuery] = useState('');
  const [posSearchQuery, setPosSearchQuery] = useState('');
  const [frameDropdownOpen, setFrameDropdownOpen] = useState(false);
  const [lexfileDropdownOpen, setLexfileDropdownOpen] = useState(false);
  const [posDropdownOpen, setPosDropdownOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  
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

  // Fetch frames when component mounts
  useEffect(() => {
    const fetchFrames = async () => {
      setLoadingFrames(true);
      try {
        const response = await fetch('/api/frames');
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
    
    fetchFrames();
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

  const updateFilter = (key: keyof FilterState, value: string | number | boolean | undefined) => {
    onFiltersChange({
      ...filters,
      [key]: value === '' ? undefined : value
    });
  };

  const toggleFrameId = (frameId: string) => {
    const currentIds = filters.frame_id ? filters.frame_id.split(',') : [];
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
    const currentPos = filters.pos ? filters.pos.split(',') : [];
    const newPos = currentPos.includes(pos)
      ? currentPos.filter(p => p !== pos)
      : [...currentPos, pos];
    
    updateFilter('pos', newPos.length > 0 ? newPos.join(',') : undefined);
  };

  const selectedFrameIds = filters.frame_id ? filters.frame_id.split(',') : [];
  const selectedLexfiles = filters.lexfile ? filters.lexfile.split(',') : [];
  const selectedPos = filters.pos ? filters.pos.split(',') : [];
  
  const filteredFrames = frameSearchQuery
    ? frames.filter(frame => 
        frame.frame_name.toLowerCase().includes(frameSearchQuery.toLowerCase()) ||
        frame.id.toLowerCase().includes(frameSearchQuery.toLowerCase())
      )
    : frames;

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
  const filteredPosOptions = posSearchQuery
    ? posOptions.filter(([pos, label]) => 
        label.toLowerCase().includes(posSearchQuery.toLowerCase()) ||
        pos.toLowerCase().includes(posSearchQuery.toLowerCase())
      )
    : posOptions;

  return (
    <>
      {/* Filter Toggle Button */}
      <button
        ref={buttonRef}
        onClick={onToggle}
        className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors cursor-pointer ${
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
        <div 
          ref={panelRef}
          className={`absolute top-full left-0 mt-2 w-[32rem] bg-white border border-gray-200 rounded-lg shadow-lg z-50 ${className || ''}`}
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
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
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
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Part of Speech</label>
                <input
                  type="text"
                  value={posSearchQuery}
                  onChange={(e) => setPosSearchQuery(e.target.value)}
                  onFocus={() => setPosDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setPosDropdownOpen(false), 200)}
                  placeholder="Search parts of speech..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 mb-2"
                />
                {posDropdownOpen && (
                  <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-md bg-white">
                    {filteredPosOptions.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-500">No parts of speech found</div>
                    ) : (
                      filteredPosOptions.map(([pos, label]) => (
                        <label
                          key={pos}
                          className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                        >
                          <input
                            type="checkbox"
                            checked={selectedPos.includes(pos)}
                            onChange={() => togglePos(pos)}
                            className="mr-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900">{label}</div>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                )}
                {selectedPos.length > 0 && (
                  <div className="mt-2 text-xs text-gray-600">
                    {selectedPos.length} selected
                  </div>
                )}
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 mb-2"
                />
                {lexfileDropdownOpen && (
                  <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-md bg-white">
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
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Frame ID</label>
                {loadingFrames ? (
                  <div className="text-sm text-gray-500">Loading frames...</div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={frameSearchQuery}
                      onChange={(e) => setFrameSearchQuery(e.target.value)}
                      onFocus={() => setFrameDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setFrameDropdownOpen(false), 200)}
                      placeholder="Search frames..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 mb-2"
                    />
                    {frameDropdownOpen && (
                      <div className="max-h-48 overflow-y-auto border border-gray-300 rounded-md bg-white">
                        {filteredFrames.length === 0 ? (
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
                                <div className="text-sm font-medium text-gray-900 truncate">{frame.frame_name}</div>
                                <div className="text-xs text-gray-500 font-mono truncate">{frame.id}</div>
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
                  </>
                )}
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
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                      filters.isMwe === true 
                        ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                        : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => updateFilter('isMwe', filters.isMwe === false ? undefined : false)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors cursor-pointer ${
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
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                      filters.transitive === true 
                        ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                        : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => updateFilter('transitive', filters.transitive === false ? undefined : false)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                      filters.transitive === false 
                        ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                        : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    No
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Flagged</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateFilter('flagged', filters.flagged === true ? undefined : true)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                      filters.flagged === true 
                        ? 'bg-orange-100 text-orange-800 border border-orange-200' 
                        : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => updateFilter('flagged', filters.flagged === false ? undefined : false)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors cursor-pointer ${
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Forbidden</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateFilter('forbidden', filters.forbidden === true ? undefined : true)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                      filters.forbidden === true 
                        ? 'bg-red-100 text-red-800 border border-red-200' 
                        : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => updateFilter('forbidden', filters.forbidden === false ? undefined : false)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                      filters.forbidden === false 
                        ? 'bg-red-100 text-red-800 border border-red-200' 
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
