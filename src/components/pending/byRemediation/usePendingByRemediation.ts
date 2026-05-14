'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PendingByRemediationResponse } from './types';

interface UsePendingByRemediationResult {
  data: PendingByRemediationResponse | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function usePendingByRemediation(): UsePendingByRemediationResult {
  const [data, setData] = useState<PendingByRemediationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/changesets/pending/by-remediation');
      if (!res.ok) throw new Error('Failed to load pending changes by remediation');
      const json = (await res.json()) as PendingByRemediationResponse;
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
