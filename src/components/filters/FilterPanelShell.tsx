'use client';

import React, { useEffect, useRef } from 'react';
import { FunnelIcon, XMarkIcon, XCircleIcon } from '@heroicons/react/24/outline';

interface FilterPanelShellProps {
  isOpen: boolean;
  onToggle: () => void;
  /** Number shown in the toggle-button badge and the footer summary. */
  activeFilterCount: number;
  onClearAll: () => void;
  /** The filter sections (typically <FilterSection> children). */
  children: React.ReactNode;
  /** Label next to the funnel icon on the toggle button. */
  buttonLabel?: string;
  /** Tailwind width class for the dropdown panel. */
  panelWidthClass?: string;
  /** Tailwind max-height class for the scrollable sections area. */
  bodyMaxHeightClass?: string;
  /** Extra classes for the dropdown panel (e.g. positioning overrides). */
  panelClassName?: string;
}

/**
 * Generic filter-panel chrome: the toggle button (with active-count badge), the
 * anchored dropdown, its header (title + clear-all + close), the scrollable
 * body, the active-filters footer, and outside-click-to-close. Surface-specific
 * sections are passed as `children`.
 *
 * The wrapping element must be `position: relative` so the dropdown anchors to
 * the button — callers typically render this inside `<div className="relative">`.
 */
export default function FilterPanelShell({
  isOpen,
  onToggle,
  activeFilterCount,
  onClearAll,
  children,
  buttonLabel = 'Filters',
  panelWidthClass = 'w-[32rem]',
  bodyMaxHeightClass = 'max-h-[32rem]',
  panelClassName,
}: FilterPanelShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hasActiveFilters = activeFilterCount > 0;

  // Close the panel when clicking outside of it (and outside the toggle button).
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

    // Small delay so the opening click doesn't immediately close it.
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onToggle]);

  return (
    <>
      {/* Toggle button */}
      <button
        ref={buttonRef}
        onClick={onToggle}
        className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-gray-300 rounded-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors cursor-pointer ${
          hasActiveFilters ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-white text-gray-700'
        }`}
      >
        <FunnelIcon className="w-4 h-4" />
        <span>{buttonLabel}</span>
        {activeFilterCount > 0 && (
          <span className="bg-blue-600 text-white text-xs rounded-full px-2 py-0.5 min-w-[1.25rem] text-center">
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className={`absolute top-full left-0 mt-2 ${panelWidthClass} bg-white border border-gray-200 rounded-xl shadow-lg z-50 ${panelClassName || ''}`}
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

          {/* Sections */}
          <div className={`${bodyMaxHeightClass} overflow-y-auto`}>{children}</div>

          {/* Active-filters footer */}
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
