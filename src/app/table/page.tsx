'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TablePageLayout } from '@/components/TablePageLayout';
import DataTable from '@/components/DataTable';

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
        onClick={() => router.push('/table')}
        className="px-4 py-2 text-base font-medium transition-colors relative cursor-default text-blue-600 border-b-2 border-blue-600"
      >
        Senses
      </button>
      <button
        type="button"
        onClick={() => router.push('/graph/concepts')}
        className="px-4 py-2 text-base font-medium transition-colors relative cursor-pointer text-gray-600 hover:text-gray-900 hover:bg-gray-50"
      >
        Concepts
      </button>
      <button
        type="button"
        onClick={() => router.push('/table/referents')}
        className="px-4 py-2 text-base font-medium transition-colors relative cursor-pointer text-gray-600 hover:text-gray-900 hover:bg-gray-50"
      >
        Referents
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
      <div className="px-6 pt-4 pb-1 flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.push('/graph/concepts')}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Concepts
        </button>
        <span className="text-gray-400">/</span>
        <span className="text-sm font-medium text-gray-900">Senses</span>
      </div>
      <div className="mt-2 mx-6 mb-6 bg-white rounded-xl border border-gray-200 overflow-hidden flex-1 min-h-0 flex flex-col">
        <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading senses...</div>}>
          <DataTable searchQuery={searchQuery} mode="senses" refreshTrigger={0} />
        </Suspense>
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
