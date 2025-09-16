'use client';

import { BreadcrumbItem } from '@/lib/types';

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  onNavigate: (id: string) => void;
}

export default function Breadcrumbs({ items, onNavigate }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav className="flex items-center space-x-2 text-sm text-gray-600">
      <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v2H8V5z" />
      </svg>
      
      {items.map((item, index) => (
        <div key={item.id} className="flex items-center">
          {index > 0 && (
            <svg className="h-4 w-4 text-gray-400 mx-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
          
          <button
            onClick={() => onNavigate(item.id)}
            className={`hover:text-blue-600 transition-colors ${
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
