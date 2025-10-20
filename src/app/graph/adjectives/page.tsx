'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import WordNetExplorer from '@/components/WordNetExplorer';

function GraphContent() {
  const searchParams = useSearchParams();
  const entryId = searchParams.get('entry');

  // Adjectives don't have a single root, so no default entry
  return <WordNetExplorer initialEntryId={entryId || undefined} mode="adjectives" />;
}

export default function AdjectiveGraphMode() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center">
      <div className="animate-spin h-12 w-12 border-2 border-gray-300 border-t-blue-600 rounded-full"></div>
    </div>}>
      <GraphContent />
    </Suspense>
  );
}

