'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ChatBubbleLeftRightIcon, ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';

interface UnreadChangesetInfo {
  changeset_id: string;
  entity_type: string;
  entity_display: string;
  comment_count: number;
  latest_comment: {
    author: string;
    content: string;
    created_at: string;
  };
}

interface UnreadCommentsPanelProps {
  /** Callback when a changeset is clicked */
  onChangesetClick?: (changesetId: string) => void;
  /** Callback when the panel is refreshed */
  onRefresh?: () => void;
}

/**
 * Format a user identifier for display.
 */
function formatAuthor(author: string): string {
  if (author === 'system') return 'System';
  if (author === 'system:llm-agent') return 'LLM Agent';
  if (author.includes('@')) return author.split('@')[0];
  return author;
}

/**
 * Format a timestamp for display.
 */
function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Truncate text to a maximum length.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}

export default function UnreadCommentsPanel({ onChangesetClick, onRefresh }: UnreadCommentsPanelProps) {
  const [unread, setUnread] = useState<UnreadChangesetInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const fetchUnread = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/comments/unread');
      if (!response.ok) throw new Error('Failed to fetch unread comments');
      
      const data = await response.json();
      setUnread(data.unread || []);
    } catch (err) {
      setError('Failed to load unread messages');
      console.error('Error fetching unread:', err);
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, []);
  
  useEffect(() => {
    fetchUnread();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [fetchUnread]);
  
  const handleRefresh = () => {
    fetchUnread();
    onRefresh?.();
  };
  
  const handleItemClick = async (changesetId: string) => {
    // Mark as read
    try {
      await fetch('/api/comments/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changeset_id: changesetId }),
      });
      
      // Remove from local list
      setUnread(prev => prev.filter(u => u.changeset_id !== changesetId));
    } catch (err) {
      console.error('Error marking as read:', err);
    }
    
    onChangesetClick?.(changesetId);
  };
  
  // Don't render anything until initial load completes, or if no unread messages
  if (!hasLoaded || unread.length === 0) {
    return null;
  }
  
  return (
    <div className="mb-6 bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div 
        className="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-amber-100/50 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-lg">
            <ChatBubbleLeftRightIcon className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-amber-900">
              Unread Messages
            </h2>
            <p className="text-xs text-amber-600">
              {isLoading ? 'Loading...' : `${unread.length} discussion${unread.length !== 1 ? 's' : ''} with new activity`}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleRefresh(); }}
            disabled={isLoading}
            className="p-1.5 text-amber-500 hover:text-amber-700 hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <LoadingSpinner size="sm" noPadding isSpinning={isLoading} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }}
            className="p-1.5 text-amber-500 hover:text-amber-700 hover:bg-amber-100 rounded-lg transition-colors"
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            <svg 
              className={`w-4 h-4 transition-transform ${isCollapsed ? '' : 'rotate-180'}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>
      
      {/* Content */}
      {!isCollapsed && (
        <div className="px-5 pb-4">
          {error ? (
            <div className="py-4 text-center text-sm text-red-600">{error}</div>
          ) : (
            <div className="space-y-2">
              {unread.slice(0, 5).map((item) => (
                <div
                  key={item.changeset_id}
                  onClick={() => handleItemClick(item.changeset_id)}
                  className="group flex items-start gap-3 p-3 bg-white rounded-xl border border-amber-100 hover:border-amber-300 hover:shadow-sm cursor-pointer transition-all"
                >
                  {/* New badge */}
                  <div className="flex-shrink-0 mt-0.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500 text-white">
                      {item.comment_count} new
                    </span>
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-400 uppercase">
                        {item.entity_type}
                      </span>
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {item.entity_display}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium text-gray-700">
                        {formatAuthor(item.latest_comment.author)}:
                      </span>{' '}
                      {truncate(item.latest_comment.content, 80)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatTime(item.latest_comment.created_at)}
                    </p>
                  </div>
                  
                  {/* Dismiss */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleItemClick(item.changeset_id);
                    }}
                    className="flex-shrink-0 p-1 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Mark as read"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {unread.length > 5 && (
                <p className="text-xs text-amber-600 text-center pt-2">
                  +{unread.length - 5} more discussion{unread.length - 5 !== 1 ? 's' : ''} with new activity
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

