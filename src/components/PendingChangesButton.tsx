'use client';

import { useState, useEffect } from 'react';
import { QueueListIcon } from '@heroicons/react/24/outline';
import { NotificationBadge } from './NotificationBadge';
import PendingChangesModal from './PendingChangesModal';

interface PendingChangesButtonProps {
  className?: string;
}

export default function PendingChangesButton({ className }: PendingChangesButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPendingCount = async () => {
    try {
      const response = await fetch('/api/changegroups/pending');
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

  const handleModalClose = () => {
    setIsModalOpen(false);
    // Refresh count after modal closes
    fetchPendingCount();
  };

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`relative inline-flex items-center justify-center rounded-xl bg-gray-100 text-gray-700 px-3 py-2.5 text-sm font-medium border border-gray-300 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 hover:cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors ${className || ''}`}
        title="Pending Changes"
      >
        <QueueListIcon className="w-5 h-5" />
        {!isLoading && <NotificationBadge count={pendingCount} />}
      </button>

      <PendingChangesModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onRefresh={fetchPendingCount}
      />
    </>
  );
}

