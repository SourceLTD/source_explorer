'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import WordNetExplorer from '@/components/WordNetExplorer';
import LoadingSpinner from '@/components/LoadingSpinner';

function GraphContent() {
  const searchParams = useSearchParams();
  const entryId = searchParams.get('entry');

  return <WordNetExplorer initialEntryId={entryId || 'quickly.r.01'} mode="adverbs" />;
}

export default function AdverbGraphMode() {
  return (
    <Suspense fallback={<LoadingSpinner fullPage />}>
      <GraphContent />
    </Suspense>
  );
}

