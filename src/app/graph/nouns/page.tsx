'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import WordNetExplorer from '@/components/WordNetExplorer';
import LoadingSpinner from '@/components/LoadingSpinner';

function GraphContent() {
  const searchParams = useSearchParams();
  const unitId = searchParams.get('entry');

  // Default to entity.n.01 (root of noun taxonomy tree) if no entry specified
  return <WordNetExplorer initialEntryId={unitId || 'entity.n.01'} mode="nouns" />;
}

export default function NounGraphMode() {
  return (
    <Suspense fallback={<LoadingSpinner fullPage />}>
      <GraphContent />
    </Suspense>
  );
}

