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
    // Redirect all top-level graph requests to table view
    router.replace('/table');
  }, [router]);

  return <WordNetExplorer initialEntryId={entryId || undefined} />;
}

export default function GraphMode() {
  return (
    <Suspense fallback={<LoadingSpinner fullPage />}>
      <GraphContent />
    </Suspense>
  );
}





