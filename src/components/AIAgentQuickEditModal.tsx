'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Modal } from '@/components/ui';
import LoadingSpinner from '@/components/LoadingSpinner';
import { TableEntry, Frame } from '@/lib/types';
import { api } from '@/lib/api-client';
import { showGlobalAlert } from '@/lib/alerts';
import type { SerializedJob } from '@/lib/llm/types';
import type { DataTableMode } from '@/components/DataTable/types';

interface AIAgentQuickEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: TableEntry | Frame;
  mode: DataTableMode;
  onJobSubmitted?: (jobId: string) => void;
}

// Helper to get editable fields by entity type
function getEditableFields(mode: DataTableMode): string[] {
  switch (mode) {
    case 'verbs':
      return ['gloss', 'lemmas', 'examples', 'vendler_class'];
    case 'nouns':
      return ['gloss', 'lemmas', 'examples', 'countable', 'proper', 'collective', 'concrete', 'predicate'];
    case 'adjectives':
      return ['gloss', 'lemmas', 'examples', 'gradable', 'predicative', 'attributive', 'subjective', 'relational'];
    case 'adverbs':
      return ['gloss', 'lemmas', 'examples', 'gradable'];
    case 'frames':
      return ['definition', 'short_definition', 'prototypical_synset'];
    default:
      return ['gloss', 'lemmas', 'examples'];
  }
}

// Helper to get entry identifier for display
function getEntryDisplayId(entry: TableEntry | Frame, mode: DataTableMode): string {
  if (mode === 'frames' && 'label' in entry) {
    return entry.label;
  }
  return entry.id;
}

export function AIAgentQuickEditModal({
  isOpen,
  onClose,
  entry,
  mode,
  onJobSubmitted,
}: AIAgentQuickEditModalProps) {
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset state when modal opens with new entry
  useEffect(() => {
    if (isOpen) {
      setPrompt('');
      setIsSubmitting(false);
      setErrorMessage(null);
    }
  }, [isOpen, entry.id]);

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim()) {
      setErrorMessage('Please enter a prompt');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const entryId = entry.id;
      const displayId = getEntryDisplayId(entry, mode);
      const targetFields = getEditableFields(mode);

      // Simple system prompt for quick edits - just do what the user asks
      const quickEditSystemPrompt = `You are editing a lexical database entry. Follow the user's instructions exactly. Only make the changes they request - do not add extra improvements or modifications beyond what was asked. Be concise and precise.`;

      // Create job with single item scope
      const jobPayload = {
        label: `Quick Edit: ${displayId}`,
        promptTemplate: prompt.trim(),
        systemPrompt: quickEditSystemPrompt,
        model: 'gpt-5-nano',
        scope: {
          kind: 'ids' as const,
          pos: mode,
          ids: [entryId],
        },
        jobType: 'editing' as const,
        targetFields,
        serviceTier: 'default' as const,
        mcpEnabled: false, // Disable MCP tools for quick edits
      };

      const job = await api.post<SerializedJob>('/api/llm-jobs', jobPayload);
      
      // Show success notification
      showGlobalAlert({
        type: 'success',
        title: 'Job Submitted',
        message: 'AI job successfully submitted. Track progress via the AI Jobs panel.',
      });
      
      // Notify parent with job ID for background tracking
      onJobSubmitted?.(job.id);
      
      // Close modal immediately
      onClose();

    } catch (error) {
      console.error('Error creating AI job:', error);
      setIsSubmitting(false);
      setErrorMessage(
        error instanceof Error 
          ? error.message 
          : 'Failed to create AI job. Please try again.'
      );
    }
  }, [prompt, entry, mode, onJobSubmitted, onClose]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const displayId = getEntryDisplayId(entry, mode);

  const customHeader = (
    <div className="flex-1">
      <h3 className="text-lg font-semibold text-gray-900">AI Agent Quick Edit</h3>
      <p className="text-sm text-gray-600 mt-1">{displayId}</p>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      maxWidth="lg"
      customHeader={customHeader}
      className="max-h-[85vh]"
    >
      <div className="p-6 space-y-4">
        {/* Warning message */}
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="text-sm text-amber-800">
            <p className="font-medium">All row data will be sent to the AI</p>
            <p className="mt-1 text-amber-700">
              The AI will have access to all fields of this entry to understand context and suggest edits.
            </p>
          </div>
        </div>

        {/* Prompt input */}
        <div className="space-y-2">
          <label htmlFor="ai-prompt" className="block text-sm font-medium text-gray-700">
            What would you like the AI to do?
          </label>
          <textarea
            id="ai-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isSubmitting}
            placeholder="e.g., Improve the gloss to be more precise and add better examples..."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
            rows={4}
          />
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-red-700">{errorMessage}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !prompt.trim()}
            className="min-w-[90px] px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <LoadingSpinner size="sm" className="text-white" noPadding />
            ) : (
              'Submit'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default AIAgentQuickEditModal;
