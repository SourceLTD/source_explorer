'use client';

import { useState, useRef, useEffect } from 'react';
import { SearchResult } from '@/lib/types';
import LoadingSpinner from './LoadingSpinner';

interface SearchBoxProps {
  onSelectResult: (result: SearchResult) => void;
  onSearchChange?: (query: string) => void;
  placeholder?: string;
  mode?: 'verbs' | 'nouns' | 'adjectives' | 'adverbs' | 'frames' | 'lexical_units';
}

function FrameResultPreview({ result }: { result: SearchResult }) {
  const definition = result.frameDefinition || result.gloss;

  return (
    <div className="w-full min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <div className="font-semibold text-gray-950 truncate">
          {result.label || result.id}
        </div>
        <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-mono">
          #{result.id}
        </span>
        {result.frameType && (
          <span className="shrink-0 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
            {result.frameType}
          </span>
        )}
      </div>

      {definition && (
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-1.5 text-xs leading-snug text-slate-700 line-clamp-2">
          {definition}
        </div>
      )}
    </div>
  );
}

export default function SearchBox({ onSelectResult, onSearchChange, placeholder = "Search...", mode = 'verbs' }: SearchBoxProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const searchEntries = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      let apiEndpoint = '/api/search';
      
      if (mode === 'frames') {
        apiEndpoint = '/api/frames/search';
      } else if (mode === 'nouns') {
        apiEndpoint = '/api/search?pos=noun';
      } else if (mode === 'adjectives') {
        apiEndpoint = '/api/search?pos=adjective';
      } else if (mode === 'adverbs') {
        apiEndpoint = '/api/search?pos=adverb';
      }
      
      const separator = apiEndpoint.includes('?') ? '&' : '?';
      const response = await fetch(`${apiEndpoint}${separator}q=${encodeURIComponent(searchQuery)}&limit=100`);
      if (response.ok) {
        const searchResults = await response.json();
        setResults(searchResults);
        setIsOpen(true);
      } else {
        console.error('Search failed:', response.statusText);
        setResults([]);
        setIsOpen(false);
      }
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    
    // Call the search change callback immediately
    onSearchChange?.(value);
    
    // Clear the previous timeout if it exists
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    // Debounce search - wait 600ms after the last keystroke
    debounceTimeoutRef.current = setTimeout(() => {
      searchEntries(value);
    }, 600);
  };

  const handleSelectResult = (result: SearchResult) => {
    setQuery(result.label || result.id);
    setIsOpen(false);
    onSelectResult(result);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div ref={searchRef} className="relative w-full max-w-2xl">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => query && setIsOpen(true)}
          placeholder={placeholder}
          className="w-full px-4 py-2 pr-10 text-base font-medium text-gray-900 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
          {isLoading ? (
            <LoadingSpinner size="sm" noPadding />
          ) : (
            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
        </div>
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl max-h-[600px] overflow-y-auto shadow-lg">
          {results.map((result) => (
            <button
              key={result.id}
              onClick={() => handleSelectResult(result)}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none border-b border-gray-100 last:border-b-0 cursor-pointer"
            >
              {mode === 'frames' ? (
                <FrameResultPreview result={result} />
              ) : (
                <div className="w-full">
                  <div className="font-medium text-gray-900 truncate mb-1">
                    {result.label || result.id}
                    <span className="ml-2 text-xs text-gray-500 font-normal">
                      ({result.pos})
                    </span>
                  </div>
                  {(() => {
                    const allLemmas = result.lemmas || [];
                    const srcLemmas = result.src_lemmas || [];
                    // Only show regular lemmas that are NOT in src_lemmas
                    const regularLemmas = allLemmas.filter(lemma => !srcLemmas.includes(lemma));
                    const hasLemmas = regularLemmas.length > 0 || srcLemmas.length > 0;

                    return hasLemmas && (
                      <div className="text-sm text-blue-600 mb-1 font-medium">
                        {regularLemmas.join(', ')}
                        {regularLemmas.length > 0 && srcLemmas.length > 0 && ', '}
                        {srcLemmas.map((lemma, idx) => (
                          <span key={idx}>
                            <strong>{lemma}</strong>
                            {idx < srcLemmas.length - 1 && ', '}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                  <div className="text-sm text-gray-600 line-clamp-2 w-full">
                    {result.gloss}
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {isOpen && results.length === 0 && query && !isLoading && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl">
          <div className="px-4 py-3 text-gray-500 text-sm">
            No results found for &quot;{query}&quot;
          </div>
        </div>
      )}
    </div>
  );
}
