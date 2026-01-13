'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import WordNetExplorer from '@/components/WordNetExplorer';
import LoadingSpinner from '@/components/LoadingSpinner';

function GraphContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const entryId = searchParams.get('entry');

  useEffect(() => {
    // Redirect to nouns table view
    router.replace('/table/nouns');
  }, [router]);

  // Default to entity.n.01 (root of noun taxonomy tree) if no entry specified
  return <WordNetExplorer initialEntryId={entryId || 'entity.n.01'} mode="nouns" />;
}

export default function NounGraphMode() {
  return (
    <Suspense fallback={<LoadingSpinner fullPage />}>
      <GraphContent />
    </Suspense>
  );
}

