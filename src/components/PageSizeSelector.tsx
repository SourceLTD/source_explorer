'use client';

import React, { useRef, useEffect } from 'react';

interface PageSizeSelectorProps {
  isOpen: boolean;
  onToggle: () => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  totalItems?: number;
}

export default function PageSizeSelector({
  isOpen,
  onToggle,
  pageSize,
  onPageSizeChange,
  totalItems = 0
}: PageSizeSelectorProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        if (isOpen) {
          onToggle();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onToggle]);

  const pageSizeOptions = [
    { value: 10, label: '10' },
    { value: 20, label: '20' },
    { value: 50, label: '50' },
    { value: 100, label: '100' },
    { value: -1, label: totalItems > 20000 ? 'max (20,000)' : 'all' }
  ];

  const currentLabel = pageSize === -1 
    ? (totalItems > 20000 ? 'max (20,000)' : 'all')
    : pageSize.toString();

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={onToggle}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
      >
        Show: {currentLabel}
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Items per page</h3>
            
            <div className="space-y-2">
              {pageSizeOptions.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer"
                  onClick={() => {
                    onPageSizeChange(option.value);
                    onToggle();
                  }}
                >
                  <input
                    type="radio"
                    checked={pageSize === option.value}
                    onChange={() => {
                      onPageSizeChange(option.value);
                      onToggle();
                    }}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-900">
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

