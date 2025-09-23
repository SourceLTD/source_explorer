'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import WordNetExplorer from '@/components/WordNetExplorer';

function GraphContent() {
  const searchParams = useSearchParams();
  const entryId = searchParams.get('entry');

  return <WordNetExplorer initialEntryId={entryId || undefined} />;
}

export default function GraphMode() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center">
      <div className="animate-spin h-12 w-12 border-2 border-gray-300 border-t-blue-600 rounded-full"></div>
    </div>}>
      <GraphContent />
    </Suspense>
  );
}





