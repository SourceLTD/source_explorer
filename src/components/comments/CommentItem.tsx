'use client';

import React from 'react';

interface CommentItemProps {
  id: string;
  author: string;
  content: string;
  created_at: string;
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
 * Get initials from author name for avatar.
 */
function getInitials(author: string): string {
  const formatted = formatAuthor(author);
  if (formatted === 'System' || formatted === 'LLM Agent') return formatted[0];
  return formatted.slice(0, 2).toUpperCase();
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
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export default function CommentItem({ author, content, created_at }: CommentItemProps) {
  const initials = getInitials(author);
  const displayName = formatAuthor(author);
  const timeStr = formatTime(created_at);
  
  return (
    <div className="flex gap-3 py-3">
      {/* Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
        {initials}
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-medium text-sm text-gray-900">{displayName}</span>
          <span className="text-xs text-gray-400">{timeStr}</span>
        </div>
        <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{content}</p>
      </div>
    </div>
  );
}

