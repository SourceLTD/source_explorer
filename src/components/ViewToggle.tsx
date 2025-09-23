'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface ViewToggleProps {
  currentView?: 'graph' | 'table';
}

export default function ViewToggle({ currentView }: ViewToggleProps) {
  const pathname = usePathname();
  
  // Determine current view from pathname if not provided
  const view = currentView || (pathname?.includes('table') ? 'table' : 'graph');

  return (
    <div className="flex items-center bg-white rounded-lg shadow-sm border border-gray-200 p-1">
      <Link
        href="/graph"
        className={`flex items-center px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
          view === 'graph'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
        }`}
      >
        <svg 
          className="w-4 h-4 mr-2" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M13 10V3L4 14h7v7l9-11h-7z" 
          />
        </svg>
        Graph View
      </Link>
      
      <Link
        href="/table"
        className={`flex items-center px-4 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
          view === 'table'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
        }`}
      >
        <svg 
          className="w-4 h-4 mr-2" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M3 10h18M3 6h18m-9 8h9m-9 4h9m-9-8H3m0 4h6m-6 4h6" 
          />
        </svg>
        Table View
      </Link>
    </div>
  );
}