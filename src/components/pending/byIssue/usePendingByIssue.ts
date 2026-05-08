'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PendingByIssueResponse } from './types';

interface UsePendingByIssueResult {
  data: PendingByIssueResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Tiny client hook around `GET /api/changesets/pending/by-issue`.
 *
 * Both the Cards and Inbox views use the same hook so a per-issue
 * commit/reject in one view immediately refreshes the other if both
 * happen to be mounted (they aren't today, but it's free).
 */
export function usePendingByIssue(): UsePendingByIssueResult {
  const [data, setData] = useState<PendingByIssueResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/changesets/pending/by-issue');
      if (!res.ok) throw new Error('Failed to load pending changes by issue');
      const json = (await res.json()) as PendingByIssueResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, isLoading, error, refetch };
}
