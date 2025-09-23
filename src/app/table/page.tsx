'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/DataTable';
import SearchBox from '@/components/SearchBox';
import ViewToggle from '@/components/ViewToggle';
import { TableEntry } from '@/lib/types';

export default function TablePage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');

  const handleRowClick = (entry: TableEntry) => {
    // Navigate to the graph view with this entry selected
    router.push(`/graph?id=${entry.id}`);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">WordNet Explorer</h1>
              <p className="mt-2 text-gray-600">
                Explore lexical entries with advanced filtering and search capabilities
              </p>
            </div>
            <ViewToggle currentView="table" />
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <SearchBox onSearch={handleSearch} />
        </div>

        {/* Data Table */}
        <DataTable 
          onRowClick={handleRowClick}
          searchQuery={searchQuery}
          className="w-full"
        />
      </div>
    </div>
  );
}