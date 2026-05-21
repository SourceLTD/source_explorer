'use client';

import { Suspense } from 'react';
import ClaimsExplorer from '@/components/claims/ClaimsExplorer';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function ClaimsPage() {
  return (
    <Suspense fallback={<LoadingSpinner fullPage />}>
      <ClaimsExplorer />
    </Suspense>
  );
}
