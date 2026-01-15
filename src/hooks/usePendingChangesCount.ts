'use client';

import { useState, useEffect, useCallback } from 'react';

// Global event emitter for pending changes refresh
type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * Trigger a refresh of the pending changes count across all subscribers.
 * Call this from anywhere in the app after staging, committing, or rejecting changes.
 */
export function refreshPendingChangesCount() {
  listeners.forEach(listener => listener());
}

/**
 * Hook to manage and subscribe to the pending changes count.
 * Automatically refetches when refreshPendingChangesCount() is called anywhere.
 */
export function usePendingChangesCount() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPendingCount = useCallback(async () => {
    try {
      const response = await fetch('/api/changesets/pending');
      if (response.ok) {
        const data = await response.json();
        setPendingCount(data.total_pending_changesets || 0);
      }
    } catch (error) {
      console.error('Error fetching pending count:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchPendingCount();

    // Subscribe to refresh events
    const listener = () => {
      fetchPendingCount();
    };
    listeners.add(listener);

    // Poll every 30 seconds as a fallback
    const interval = setInterval(fetchPendingCount, 30000);

    return () => {
      listeners.delete(listener);
      clearInterval(interval);
    };
  }, [fetchPendingCount]);

  return {
    pendingCount,
    isLoading,
    refresh: fetchPendingCount,
  };
}
