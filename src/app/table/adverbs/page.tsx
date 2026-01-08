'use client';

import { useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/DataTable';
import SearchBox from '@/components/SearchBox';
import SignOutButton from '@/components/SignOutButton';
import CategoryDropdown from '@/components/CategoryDropdown';
import { SearchResult, TableEntry, GraphNode } from '@/lib/types';
import { EditOverlay } from '@/components/editing/EditOverlay';

export default function AdverbTableMode() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isEditOverlayOpen, setIsEditOverlayOpen] = useState(false);
  const [currentNode, setCurrentNode] = useState<GraphNode | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string>('');

  const handleSearchResult = (result: SearchResult) => {
    // Navigate to the graph mode with this entry
    router.push(`/graph/adverbs?entry=${result.id}`);
  };

  const handleSearchQueryChange = (query: string) => {
    setSearchQuery(query);
  };

  const handleEditClick = async (entry: TableEntry | import('@/lib/types').Frame) => {
    setIsEditOverlayOpen(true);
    setSelectedEntryId(entry.id);
    setCurrentNode(null);
    
    // Load full entry data
    try {
      const response = await fetch(`/api/adverbs/${entry.id}/graph`);
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
        const response = await fetch(`/api/adverbs/${currentNode.id}/graph?invalidate=true&t=${Date.now()}`, { cache: 'no-store' });
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
            <CategoryDropdown currentCategory="adverbs" currentView="table" />
          </div>
          
          <div className="flex items-center gap-4 flex-1 justify-end">
            <div className="flex-1 max-w-2xl">
              <SearchBox 
                onSelectResult={handleSearchResult}
                onSearchChange={handleSearchQueryChange}
                placeholder="Search table..."
                mode="adverbs"
              />
            </div>
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
              mode="adverbs"
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
          mode="adverbs"
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

