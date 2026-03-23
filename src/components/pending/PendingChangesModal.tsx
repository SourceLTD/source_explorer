'use client';

import { XMarkIcon } from '@heroicons/react/24/outline';
import { usePendingChangesContext } from './PendingChangesProvider';
import PendingChangesList from '@/components/PendingChangesList';

export default function PendingChangesModal() {
  const { isOpen, setIsOpen } = usePendingChangesContext();

  if (!isOpen) return null;

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
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Pending Changes</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
            title="Close (⌘⇧P)"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <main className="flex-1 overflow-y-auto">
          <PendingChangesList embedded />
        </main>
      </div>
    </div>
  );
}
