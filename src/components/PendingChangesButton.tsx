'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { QueueListIcon } from '@heroicons/react/24/outline';
import { NotificationBadge } from './NotificationBadge';

interface PendingChangesButtonProps {
  className?: string;
  isActive?: boolean;
}

export default function PendingChangesButton({ className, isActive = false }: PendingChangesButtonProps) {
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPendingCount = async () => {
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
  };

  useEffect(() => {
    fetchPendingCount();
    
    // Refresh count every 30 seconds
    const interval = setInterval(fetchPendingCount, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <button
      onClick={() => router.push('/frames/pending')}
      className={`relative inline-flex items-center justify-center rounded-xl px-3 py-2.5 text-sm font-medium border transition-colors ${
        isActive
          ? 'bg-blue-50 text-blue-700 border-blue-300 ring-1 ring-blue-400'
          : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300'
      } hover:cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${className || ''}`}
      title="Pending Changes"
    >
      <QueueListIcon className="w-5 h-5" />
      {!isLoading && <NotificationBadge count={pendingCount} />}
    </button>
  );
}
