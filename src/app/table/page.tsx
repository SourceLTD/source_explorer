'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TablePageLayout } from '@/components/TablePageLayout';
import FrameSensesTable from '@/components/FrameSensesTable';

function SensesTableContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    const search = searchParams?.get('search');
    if (search !== null && search !== undefined) {
      setSearchQuery(search);
    }
  }, [searchParams]);

  const tabs = (
    <>
      <button
        type="button"
        className="px-4 py-2 text-base font-medium transition-colors relative cursor-default text-blue-600 border-b-2 border-blue-600"
      >
        Senses
      </button>
      <button
        type="button"
        onClick={() => router.push('/table/frames')}
        className="px-4 py-2 text-base font-medium transition-colors relative cursor-pointer text-gray-600 hover:text-gray-900 hover:bg-gray-50"
      >
        Frames
      </button>
    </>
  );

  return (
    <TablePageLayout
      mode="frames"
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      isEditOverlayOpen={false}
      currentEntity={null}
      selectedEntityId=""
      refreshTrigger={0}
      onEditClick={async () => {}}
      onUpdate={async () => {}}
      onCloseOverlay={() => {}}
      tabs={tabs}
      searchPlaceholder="Search senses..."
    >
      <div className="mt-2 mx-6 mb-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
        <FrameSensesTable searchQuery={searchQuery} />
      </div>
    </TablePageLayout>
  );
}

export default function SensesTableMode() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading senses...</div>}>
      <SensesTableContent />
    </Suspense>
  );
}
