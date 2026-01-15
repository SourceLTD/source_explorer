'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import CommentItem from './CommentItem';
import InlineRevisionCard, { type AIRevision } from './InlineRevisionCard';
import { PaperAirplaneIcon, SparklesIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';

interface Comment {
  id: string;
  changeset_id: string | null;
  field_change_id: string | null;
  author: string;
  content: string;
  created_at: string;
  ai_revision: AIRevision | null;
}

interface ChangeCommentsBoardProps {
  /** The changeset ID to show comments for */
  changesetId?: string;
  /** The field change ID to show comments for (alternative to changesetId) */
  fieldChangeId?: string;
  /** Optional title for the board */
  title?: string;
  /** Callback when comments change (new comment added) */
  onCommentsChange?: () => void;
  /** Maximum height for the comment list (default: 300px) */
  maxHeight?: number;
}

export default function ChangeCommentsBoard({
  changesetId,
  fieldChangeId,
  title = 'Discussion',
  onCommentsChange,
  maxHeight = 300,
}: ChangeCommentsBoardProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAIReviewing, setIsAIReviewing] = useState(false);
  const [isAISubmitting, setIsAISubmitting] = useState(false);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  const fetchComments = useCallback(async () => {
    if (!changesetId && !fieldChangeId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      if (changesetId) params.set('changeset_id', changesetId);
      if (fieldChangeId) params.set('field_change_id', fieldChangeId);
      
      const response = await fetch(`/api/comments?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch comments');
      
      const data = await response.json();
      setComments(data.comments || []);
      
      // Mark as read when viewing
      if (changesetId) {
        await fetch('/api/comments/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ changeset_id: changesetId }),
        });
      }
    } catch (err) {
      setError('Failed to load comments');
      console.error('Error fetching comments:', err);
    } finally {
      setIsLoading(false);
    }
  }, [changesetId, fieldChangeId]);
  
  useEffect(() => {
    fetchComments();
  }, [fetchComments]);
  
  // Scroll to bottom when new comments are added or AI starts processing
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comments, isAIProcessing]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changeset_id: changesetId,
          field_change_id: fieldChangeId,
          content: newComment.trim(),
        }),
      });
      
      if (!response.ok) throw new Error('Failed to post comment');
      
      const newCommentData = await response.json();
      setComments(prev => [...prev, newCommentData]);
      setNewComment('');
      onCommentsChange?.();
      
      // Focus back on input
      inputRef.current?.focus();
    } catch (err) {
      setError('Failed to post comment');
      console.error('Error posting comment:', err);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleAIReview = async () => {
    if (!newComment.trim() || isAIReviewing || !changesetId) return;
    
    setIsAIReviewing(true);
    setIsAISubmitting(true);
    setError(null);
    
    try {
      // First, post the user's question as a comment
      const commentResponse = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changeset_id: changesetId,
          field_change_id: fieldChangeId,
          content: newComment.trim(),
        }),
      });
      
      if (!commentResponse.ok) throw new Error('Failed to post comment');
      
      const newCommentData = await commentResponse.json();
      setComments(prev => [...prev, newCommentData]);
      const userQuestion = newComment.trim();
      setNewComment('');
      onCommentsChange?.();
      
      // Create the AI review job
      const createJobResponse = await fetch('/api/llm-jobs/change-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changeset_id: changesetId,
          user_question: userQuestion,
          comment_history: [...comments, newCommentData].map(c => ({
            author: c.author,
            content: c.content,
            created_at: c.created_at,
          })),
        }),
      });
      
      if (!createJobResponse.ok) {
        const errorData = await createJobResponse.json();
        throw new Error(errorData.error || 'Failed to create AI review job');
      }
      
      const jobData = await createJobResponse.json();
      const jobId = jobData.job_id;

      // Submission complete, now processing/polling
      setIsAISubmitting(false);
      setIsAIProcessing(true);
      
      // Poll for job completion
      const maxAttempts = 60; // 60 attempts * 2s = 2 minutes max
      const pollInterval = 2000; // 2 seconds
      
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        const statusResponse = await fetch(`/api/llm-jobs/change-review?job_id=${jobId}`);
        if (!statusResponse.ok) {
          throw new Error('Failed to check job status');
        }
        
        const statusData = await statusResponse.json();
        
        if (statusData.is_complete) {
          if (statusData.item_status === 'failed') {
            throw new Error('AI review job failed');
          }
          
          if (statusData.result) {
            const aiResult = statusData.result;
            
            // Validate that we have a valid action
            const validActions = ['approve', 'reject', 'modify', 'keep_as_is'];
            if (!aiResult.action || !validActions.includes(aiResult.action)) {
              console.warn('AI returned invalid action:', aiResult.action);
              throw new Error(`AI returned invalid action: ${aiResult.action || 'undefined'}`);
            }
            
            // Fetch the current field changes for the changeset
            const changesetResponse = await fetch(`/api/changesets/${changesetId}`);
            let currentFieldChanges: Array<{ field_name: string; old_value: unknown; new_value: unknown }> = [];
            if (changesetResponse.ok) {
              const changesetData = await changesetResponse.json();
              currentFieldChanges = (changesetData.field_changes || []).map((fc: { field_name: string; old_value: unknown; new_value: unknown }) => ({
                field_name: fc.field_name,
                old_value: fc.old_value,
                new_value: fc.new_value,
              }));
            }
            
            // The Lambda webhook posts the AI comment with ai_revision when processing the job,
            // so we just need to refresh comments to show the inline revision card
            await fetchComments();
            
            return; // Success!
          }
        }
      }
      
      throw new Error('AI review timed out');
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI review failed');
      console.error('Error during AI review:', err);
    } finally {
      setIsAISubmitting(false);
      setIsAIProcessing(false);
      setIsAIReviewing(false);
    }
  };

  // Handle resolving an AI revision (accept/deny fields)
  const handleResolveRevision = useCallback(async (
    revisionId: string, 
    acceptedFields: string[], 
    rejectedFields: string[]
  ) => {
    try {
      const response = await fetch(`/api/ai-revisions/${revisionId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accepted_fields: acceptedFields,
          rejected_fields: rejectedFields,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to resolve revision');
      }
      
      // Refresh comments to show updated revision status
      await fetchComments();
      onCommentsChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve revision');
      console.error('Error resolving AI revision:', err);
    }
  }, [fetchComments, onCommentsChange]);
  
  /**
   * Format a timestamp for display.
   */
  const formatTime = (isoString: string): string => {
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
  };

  return (
    <div className="flex flex-col bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {title}
          {comments.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-200 text-gray-600 rounded-full">
              {comments.length}
            </span>
          )}
        </h3>
        <button
          onClick={fetchComments}
          disabled={isLoading}
          className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors disabled:opacity-50"
          title="Refresh comments"
        >
          <LoadingSpinner size="sm" isSpinning={isLoading} noPadding />
        </button>
      </div>
      
      {/* Comments List */}
      <div 
        ref={listRef}
        className="flex-1 overflow-y-auto px-4 space-y-1"
        style={{ maxHeight: `${maxHeight}px` }}
      >
        {error ? (
          <div className="py-8 text-center text-sm text-red-500">{error}</div>
        ) : comments.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">
            No comments yet. Start the discussion!
          </div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id}>
              {/* If this comment has an AI revision, show the inline revision card with participant header */}
              {comment.ai_revision ? (
                <div className="py-3 flex gap-3">
                  {/* AI Avatar */}
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                    <SparklesIcon className="w-4 h-4" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="font-medium text-sm text-gray-900">AI Agent</span>
                      <span className="text-xs text-gray-400">{formatTime(comment.created_at)}</span>
                    </div>
                    <InlineRevisionCard
                      revision={comment.ai_revision}
                      onResolve={handleResolveRevision}
                      onChangesetUpdated={onCommentsChange}
                    />
                  </div>
                </div>
              ) : (
                <div className="border-b border-gray-100 last:border-b-0">
                  <CommentItem
                    id={comment.id}
                    author={comment.author}
                    content={comment.content}
                    created_at={comment.created_at}
                  />
                </div>
              )}
            </div>
          ))
        )}
        
        {isAIProcessing && (
          <div className="py-3 flex gap-3 animate-pulse">
            {/* AI Avatar */}
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
              <SparklesIcon className="w-4 h-4" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-medium text-sm text-gray-900">AI Agent</span>
                <span className="text-xs text-gray-400">Responding...</span>
              </div>
              <div className="py-3 px-3 flex items-center gap-2 text-sm text-blue-600 bg-blue-50/30 rounded-lg border border-blue-100/50">
                <SparklesIcon className="w-4 h-4 text-blue-400" />
                <span>An AI agent is responding...</span>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-3 bg-gray-50 border-t border-gray-200">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a comment... (Enter to send, Shift+Enter for new line)"
            className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[40px] max-h-[100px]"
            rows={1}
            disabled={isSubmitting || isAIReviewing}
          />
          <button
            type="submit"
            disabled={!newComment.trim() || isSubmitting || isAIReviewing}
            className="px-3 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <PaperAirplaneIcon className="w-4 h-4" />
          </button>
          {changesetId && (
            <button
              type="button"
              onClick={handleAIReview}
              disabled={!newComment.trim() || isSubmitting || isAIReviewing}
              className="px-3 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              title="Ask AI for review assistance"
            >
              {isAISubmitting ? (
                <LoadingSpinner size="sm" noPadding className="text-white" />
              ) : (
                <SparklesIcon className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

