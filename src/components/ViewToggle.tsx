'use client';

import React from 'react';
import { TableCellsIcon, ArrowTurnLeftDownIcon, ArrowTurnRightDownIcon, ArrowDownIcon, NewspaperIcon } from '@heroicons/react/24/outline';

export type ViewMode = 'graph' | 'table' | 'recipes';

interface ViewToggleProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  className?: string;
  hideRecipes?: boolean;
}

export default function ViewToggle({ currentView, onViewChange, className, hideRecipes = false }: ViewToggleProps) {
  // Calculate the transform position for the sliding background
  const getTransformClass = () => {
    if (hideRecipes) {
      // Only 2 buttons, adjust positions
      switch (currentView) {
        case 'table':
          return 'translate-x-0';
        case 'graph':
          return 'translate-x-10';
        default:
          return 'translate-x-0';
      }
    } else {
      // 3 buttons
      switch (currentView) {
        case 'table':
          return 'translate-x-0';
        case 'graph':
          return 'translate-x-10';
        case 'recipes':
          return 'translate-x-20';
        default:
          return 'translate-x-0';
      }
    }
  };

  return (
    <div className={`relative inline-flex items-center bg-gray-100 rounded-xl border border-gray-300 ${className || ''}`}>
      {/* Sliding background indicator */}
      <div
        className={`absolute top-0.5 bottom-0.5 left-0.5 w-9 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg shadow-lg transform transition-transform duration-300 ease-out ${getTransformClass()}`}
      />
      
      {/* Table button */}
      <button
        onClick={() => onViewChange('table')}
        className={`relative z-10 flex items-center justify-center w-10 py-2.5 rounded-xl transition-colors duration-300 ease-out cursor-pointer ${
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
        className={`relative z-10 flex items-center justify-center w-10 py-2.5 rounded-xl transition-colors duration-300 ease-out cursor-pointer ${
          currentView === 'graph'
            ? 'text-white'
            : 'text-gray-500 hover:text-gray-700'
        }`}
        title="Graph View"
      >
        <div className="relative w-7 h-4 flex items-end -mt-0.5">
          <ArrowTurnLeftDownIcon className="absolute w-3.5 h-3.5 bottom-0 left-0" />
          <ArrowDownIcon className="absolute w-3.5 h-3.5 bottom-0 left-1/2 transform -translate-x-1/2" />
          <ArrowTurnRightDownIcon className="absolute w-3.5 h-3.5 bottom-0 right-0" />
        </div>
      </button>
      
      {/* Recipes button */}
      {!hideRecipes && (
        <button
          onClick={() => onViewChange('recipes')}
          className={`relative z-10 flex items-center justify-center w-10 py-2.5 rounded-xl transition-colors duration-300 ease-out cursor-pointer ${
            currentView === 'recipes'
              ? 'text-white'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          title="Recipes View"
        >
          <NewspaperIcon className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}