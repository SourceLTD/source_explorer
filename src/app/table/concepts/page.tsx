'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TablePageLayout } from '@/components/TablePageLayout';
import { useTableEditOverlay } from '@/hooks/useTableEditOverlay';
import DataTable from '@/components/DataTable';

function ConceptsTableModeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const editOverlay = useTableEditOverlay('concepts');

  useEffect(() => {
    const search = searchParams?.get('search');
    if (search !== null) {
      setSearchQuery(search);
    }
  }, [searchParams]);

  const tabs = (
    <>
      <button
        type="button"
        onClick={() => router.push('/table')}
        className="px-4 py-2 text-base font-medium transition-colors relative cursor-pointer text-gray-600 hover:text-gray-900 hover:bg-gray-50"
      >
        Senses
      </button>
      <button
        type="button"
        className="px-4 py-2 text-base font-medium transition-colors relative cursor-default text-blue-600 border-b-2 border-blue-600"
      >
        Concepts
      </button>
      <button
        type="button"
        onClick={() => router.push('/claims')}
        className="px-4 py-2 text-base font-medium transition-colors relative cursor-pointer text-gray-600 hover:text-gray-900 hover:bg-gray-50"
      >
        Claims
      </button>
    </>
  );

  return (
    <TablePageLayout
      mode="concepts"
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
      showViewToggle
      showSensesLink
    >
      <div className="mt-2 mx-6 mb-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
        <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading...</div>}>
          <DataTable 
            searchQuery={searchQuery}
            mode="concepts"
            onEditClick={editOverlay.handleEditClick}
            refreshTrigger={editOverlay.refreshTrigger}
          />
        </Suspense>
      </div>
    </TablePageLayout>
  );
}

export default function ConceptsTableMode() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading concepts...</div>}>
      <ConceptsTableModeContent />
    </Suspense>
  );
}
