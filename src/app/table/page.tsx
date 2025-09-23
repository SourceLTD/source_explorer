'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/DataTable';
import SearchBox from '@/components/SearchBox';
import ViewToggle, { ViewMode } from '@/components/ViewToggle';
import { TableEntry, SearchResult } from '@/lib/types';

export default function TableMode() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState<string>('');

  const handleTableRowClick = (entry: TableEntry) => {
    // Navigate to the graph mode with this entry
    router.push(`/graph?entry=${entry.id}`);
  };

  const handleSearchResult = (result: SearchResult) => {
    // Navigate to the graph mode with this entry
    router.push(`/graph?entry=${result.id}`);
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
              className="flex items-center gap-2 text-blue-600 hover:text-blue-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="text-sm font-medium">SourceNet</span>
            </button>
            <div className="h-6 w-px bg-gray-300"></div>
            <h1 className="text-xl font-bold text-gray-900">
              Verbs
            </h1>
            <p className="text-sm text-gray-600">
              Browse and search through all lexical entries
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <SearchBox 
              onSelectResult={handleSearchResult}
              onSearchChange={handleSearchQueryChange}
              placeholder="Search table..."
            />
            <ViewToggle 
              currentView="table"
              onViewChange={(view: ViewMode) => {
                if (view === 'graph') {
                  router.push('/graph');
                }
              }}
            />
          </div>

        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col bg-white">
        {/* Data Table */}
        <div className="m-6 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <DataTable 
            onRowClick={handleTableRowClick}
            searchQuery={searchQuery}
          />
        </div>
      </main>
    </div>
  );
}







