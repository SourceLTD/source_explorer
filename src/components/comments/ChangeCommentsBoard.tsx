'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import CommentItem from './CommentItem';
import { PaperAirplaneIcon, SparklesIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';
import AIChangeReviewDialog from './AIChangeReviewDialog';

interface Comment {
  id: string;
  changeset_id: string | null;
  field_change_id: string | null;
  author: string;
  content: string;
  created_at: string;
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

export interface AIReviewSuggestion {
  action: 'approve' | 'reject' | 'modify' | 'keep_as_is';
  modifications?: Record<string, unknown>;
  justification: string;
  confidence: number;
  currentFieldChanges: Array<{
    field_name: string;
    old_value: unknown;
    new_value: unknown;
  }>;
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
  const [newComment, setNewComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aiSuggestion, setAISuggestion] = useState<AIReviewSuggestion | null>(null);
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
  
  // Scroll to bottom when new comments are added
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comments]);
  
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
      
      // Now call the AI review endpoint (it will also post the AI comment)
      const aiResponse = await fetch('/api/llm-jobs/change-review', {
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
      
      if (!aiResponse.ok) {
        const errorData = await aiResponse.json();
        throw new Error(errorData.error || 'AI review failed');
      }
      
      const aiResult = await aiResponse.json();
      
      // Add the AI's response comment to our local state (it was posted by the API)
      if (aiResult.aiComment) {
        setComments(prev => [...prev, aiResult.aiComment]);
      }
      
      // Show the confirmation dialog
      setAISuggestion({
        action: aiResult.action,
        modifications: aiResult.modifications,
        justification: aiResult.justification,
        confidence: aiResult.confidence,
        currentFieldChanges: aiResult.currentFieldChanges || [],
      });
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI review failed');
      console.error('Error during AI review:', err);
    } finally {
      setIsAIReviewing(false);
    }
  };

  const handleApplySuggestion = async () => {
    if (!aiSuggestion || !changesetId) return;
    
    try {
      // Apply the modifications via the changeset API
      if (aiSuggestion.action === 'modify' && aiSuggestion.modifications) {
        const response = await fetch(`/api/changesets/${changesetId}/apply-ai-suggestion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modifications: aiSuggestion.modifications,
          }),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to apply suggestion');
        }
      } else if (aiSuggestion.action === 'reject') {
        // Reject all field changes
        await fetch(`/api/changesets/${changesetId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reject_all' }),
        });
      } else if (aiSuggestion.action === 'approve') {
        // Approve all field changes
        await fetch(`/api/changesets/${changesetId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve_all' }),
        });
      }
      // 'keep_as_is' does nothing to the pending change
      
      setAISuggestion(null);
      onCommentsChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply suggestion');
      console.error('Error applying AI suggestion:', err);
    }
  };

  const handleDismissSuggestion = () => {
    setAISuggestion(null);
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
        className="flex-1 overflow-y-auto px-4 divide-y divide-gray-100"
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
            <CommentItem
              key={comment.id}
              id={comment.id}
              author={comment.author}
              content={comment.content}
              created_at={comment.created_at}
            />
          ))
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
              {isAIReviewing ? (
                <LoadingSpinner size="sm" noPadding className="text-white" />
              ) : (
                <SparklesIcon className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </form>

      {/* AI Review Confirmation Dialog */}
      {aiSuggestion && (
        <AIChangeReviewDialog
          suggestion={aiSuggestion}
          onApply={handleApplySuggestion}
          onDismiss={handleDismissSuggestion}
        />
      )}
    </div>
  );
}

