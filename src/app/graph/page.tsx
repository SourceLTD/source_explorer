'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import WordNetExplorer from '@/components/WordNetExplorer';
import LoadingSpinner from '@/components/LoadingSpinner';

function GraphContent() {
  const searchParams = useSearchParams();
  const entryId = searchParams.get('entry');

  return <WordNetExplorer initialEntryId={entryId || undefined} />;
}

export default function GraphMode() {
  return (
    <Suspense fallback={<LoadingSpinner fullPage />}>
      <GraphContent />
    </Suspense>
  );
}





