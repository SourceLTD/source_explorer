'use client';

import React from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

interface FilterSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * Collapsible accordion section used inside a filter panel. Extracted from the
 * senses DataTable FilterPanel so every filter surface shares the same look.
 */
export default function FilterSection({ title, icon, children, isOpen, onToggle }: FilterSectionProps) {
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
      {isOpen && <div className="px-6 pb-6 space-y-4">{children}</div>}
    </div>
  );
}

/**
 * Small hook that manages which accordion sections are expanded. Pass the set
 * of section keys that should start open.
 */
export function useFilterSections(initiallyOpen: string[] = []) {
  const [openSections, setOpenSections] = React.useState<Set<string>>(
    () => new Set(initiallyOpen),
  );

  const toggleSection = React.useCallback((section: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }, []);

  const openSection = React.useCallback((section: string) => {
    setOpenSections((prev) => {
      if (prev.has(section)) return prev;
      const next = new Set(prev);
      next.add(section);
      return next;
    });
  }, []);

  return { openSections, toggleSection, openSection } as const;
}
