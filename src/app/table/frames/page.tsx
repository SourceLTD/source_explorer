'use client';

import { useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/DataTable';
import SearchBox from '@/components/SearchBox';
import SignOutButton from '@/components/SignOutButton';
import { SearchResult, Frame } from '@/lib/types';
import { EditOverlay } from '@/components/editing/EditOverlay';

export default function FramesTableMode() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null);
  const [isEditOverlayOpen, setIsEditOverlayOpen] = useState(false);
  const [isLoadingFrame, setIsLoadingFrame] = useState(false);
  const [, setRefreshTrigger] = useState(0);

  const handleSearchResult = (result: SearchResult) => {
    // Navigate to the graph mode with this frame
    router.push(`/graph/frames?entry=${result.id}`);
  };

  const handleSearchQueryChange = (query: string) => {
    setSearchQuery(query);
  };

  const handleEditClick = async (entry: unknown) => {
    console.log('[FramesTableMode] handleEditClick called with:', entry);
    const frame = entry as Frame;
    
    setIsLoadingFrame(true);
    try {
      console.log('Fetching frame data for ID:', frame.id);
      // Fetch the full frame data with frame_roles
      const response = await fetch(`/api/frames/${frame.id}`);
      console.log('Response status:', response.status);
      
      if (response.ok) {
        const fullFrame = await response.json();
        console.log('Full frame loaded:', fullFrame);
        setSelectedFrame(fullFrame);
        setIsEditOverlayOpen(true);
      } else {
        const errorText = await response.text();
        console.error('Failed to fetch frame:', response.status, errorText);
        alert(`Failed to load frame: ${response.status}`);
      }
    } catch (error) {
      console.error('Error loading frame for editing:', error);
      alert('Error loading frame for editing. Check console for details.');
    } finally {
      setIsLoadingFrame(false);
    }
  };

  const handleCloseOverlay = () => {
    setIsEditOverlayOpen(false);
    setSelectedFrame(null);
  };

  const handleUpdate = async () => {
    // Trigger a refresh of the table
    setRefreshTrigger(prev => prev + 1);
    // If we have a selected frame, reload it
    if (selectedFrame) {
      try {
        const response = await fetch(`/api/frames/${selectedFrame.id}`);
        if (response.ok) {
          const updatedFrame = await response.json();
          setSelectedFrame(updatedFrame);
        }
      } catch (error) {
        console.error('Error reloading frame:', error);
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
              SourceNet
            </button>
            <div className="h-6 w-px bg-gray-300"></div>
            <h1 className="text-xl font-bold text-gray-900">
              Frames
            </h1>
          </div>
          
          <div className="flex items-center gap-4 flex-1 justify-end">
            <div className="flex-1 max-w-2xl">
              <SearchBox 
                onSelectResult={handleSearchResult}
                onSearchChange={handleSearchQueryChange}
                placeholder="Search frames..."
                mode="verbs"
              />
            </div>
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
            mode="frames"
            onEditClick={(entry) => {
              console.log('[DataTable onEditClick wrapper] Received entry:', entry);
              handleEditClick(entry);
            }}
          />
          </Suspense>
        </div>
      </main>

      {/* Loading indicator */}
      {isLoadingFrame && (
        <div className="fixed inset-0 bg-black bg-opacity-25 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 shadow-xl">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-700">Loading frame...</p>
          </div>
        </div>
      )}

      {/* Edit Overlay */}
      {selectedFrame && isEditOverlayOpen && (
        <EditOverlay
          node={selectedFrame}
          mode="frames"
          isOpen={isEditOverlayOpen}
          onClose={handleCloseOverlay}
          onUpdate={handleUpdate}
        />
      )}
    </div>
  );
}

