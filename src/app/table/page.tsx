'use client';

import { useState, Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { TablePageLayout } from '@/components/TablePageLayout';
import { useTableEditOverlay } from '@/hooks/useTableEditOverlay';

function TableModeContent() {
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  const editOverlay = useTableEditOverlay('verbs');

  // Handle flaggedByJobId URL parameter
  useEffect(() => {
    const flaggedByJobIdParam = searchParams?.get('flaggedByJobId');
    if (!flaggedByJobIdParam) return;
    setSearchQuery(prev => (prev === '' ? prev : ''));
  }, [searchParams]);

  return (
    <TablePageLayout
      mode="verbs"
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      isEditOverlayOpen={editOverlay.isEditOverlayOpen}
      currentEntity={editOverlay.currentEntity}
      selectedEntityId={editOverlay.selectedEntityId}
      refreshTrigger={editOverlay.refreshTrigger}
      onEditClick={editOverlay.handleEditClick}
      onUpdate={editOverlay.handleUpdate}
      onCloseOverlay={editOverlay.handleCloseOverlay}
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
