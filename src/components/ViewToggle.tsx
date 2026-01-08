'use client';

import React from 'react';
import { TableCellsIcon, ArrowTurnLeftDownIcon, ArrowTurnRightDownIcon, ArrowDownIcon, NewspaperIcon } from '@heroicons/react/24/outline';

export type ViewMode = 'graph' | 'table' | 'recipes';

interface ViewToggleProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  className?: string;
  hideRecipes?: boolean;
  grayscale?: boolean;
}

export default function ViewToggle({ currentView, onViewChange, className, hideRecipes = false, grayscale = false }: ViewToggleProps) {
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
    <div className={`relative inline-flex items-center rounded-xl border transition-colors ${
      grayscale 
        ? 'bg-gray-200 border-gray-400 focus-within:ring-gray-400' 
        : 'bg-gray-100 border-gray-300 hover:bg-blue-50 hover:border-blue-300 focus-within:ring-blue-500'
    } focus-within:ring-2 focus-within:ring-offset-2 ${className || ''}`}>
      {/* Sliding background indicator */}
      <div
        className={`absolute top-0 bottom-0 left-0 w-10 rounded-[11px] transform transition-transform duration-300 ease-out ${getTransformClass()} ${
          grayscale 
            ? 'bg-gradient-to-r from-gray-400 to-gray-500' 
            : 'bg-gradient-to-r from-blue-500 to-blue-600'
        }`}
      />
      
      {/* Table button */}
      <button
        onClick={() => onViewChange('table')}
        className={`relative z-10 flex items-center justify-center w-10 py-2.5 rounded-xl transition-colors duration-300 ease-out cursor-pointer focus:outline-none ${
          currentView === 'table'
            ? 'text-white'
            : grayscale ? 'text-gray-500 hover:text-gray-700' : 'text-gray-700 hover:text-blue-700'
        }`}
        title="Table View"
      >
        <TableCellsIcon className="w-5 h-5" />
      </button>
      
      {/* Graph button */}
      <button
        onClick={() => onViewChange('graph')}
        className={`relative z-10 flex items-center justify-center w-10 py-2.5 rounded-xl transition-colors duration-300 ease-out cursor-pointer focus:outline-none ${
          currentView === 'graph'
            ? 'text-white'
            : grayscale ? 'text-gray-500 hover:text-gray-700' : 'text-gray-700 hover:text-blue-700'
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
          className={`relative z-10 flex items-center justify-center w-10 py-2.5 rounded-xl transition-colors duration-300 ease-out cursor-pointer focus:outline-none ${
            currentView === 'recipes'
              ? 'text-white'
              : grayscale ? 'text-gray-500 hover:text-gray-700' : 'text-gray-700 hover:text-blue-700'
          }`}
          title="Recipes View"
        >
          <NewspaperIcon className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}