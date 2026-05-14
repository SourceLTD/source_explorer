'use client';

import { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { usePendingChangesContext } from './PendingChangesProvider';
import PendingChangesTab from './PendingChangesTab';
import HealthChecksBoard from '@/components/health-checks/HealthChecksBoard';
import { usePendingChangesCount } from '@/hooks/usePendingChangesCount';

type Tab = 'pending' | 'health_checks';

export default function PendingChangesModal() {
  const { isOpen, setIsOpen } = usePendingChangesContext();
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const {
    pendingCount,
    isLoading: pendingCountLoading,
  } = usePendingChangesCount();

  if (!isOpen) return null;

  const pendingTabCount = pendingCountLoading ? null : pendingCount;

  const tabs: Array<{ id: Tab; label: string; count?: number | null }> = [
    { id: 'health_checks', label: 'Health Checks' },
    { id: 'pending', label: 'Pending Changes', count: pendingTabCount },
  ];

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[60]">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}
        onClick={() => setIsOpen(false)}
      />

      <div
        className="bg-white rounded-xl w-[95vw] mx-4 h-[90vh] overflow-hidden relative z-10 flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-3 pb-0 border-b border-gray-200 bg-gray-50 shrink-0">
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
            <button
              onClick={() => setIsOpen(false)}
              className="mb-1 text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
              title="Close (⌘⇧P)"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <main className="flex-1 overflow-hidden min-h-0">
          {activeTab === 'pending' ? (
            <PendingChangesTab />
          ) : (
            <HealthChecksBoard />
          )}
        </main>
      </div>
    </div>
  );
}
