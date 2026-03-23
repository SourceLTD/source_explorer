'use client';

import { QueueListIcon } from '@heroicons/react/24/outline';
import { NotificationBadge } from './NotificationBadge';
import { usePendingChangesCount } from '@/hooks/usePendingChangesCount';
import { usePendingChangesContext } from './pending/PendingChangesProvider';

interface PendingChangesButtonProps {
  className?: string;
}

export default function PendingChangesButton({ className }: PendingChangesButtonProps) {
  const { isOpen, setIsOpen } = usePendingChangesContext();
  const { pendingCount, isLoading } = usePendingChangesCount();

  return (
    <button
      onClick={() => setIsOpen(!isOpen)}
      className={`relative inline-flex items-center justify-center rounded-xl px-3 py-2.5 text-sm font-medium border transition-colors ${
        isOpen
          ? 'bg-blue-50 text-blue-600 border-blue-300 ring-1 ring-blue-400'
          : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300'
      } hover:cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${className || ''}`}
      title="Pending Changes (⌘⇧P)"
    >
      <QueueListIcon className="w-5 h-5" />
      {!isLoading && <NotificationBadge count={pendingCount} />}
    </button>
  );
}
