'use client';

import { BreadcrumbItem } from '@/lib/types';

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  onNavigate: (id: string) => void;
}

export default function Breadcrumbs({ items, onNavigate }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav className="flex items-start flex-wrap gap-x-1 gap-y-1 text-sm text-gray-600">
      {items.map((item, index) => (
        <div key={item.id} className="flex items-center">
          {index > 0 && (
            <svg className="h-4 w-4 text-gray-400 mx-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
          
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
