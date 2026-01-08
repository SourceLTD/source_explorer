'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DataTable from '@/components/DataTable';
import SearchBox from '@/components/SearchBox';
import ViewToggle, { ViewMode } from '@/components/ViewToggle';
import PendingChangesButton from '@/components/PendingChangesButton';
import SignOutButton from '@/components/SignOutButton';
import CategoryDropdown from '@/components/CategoryDropdown';
import { SearchResult, TableEntry, GraphNode, Frame } from '@/lib/types';
import { EditOverlay } from '@/components/editing/EditOverlay';

function TableModeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isEditOverlayOpen, setIsEditOverlayOpen] = useState(false);
  const [currentNode, setCurrentNode] = useState<GraphNode | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string>('');

  const handleSearchResult = (result: SearchResult) => {
    // Navigate to the graph mode with this entry
    router.push(`/graph?entry=${result.id}`);
  };

  const handleSearchQueryChange = (query: string) => {
    setSearchQuery(query);
  };

  useEffect(() => {
    const flaggedByJobIdParam = searchParams?.get('flaggedByJobId');
    if (!flaggedByJobIdParam) return;

    setSearchQuery(prev => (prev === '' ? prev : ''));
  }, [searchParams]);

  const handleEditClick = async (entry: TableEntry | Frame) => {
    setIsEditOverlayOpen(true);
    setSelectedEntryId(entry.id);
    setCurrentNode(null); // Reset current node while loading
    
    // Load full entry data
    try {
      const response = await fetch(`/api/verbs/${entry.id}/graph`);
      if (!response.ok) {
        throw new Error('Failed to load entry details');
      }
      const graphNode: GraphNode = await response.json();
      setCurrentNode(graphNode);
    } catch (err) {
      console.error('Error loading entry details:', err);
    }
  };

  const handleUpdate = async () => {
    if (currentNode) {
      try {
        const response = await fetch(`/api/verbs/${currentNode.id}/graph?invalidate=true&t=${Date.now()}`, { cache: 'no-store' });
        if (response.ok) {
          const updatedNode: GraphNode = await response.json();
          setCurrentNode(updatedNode);
        }
      } catch (err) {
        console.error('Error updating entry:', err);
      }
    }
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
            <CategoryDropdown currentCategory="verbs" currentView="table" />
          </div>
          
          <div className="flex items-center gap-4 flex-1 justify-end">
            <div className="flex-1 max-w-2xl">
              <SearchBox 
                onSelectResult={handleSearchResult}
                onSearchChange={handleSearchQueryChange}
                placeholder="Search table..."
              />
            </div>
            <ViewToggle 
              currentView="table"
              onViewChange={(view: ViewMode) => {
                if (view === 'graph') {
                  router.push('/graph?view=graph');
                } else if (view === 'recipes') {
                  router.push('/graph?view=recipes');
                }
              }}
            />
            <PendingChangesButton />
            <SignOutButton />
          </div>

        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col bg-white">
        {/* Data Table */}
        <div className="m-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading...</div>}>
            <DataTable 
              searchQuery={searchQuery}
              mode="verbs"
              onEditClick={handleEditClick}
            />
          </Suspense>
        </div>
      </main>

      {/* Edit Overlay */}
      {isEditOverlayOpen && (
        <EditOverlay
          node={currentNode}
          nodeId={selectedEntryId}
          mode="verbs"
          isOpen={isEditOverlayOpen}
          onClose={() => {
            setIsEditOverlayOpen(false);
            setCurrentNode(null);
            setSelectedEntryId('');
          }}
          onUpdate={handleUpdate}
        />
      )}
    </div>
  );
}

export default function TableMode() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading table view...</div>}>
      <TableModeContent />
    </Suspense>
  );
}
