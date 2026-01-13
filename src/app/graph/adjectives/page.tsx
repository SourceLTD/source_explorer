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
    // Redirect to adjectives table view
    router.replace('/table/adjectives');
  }, [router]);

  return <WordNetExplorer initialEntryId={entryId || 'cheery.s.01'} mode="adjectives" />;
}

export default function AdjectiveGraphMode() {
  return (
    <Suspense fallback={<LoadingSpinner fullPage />}>
      <GraphContent />
    </Suspense>
  );
}


