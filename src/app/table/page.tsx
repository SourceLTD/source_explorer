'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DataTable from '@/components/DataTable';
import SearchBox from '@/components/SearchBox';
import ViewToggle, { ViewMode } from '@/components/ViewToggle';
import SignOutButton from '@/components/SignOutButton';
import { SearchResult, TableEntry, GraphNode, Frame } from '@/lib/types';
import { EditOverlay } from '@/components/editing/EditOverlay';

function TableModeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isEditOverlayOpen, setIsEditOverlayOpen] = useState(false);
  const [currentNode, setCurrentNode] = useState<GraphNode | Frame | null>(null);
  
  // Get active tab from URL params or default to 'verbs'
  const activeTab = (searchParams?.get('tab') as 'verbs' | 'frames') || 'verbs';

  const handleSearchResult = (result: SearchResult) => {
    // Navigate to the graph mode with this entry
    router.push(`/graph?entry=${result.id}`);
  };

  const handleSearchQueryChange = (query: string) => {
    setSearchQuery(query);
  };

  const handleTabChange = (tab: 'verbs' | 'frames') => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.set('tab', tab);
    // Clear sortBy and sortOrder when switching tabs to avoid invalid column errors
    params.delete('sortBy');
    params.delete('sortOrder');
    router.push(`/table?${params.toString()}`);
  };

  useEffect(() => {
    const flaggedByJobIdParam = searchParams?.get('flaggedByJobId');
    if (!flaggedByJobIdParam) return;

    setSearchQuery(prev => (prev === '' ? prev : ''));
  }, [searchParams]);

  const handleEditClick = async (entry: TableEntry | Frame) => {
    setIsEditOverlayOpen(true);
    
    // Load full entry data
    try {
      if (activeTab === 'frames') {
        // Load frame data
        const response = await fetch(`/api/frames/${entry.id}`);
        if (!response.ok) {
          throw new Error('Failed to load frame details');
        }
        const frameData: Frame = await response.json();
        setCurrentNode(frameData);
      } else {
        // Load verb/entry data
        const response = await fetch(`/api/verbs/${entry.id}/graph`);
        if (!response.ok) {
          throw new Error('Failed to load entry details');
        }
        const graphNode: GraphNode = await response.json();
        setCurrentNode(graphNode);
      }
    } catch (err) {
      console.error('Error loading entry details:', err);
    }
  };

  const handleUpdate = async () => {
    if (currentNode) {
      try {
        if (activeTab === 'frames') {
          // Reload frame data
          const response = await fetch(`/api/frames/${currentNode.id}`);
          if (response.ok) {
            const updatedFrame: Frame = await response.json();
            setCurrentNode(updatedFrame);
          }
        } else {
          // Reload verb data
          const response = await fetch(`/api/verbs/${currentNode.id}/graph?invalidate=true&t=${Date.now()}`, { cache: 'no-store' });
          if (response.ok) {
            const updatedNode: GraphNode = await response.json();
            setCurrentNode(updatedNode);
          }
        }
      } catch (err) {
        console.error('Error updating entry:', err);
      }
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="bg-white px-6 pt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/')}
              className="text-xl font-bold text-gray-900 hover:text-gray-700 cursor-pointer"
            >
              SourceNet
            </button>
            <div className="h-6 w-px bg-gray-300"></div>
            <h1 className="text-xl font-bold text-gray-900">
              {activeTab === 'verbs' ? 'Verbs' : 'Frames'}
            </h1>
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
            <SignOutButton />
          </div>

        </div>
        
        {/* Tab Switcher */}
        <div className="px-6">
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleTabChange('verbs')}
              className={`px-4 py-2 text-sm font-medium transition-colors relative cursor-pointer ${
                activeTab === 'verbs'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              Verbs
            </button>
            <button
              onClick={() => handleTabChange('frames')}
              className={`px-4 py-2 text-sm font-medium transition-colors relative cursor-pointer ${
                activeTab === 'frames'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              Frames
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col bg-white">
        {/* Data Table */}
        <div className="mx-6 mb-6 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading...</div>}>
            <DataTable 
              searchQuery={searchQuery}
              mode={activeTab}
              onEditClick={handleEditClick}
            />
          </Suspense>
        </div>
      </main>

      {/* Edit Overlay */}
      {currentNode && (
        <EditOverlay
          node={currentNode}
          mode={activeTab}
          isOpen={isEditOverlayOpen}
          onClose={() => setIsEditOverlayOpen(false)}
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
