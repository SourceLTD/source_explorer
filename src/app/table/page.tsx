'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TablePageLayout } from '@/components/TablePageLayout';
import { useTableEditOverlay } from '@/hooks/useTableEditOverlay';

function TableModeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Changed mode to 'lexical_units'
  const editOverlay = useTableEditOverlay('lexical_units' as any);

  const tabs = (
    <div className="flex items-center gap-1">
      <button
        onClick={() => router.push('/table/super-frames')}
        className="px-4 py-2 text-sm font-medium transition-colors relative cursor-pointer text-gray-600 hover:text-gray-900 hover:bg-gray-50"
      >
        Super Frames
      </button>
      <button
        onClick={() => router.push('/table/frames')}
        className="px-4 py-2 text-sm font-medium transition-colors relative cursor-pointer text-gray-600 hover:text-gray-900 hover:bg-gray-50"
      >
        Frames
      </button>
      <button className="px-4 py-2 text-sm font-medium transition-colors relative cursor-pointer text-blue-600 border-b-2 border-blue-600">
        Lexical Entries
      </button>
    </div>
  );

  useEffect(() => {
    const search = searchParams?.get('search');
    if (search !== null) {
      setSearchQuery(search);
      return;
    }
    const flaggedByJobIdParam = searchParams?.get('flaggedByJobId');
    if (!flaggedByJobIdParam) return;
    setSearchQuery('');
  }, [searchParams]);

  return (
    <TablePageLayout
      mode="lexical_units"
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
    />
  );
}

export default function TableMode() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading table view...</div>}>
      <TableModeContent />
    </Suspense>
  );
}
