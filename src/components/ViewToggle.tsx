'use client';

import React from 'react';
import { TableCellsIcon, ArrowTurnLeftDownIcon, ArrowTurnRightDownIcon, ArrowDownIcon } from '@heroicons/react/24/outline';

export type ViewMode = 'graph' | 'table';

interface ViewToggleProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  className?: string;
}

export default function ViewToggle({ currentView, onViewChange, className }: ViewToggleProps) {
  return (
    <div className={`relative inline-flex items-center bg-gray-100 rounded-xl p-1 shadow-inner ${className || ''}`}>
      {/* Sliding background indicator */}
      <div
        className={`absolute top-1 bottom-1 w-12 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg shadow-md transform transition-transform duration-300 ease-out ${
          currentView === 'table' ? 'translate-x-0' : 'translate-x-12'
        }`}
      />
      
      {/* Table button */}
      <button
        onClick={() => onViewChange('table')}
        className={`relative z-10 flex items-center justify-center w-12 h-10 rounded-lg transition-colors duration-200 ease-out cursor-pointer ${
          currentView === 'table'
            ? 'text-white'
            : 'text-gray-500 hover:text-gray-700'
        }`}
        title="Table View"
      >
        <TableCellsIcon className="w-5 h-5" />
      </button>
      
      {/* Graph button */}
      <button
        onClick={() => onViewChange('graph')}
        className={`relative z-10 flex items-center justify-center w-12 h-10 rounded-lg transition-colors duration-200 ease-out cursor-pointer ${
          currentView === 'graph'
            ? 'text-white'
            : 'text-gray-500 hover:text-gray-700'
        }`}
        title="Graph View"
      >
        <div className="relative w-8 h-7 mt-2.5">
          <ArrowTurnLeftDownIcon className="absolute w-4 h-4 top-0 left-0" />
          <ArrowDownIcon className="absolute w-4 h-4 top-0 left-1/2 transform -translate-x-1/2" />
          <ArrowTurnRightDownIcon className="absolute w-4 h-4 top-0 right-0" />
        </div>
      </button>
    </div>
  );
}