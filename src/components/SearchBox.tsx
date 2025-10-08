'use client';

import { useState, useRef, useEffect } from 'react';
import { SearchResult } from '@/lib/types';

interface SearchBoxProps {
  onSelectResult: (result: SearchResult) => void;
  onSearchChange?: (query: string) => void;
  placeholder?: string;
}

export default function SearchBox({ onSelectResult, onSearchChange, placeholder = "Search lexical entries..." }: SearchBoxProps) {
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
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=100`);
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
    setQuery(result.id);
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
          className="w-full px-4 py-2 pr-10 text-base font-medium text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
          {isLoading ? (
            <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-blue-600 rounded-full"></div>
          ) : (
            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
        </div>
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[600px] overflow-y-auto">
                      {results.map((result) => (
            <button
              key={result.id}
              onClick={() => handleSelectResult(result)}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none border-b border-gray-100 last:border-b-0"
            >
              <div className="w-full">
                <div className="font-medium text-gray-900 truncate mb-1">
                  {result.id}
                  <span className="ml-2 text-xs text-gray-500 font-normal">
                    ({result.pos})
                  </span>
                </div>
                {(() => {
                  const allLemmas = [...(result.src_lemmas || []), ...(result.lemmas || [])];
                  return allLemmas.length > 0 && (
                    <div className="text-sm text-blue-600 mb-1 font-medium">
                      {allLemmas.join(', ')}
                    </div>
                  );
                })()}
                <div className="text-sm text-gray-600 line-clamp-2 w-full">
                  {result.gloss}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {isOpen && results.length === 0 && query && !isLoading && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="px-4 py-3 text-gray-500 text-sm">
            No results found for &quot;{query}&quot;
          </div>
        </div>
      )}
    </div>
  );
}
