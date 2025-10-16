'use client';

import { BreadcrumbItem } from '@/lib/types';

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  onNavigate: (id: string) => void;
  onHomeClick: () => void;
  onRefreshClick?: () => void;
}

export default function Breadcrumbs({ items, onNavigate, onHomeClick, onRefreshClick }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav className="flex items-start flex-wrap gap-x-1 gap-y-1 text-sm text-gray-600">
      {/* Home icon */}
      <button
        onClick={onHomeClick}
        className="flex items-center hover:text-blue-600 transition-colors cursor-pointer"
        title="Return to home"
      >
        <svg className="h-5 w-5 text-gray-500 hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      </button>
      
      {/* Refresh icon */}
      {onRefreshClick && (
        <button
          onClick={onRefreshClick}
          className="flex items-center hover:text-blue-600 transition-colors cursor-pointer ml-1"
          title="Refresh data"
        >
          <svg className="h-5 w-5 text-gray-500 hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      )}
      
      {items.map((item, index) => (
        <div key={item.id} className="flex items-center">
          <svg className="h-4 w-4 text-gray-400 mx-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          
          <button
            onClick={() => onNavigate(item.id)}
            className={`hover:text-blue-600 transition-colors whitespace-nowrap ${
              index === items.length - 1 
                ? 'text-gray-900 font-medium cursor-default' 
                : 'text-blue-500 hover:underline'
            }`}
            disabled={index === items.length - 1}
            title={item.gloss}
          >
            {item.lemma}
          </button>
        </div>
      ))}
    </nav>
  );
}
