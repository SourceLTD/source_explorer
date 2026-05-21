'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ConceptExplorer from '@/components/ConceptExplorer';
import LoadingSpinner from '@/components/LoadingSpinner';

function ConceptGraphContent() {
  const searchParams = useSearchParams();
  const conceptId = searchParams.get('entry');

  return <ConceptExplorer initialConceptId={conceptId || undefined} />;
}

export default function ConceptGraphMode() {
  return (
    <Suspense fallback={<LoadingSpinner fullPage />}>
      <ConceptGraphContent />
    </Suspense>
  );
}


