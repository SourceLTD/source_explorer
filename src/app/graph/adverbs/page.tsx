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
    // Redirect to adverbs table view
    router.replace('/table/adverbs');
  }, [router]);

  return <WordNetExplorer initialEntryId={entryId || 'quickly.r.01'} mode="adverbs" />;
}

export default function AdverbGraphMode() {
  return (
    <Suspense fallback={<LoadingSpinner fullPage />}>
      <GraphContent />
    </Suspense>
  );
}

