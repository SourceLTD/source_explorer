'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import FrameExplorer from '@/components/FrameExplorer';

function FrameGraphContent() {
  const searchParams = useSearchParams();
  const frameId = searchParams.get('entry');

  return <FrameExplorer initialFrameId={frameId || undefined} />;
}

export default function FrameGraphMode() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center">
      <div className="animate-spin h-12 w-12 border-2 border-gray-300 border-t-purple-600 rounded-full"></div>
    </div>}>
      <FrameGraphContent />
    </Suspense>
  );
}


