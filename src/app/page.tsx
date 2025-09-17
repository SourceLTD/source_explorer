'use client';

import { useSearchParams } from 'next/navigation';
import WordNetExplorer from '@/components/WordNetExplorer';

export default function Home() {
  const searchParams = useSearchParams();
  const entryId = searchParams.get('entry');

  return <WordNetExplorer initialEntryId={entryId || undefined} />;
}
