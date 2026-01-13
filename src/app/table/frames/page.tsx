'use client';

import { useState, Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { TablePageLayout } from '@/components/TablePageLayout';
import { useTableEditOverlay } from '@/hooks/useTableEditOverlay';
import DataTable from '@/components/DataTable';

function FramesTableModeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const editOverlay = useTableEditOverlay('frames');

  // Sync activeTab with URL param 'tab' if present, default to 'frames'
  const initialTab = (searchParams?.get('tab') as 'super_frames' | 'frames') || 'frames';
  const [activeTab, setActiveTab] = useState<'super_frames' | 'frames'>(initialTab);

  // Update local activeTab when URL tab changes (e.g. from context menu)
  useEffect(() => {
    const tabParam = searchParams?.get('tab') as 'super_frames' | 'frames';
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // Clear filters and update URL when switching tabs
  const handleTabChange = (tab: 'super_frames' | 'frames') => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.set('tab', tab);
    // When switching tabs manually, we usually want to clear the specific parent filter
    params.delete('super_frame_id');
    router.push(`/table/frames?${params.toString()}`);
  };

  const tabs = (
    <div className="flex items-center gap-1">
      <button
        onClick={() => handleTabChange('super_frames')}
        className={`px-4 py-2 text-sm font-medium transition-colors relative cursor-pointer ${
          activeTab === 'super_frames'
            ? 'text-blue-600 border-b-2 border-blue-600'
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
        }`}
      >
        Super Frames
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
  );

  return (
    <TablePageLayout
      mode="frames"
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      isEditOverlayOpen={editOverlay.isEditOverlayOpen}
      currentEntity={editOverlay.currentEntity}
      selectedEntityId={editOverlay.selectedEntityId}
      refreshTrigger={editOverlay.refreshTrigger}
      onEditClick={editOverlay.handleEditClick}
      onUpdate={editOverlay.handleUpdate}
      onCloseOverlay={editOverlay.handleCloseOverlay}
      tabs={tabs}
    >
      <div className="m-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading...</div>}>
          <DataTable 
            searchQuery={searchQuery}
            mode={activeTab === 'super_frames' ? 'super_frames' : 'frames_only'}
            onEditClick={editOverlay.handleEditClick}
            refreshTrigger={editOverlay.refreshTrigger}
          />
        </Suspense>
      </div>
    </TablePageLayout>
  );
}

export default function FramesTableMode() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading frames...</div>}>
      <FramesTableModeContent />
    </Suspense>
  );
}
