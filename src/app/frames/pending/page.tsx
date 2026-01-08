'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import SearchBox from '@/components/SearchBox';
import ViewToggle, { ViewMode } from '@/components/ViewToggle';
import PendingChangesButton from '@/components/PendingChangesButton';
import SignOutButton from '@/components/SignOutButton';
import CategoryDropdown from '@/components/CategoryDropdown';
import { SearchResult } from '@/lib/types';
import PendingChangesList from '@/components/PendingChangesList';

function PendingChangesContent() {
  const router = useRouter();

  const handleSearchResult = (result: SearchResult) => {
    // Navigate to the graph mode with this frame
    router.push(`/graph/frames?entry=${result.id}`);
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
              Source Console
            </button>
            <div className="h-6 w-px bg-gray-300"></div>
            <CategoryDropdown currentCategory="frames" currentView="table" />
          </div>
          
          <div className="flex items-center gap-4 flex-1 justify-end">
            <div className="flex-1 max-w-2xl">
              <SearchBox 
                onSelectResult={handleSearchResult}
                onSearchChange={() => {}}
                placeholder="Search frames..."
                mode="frames"
              />
            </div>
            <ViewToggle 
              currentView="table" // Keep it as table or something neutral
              grayscale={true}
              onViewChange={(view: ViewMode) => {
                if (view === 'graph') {
                  router.push('/graph/frames?view=graph');
                } else if (view === 'recipes') {
                  router.push('/graph/frames?view=recipes');
                } else if (view === 'table') {
                  router.push('/table/frames');
                }
              }}
            />
            <PendingChangesButton isActive={true} />
            <SignOutButton />
          </div>

        </div>
      </header>

      {/* Main Content - Full width */}
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="w-full px-6 py-8">
          <PendingChangesList />
        </div>
      </main>
    </div>
  );
}

export default function PendingChangesPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center">
      <div className="animate-spin h-12 w-12 border-2 border-gray-300 border-t-blue-600 rounded-full"></div>
    </div>}>
      <PendingChangesContent />
    </Suspense>
  );
}
