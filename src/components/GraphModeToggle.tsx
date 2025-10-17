'use client';

import React from 'react';

export type GraphMode = 'troponymy' | 'recipes';

interface GraphModeToggleProps {
  mode: GraphMode;
  onChange: (mode: GraphMode) => void;
  className?: string;
}

export default function GraphModeToggle({ mode, onChange, className }: GraphModeToggleProps) {
  return (
    <div className={`relative inline-flex items-center bg-gray-100 rounded-xl p-1 shadow-inner ${className || ''}`}>
      <div
        className={`absolute top-1 bottom-1 w-28 bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-lg shadow-md transform transition-transform duration-300 ease-out ${
          mode === 'troponymy' ? 'translate-x-0' : 'translate-x-28'
        }`}
      />
      <button
        onClick={() => onChange('troponymy')}
        className={`relative z-10 flex items-center justify-center w-28 h-10 rounded-lg transition-colors duration-200 ease-out cursor-pointer ${
          mode === 'troponymy' ? 'text-white' : 'text-gray-600 hover:text-gray-800'
        }`}
        title="Troponymy"
      >
        Troponymy
      </button>
      <button
        onClick={() => onChange('recipes')}
        className={`relative z-10 flex items-center justify-center w-28 h-10 rounded-lg transition-colors duration-200 ease-out cursor-pointer ${
          mode === 'recipes' ? 'text-white' : 'text-gray-600 hover:text-gray-800'
        }`}
        title="Recipes"
      >
        Recipes
      </button>
    </div>
  );
}


