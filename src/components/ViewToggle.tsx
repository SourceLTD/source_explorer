'use client';

import React from 'react';

export type ViewMode = 'graph' | 'table';

interface ViewToggleProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  className?: string;
}

export default function ViewToggle({ currentView, onViewChange, className }: ViewToggleProps) {
  return (
    <div className={`inline-flex rounded-lg border border-gray-300 bg-white ${className || ''}`}>
      <button
        onClick={() => onViewChange('graph')}
        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-l-lg transition-colors ${
          currentView === 'graph'
            ? 'bg-blue-600 text-white'
            : 'text-gray-700 hover:bg-gray-50'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        Graph
      </button>
      <button
        onClick={() => onViewChange('table')}
        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-r-lg transition-colors ${
          currentView === 'table'
            ? 'bg-blue-600 text-white'
            : 'text-gray-700 hover:bg-gray-50'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Table
      </button>
    </div>
  );
}