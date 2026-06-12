'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  XMarkIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';
import { usePendingChangesContext } from './PendingChangesProvider';
import PendingChangesTab from './PendingChangesTab';
import HealthChecksBoard from '@/components/health-checks/HealthChecksBoard';
import { usePendingChangesCount } from '@/hooks/usePendingChangesCount';

type Tab = 'pending' | 'health_checks';

const MAXIMIZED_STORAGE_KEY = 'pendingChanges.maximized';

export default function PendingChangesModal() {
  const { isOpen, setIsOpen } = usePendingChangesContext();
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const [maximized, setMaximized] = useState(false);
  // The active tab registers its refetch here so the header Refresh button can
  // trigger it; null when the active tab has no refresh (e.g. Health Checks).
  const [refresh, setRefresh] = useState<null | (() => void | Promise<void>)>(null);
  const [refreshing, setRefreshing] = useState(false);
  const {
    pendingCount,
    isLoading: pendingCountLoading,
  } = usePendingChangesCount();

  const registerRefresh = useCallback(
    (fn: (() => void | Promise<void>) | null) => setRefresh(() => fn),
    [],
  );

  const handleRefresh = useCallback(async () => {
    if (!refresh) return;
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  // Restore the user's last maximize preference (client-only to avoid an SSR
  // hydration mismatch — we start windowed, then sync from storage on mount).
  useEffect(() => {
    setMaximized(localStorage.getItem(MAXIMIZED_STORAGE_KEY) === '1');
  }, []);

  const toggleMaximized = () =>
    setMaximized((prev) => {
      const next = !prev;
      localStorage.setItem(MAXIMIZED_STORAGE_KEY, next ? '1' : '0');
      return next;
    });

  // Esc steps down one level: maximized → windowed → closed.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (maximized) {
        setMaximized(false);
        localStorage.setItem(MAXIMIZED_STORAGE_KEY, '0');
      } else {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, maximized, setIsOpen]);

  if (!isOpen) return null;

  const pendingTabCount = pendingCountLoading ? null : pendingCount;

  const tabs: Array<{ id: Tab; label: string; count?: number | null }> = [
    { id: 'health_checks', label: 'Health Checks' },
    { id: 'pending', label: 'Pending Changes', count: pendingTabCount },
  ];

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[60]">
      {/* Backdrop dims the app behind the panel in both windowed and
          maximized modes — maximized leaves a thin sliver so the dimming
          still reads. */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}
        onClick={() => setIsOpen(false)}
      />

      {/* Sizes are percentages of the fixed inset-0 wrapper (which fills the
          real viewport), NOT vw/vh — the app runs under `body { zoom: 0.9 }`
          (see globals.css), so vw/vh measure the unzoomed viewport and would
          leave a persistent ~10% gap at every edge. */}
      <div
        className={`bg-white overflow-hidden relative z-10 flex flex-col rounded-xl shadow-xl transition-all duration-200 ease-out ${
          maximized
            ? 'w-[99%] h-[98%]'
            : 'w-[68%] h-[78%]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="px-4 pt-3 pb-0 border-b border-gray-200 bg-gray-50 shrink-0"
          onDoubleClick={toggleMaximized}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-end gap-1">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                const showCount =
                  tab.count !== undefined && tab.count !== null;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors flex items-center gap-2 ${
                      isActive
                        ? 'text-blue-700 border-blue-600 bg-white'
                        : 'text-gray-600 border-transparent hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <span>{tab.label}</span>
                    {showCount && (
                      <span
                        title={
                          tab.id === 'pending'
                            ? `${tab.count} pending change${tab.count === 1 ? '' : 's'}`
                            : undefined
                        }
                        className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-medium tabular-nums ${
                          isActive
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mb-1 flex items-center gap-1">
              {refresh && (
                <button
                  onClick={() => void handleRefresh()}
                  disabled={refreshing}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                  title="Refresh"
                  aria-label="Refresh"
                >
                  {refreshing ? (
                    <LoadingSpinner size="sm" noPadding />
                  ) : (
                    <ArrowPathIcon className="w-5 h-5" />
                  )}
                </button>
              )}
              <button
                onClick={toggleMaximized}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
                title={maximized ? 'Restore (Esc)' : 'Full screen'}
                aria-label={maximized ? 'Restore window' : 'Full screen'}
              >
                {maximized ? (
                  <ArrowsPointingInIcon className="w-5 h-5" />
                ) : (
                  <ArrowsPointingOutIcon className="w-5 h-5" />
                )}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
                title="Close (⌘⇧P)"
                aria-label="Close"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <main className="flex-1 overflow-hidden min-h-0">
          {activeTab === 'pending' ? (
            <PendingChangesTab onRegisterRefresh={registerRefresh} />
          ) : (
            <HealthChecksBoard />
          )}
        </main>
      </div>
    </div>
  );
}
