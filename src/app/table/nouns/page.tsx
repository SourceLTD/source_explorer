'use client';

import { useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/DataTable';
import SearchBox from '@/components/SearchBox';
import ViewToggle, { ViewMode } from '@/components/ViewToggle';
import SignOutButton from '@/components/SignOutButton';
import { SearchResult } from '@/lib/types';

export default function NounTableMode() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState<string>('');

  const handleSearchResult = (result: SearchResult) => {
    // Navigate to the graph mode with this entry
    router.push(`/graph/nouns?entry=${result.id}`);
  };

  const handleSearchQueryChange = (query: string) => {
    setSearchQuery(query);
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/')}
              className="text-xl font-bold text-gray-900 hover:text-gray-700 cursor-pointer"
            >
              SourceNet
            </button>
            <div className="h-6 w-px bg-gray-300"></div>
            <h1 className="text-xl font-bold text-gray-900">
              Nouns
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <SearchBox 
              onSelectResult={handleSearchResult}
              onSearchChange={handleSearchQueryChange}
              placeholder="Search table..."
              mode="nouns"
            />
            <ViewToggle 
              currentView="table"
              onViewChange={(view: ViewMode) => {
                if (view === 'graph') {
                  router.push('/graph/nouns?view=graph');
                } else if (view === 'recipes') {
                  // Nouns don't have recipes, do nothing
                }
              }}
              hideRecipes={true}
            />
            <SignOutButton />
          </div>

        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col bg-white">
        {/* Data Table */}
        <div className="m-6 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading...</div>}>
            <DataTable 
              searchQuery={searchQuery}
              mode="nouns"
            />
          </Suspense>
        </div>
      </main>
    </div>
  );
}


