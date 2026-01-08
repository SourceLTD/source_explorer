'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDownIcon, CheckIcon } from '@heroicons/react/24/outline';

export type Category = 'frames' | 'verbs' | 'nouns' | 'adjectives' | 'adverbs';

interface CategoryDropdownProps {
  currentCategory: Category;
  currentView?: 'table' | 'graph';
}

const CATEGORIES: { id: Category; label: string; tablePath: string; graphPath: string }[] = [
  { id: 'frames', label: 'Frames', tablePath: '/table/frames', graphPath: '/graph/frames' },
  { id: 'verbs', label: 'Verbs', tablePath: '/table', graphPath: '/graph' },
  { id: 'nouns', label: 'Nouns', tablePath: '/table/nouns', graphPath: '/graph/nouns' },
  { id: 'adjectives', label: 'Adjectives', tablePath: '/table/adjectives', graphPath: '/graph/adjectives' },
  { id: 'adverbs', label: 'Adverbs', tablePath: '/table/adverbs', graphPath: '/graph/adverbs' },
];

export default function CategoryDropdown({ currentCategory, currentView = 'table' }: CategoryDropdownProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentCategoryData = CATEGORIES.find(c => c.id === currentCategory);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const handleCategorySelect = (category: typeof CATEGORIES[0]) => {
    setIsOpen(false);
    if (category.id === currentCategory) return;
    
    // Navigate to the same view type (table or graph) for the new category
    const path = currentView === 'graph' ? category.graphPath : category.tablePath;
    router.push(path);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-xl font-bold text-gray-900 hover:text-blue-600 transition-colors cursor-pointer group"
      >
        {currentCategoryData?.label}
        <ChevronDownIcon 
          className={`w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-xl border border-gray-200 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          {CATEGORIES.map((category) => {
            const isActive = category.id === currentCategory;
            return (
              <button
                key={category.id}
                onClick={() => handleCategorySelect(category)}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors cursor-pointer ${
                  isActive 
                    ? 'bg-blue-50 text-blue-700 font-medium' 
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>{category.label}</span>
                {isActive && <CheckIcon className="w-4 h-4 text-blue-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

