'use client';

import { useRouter } from 'next/navigation';

export type Category = 'frames' | 'lexical_units' | 'verbs' | 'nouns' | 'adjectives' | 'adverbs';

interface CategoryDropdownProps {
  currentCategory: Category;
  currentView?: 'table' | 'graph';
}

const CATEGORIES: { id: Category; label: string; tablePath: string; graphPath?: string }[] = [
  { id: 'frames', label: 'Frames', tablePath: '/table/frames', graphPath: '/graph/frames' },
  { id: 'lexical_units', label: 'Lexical Entries', tablePath: '/table' },
];

export default function CategoryDropdown({ currentCategory, currentView = 'table' }: CategoryDropdownProps) {
  const router = useRouter();

  const normalizedCategory = (['verbs', 'nouns', 'adjectives', 'adverbs'].includes(currentCategory)) 
    ? 'lexical_units' 
    : currentCategory;

  return (
    <div className="flex items-center gap-8">
      {CATEGORIES.map((category) => {
        const isActive = category.id === normalizedCategory;
        return (
          <button
            key={category.id}
            onClick={() => {
              if (isActive) return;
              const path = (currentView === 'graph' && category.graphPath) ? category.graphPath : category.tablePath;
              router.push(path);
            }}
            className={`text-xl font-bold transition-all cursor-pointer hover:opacity-70 ${
              isActive 
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 bg-clip-text text-transparent' 
                : 'text-gray-900'
            }`}
          >
            {category.label}
          </button>
        );
      })}
    </div>
  );
}

