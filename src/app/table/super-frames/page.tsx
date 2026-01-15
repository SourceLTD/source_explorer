'use client';

import { useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { TablePageLayout } from '@/components/TablePageLayout';
import { useTableEditOverlay } from '@/hooks/useTableEditOverlay';
import DataTable from '@/components/DataTable';

function SuperFramesTableModeContent() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const editOverlay = useTableEditOverlay('frames');

  const tabs = (
    <div className="flex items-center gap-1">
      <button
        className="px-4 py-2 text-sm font-medium transition-colors relative cursor-pointer text-blue-600 border-b-2 border-blue-600"
      >
        Super Frames
      </button>
      <button
        onClick={() => router.push('/table/frames')}
        className="px-4 py-2 text-sm font-medium transition-colors relative cursor-pointer text-gray-600 hover:text-gray-900 hover:bg-gray-50"
      >
        Frames
      </button>
      <button
        onClick={() => router.push('/table')}
        className="px-4 py-2 text-sm font-medium transition-colors relative cursor-pointer text-gray-600 hover:text-gray-900 hover:bg-gray-50"
      >
        Lexical Entries
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
            mode="super_frames"
            onEditClick={editOverlay.handleEditClick}
            refreshTrigger={editOverlay.refreshTrigger}
          />
        </Suspense>
      </div>
    </TablePageLayout>
  );
}

export default function SuperFramesTableMode() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading super frames...</div>}>
      <SuperFramesTableModeContent />
    </Suspense>
  );
}
