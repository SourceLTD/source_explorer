'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import FrameExplorer from '@/components/FrameExplorer';
import LoadingSpinner from '@/components/LoadingSpinner';

function FrameGraphContent() {
  const searchParams = useSearchParams();
  const frameId = searchParams.get('entry');

  return <FrameExplorer initialFrameId={frameId || undefined} />;
}

export default function FrameGraphMode() {
  return (
    <Suspense fallback={<LoadingSpinner fullPage />}>
      <FrameGraphContent />
    </Suspense>
  );
}


