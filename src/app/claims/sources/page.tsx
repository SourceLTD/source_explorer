'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import SignOutButton from '@/components/SignOutButton';
import ChatButton from '@/components/ChatButton';
import PendingChangesButton from '@/components/PendingChangesButton';
import SourceListPanel from '@/components/claims/SourceListPanel';
import SourceDetailPane from '@/components/claims/SourceDetailPane';

function ClaimsSourcesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('source'));

  useEffect(() => {
    setSelectedId(searchParams.get('source'));
  }, [searchParams]);

  const selectSource = (id: string | null) => {
    setSelectedId(id);
    const params = new URLSearchParams(searchParams.toString());
    if (id) {
      params.set('source', id);
    } else {
      params.delete('source');
    }
    const qs = params.toString();
    router.replace(qs ? `/claims/sources?${qs}` : '/claims/sources', { scroll: false });
  };

  return (
    <div className="h-screen-zoomed flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="text-xl font-bold text-gray-900 hover:text-gray-700 cursor-pointer shrink-0"
            >
              Source Console
            </button>
            <div className="flex items-center gap-1 ml-2">
              <button
                type="button"
                onClick={() => router.push('/table')}
                className="px-4 py-2 text-base font-medium transition-colors relative cursor-pointer text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              >
                Senses
              </button>
              <button
                type="button"
                onClick={() => router.push('/graph/concepts')}
                className="px-4 py-2 text-base font-medium transition-colors relative cursor-pointer text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              >
                Concepts
              </button>
              <button
                type="button"
                className="px-4 py-2 text-base font-medium transition-colors relative cursor-default text-blue-600 border-b-2 border-blue-600"
              >
                Claims
              </button>
            </div>
            <div className="flex items-center gap-1 ml-4 border-l border-gray-200 pl-4">
              <Link
                href="/claims"
                className="px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded"
              >
                Graph
              </Link>
              <span className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded">
                Sources
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PendingChangesButton />
            <ChatButton />
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <SourceListPanel selected={selectedId} onSelect={selectSource} />
        <SourceDetailPane sourceId={selectedId} />
      </div>
    </div>
  );
}

export default function ClaimsSourcesPage() {
  return (
    <Suspense fallback={<div className="h-screen-zoomed bg-gray-50" />}>
      <ClaimsSourcesContent />
    </Suspense>
  );
}
