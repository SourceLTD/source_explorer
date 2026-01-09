'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Modal } from '@/components/ui';
import LoadingSpinner from '@/components/LoadingSpinner';
import { TableEntry, Frame } from '@/lib/types';
import { api } from '@/lib/api-client';
import type { SerializedJob } from '@/lib/llm/types';
import type { DataTableMode } from '@/components/DataTable/types';

interface AIAgentQuickEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: TableEntry | Frame;
  mode: DataTableMode;
  onJobComplete?: () => void;
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

type JobStatus = 'idle' | 'submitting' | 'polling' | 'succeeded' | 'failed';

interface JobItemStatus {
  status: string;
  has_edits?: boolean;
  flagged?: boolean;
}

export function AIAgentQuickEditModal({
  isOpen,
  onClose,
  entry,
  mode,
  onJobComplete,
}: AIAgentQuickEditModalProps) {
  const [prompt, setPrompt] = useState('');
  const [jobStatus, setJobStatus] = useState<JobStatus>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling on unmount or close
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  // Reset state when modal opens with new entry
  useEffect(() => {
    if (isOpen) {
      setPrompt('');
      setJobStatus('idle');
      setJobId(null);
      setErrorMessage(null);
      setResultMessage(null);
    }
  }, [isOpen, entry.id]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  const pollJobStatus = useCallback(async (id: string) => {
    try {
      const response = await api.get<SerializedJob>(`/api/llm-jobs/${id}?includeItems=true`);
      
      if (response.status === 'completed' || response.status === 'cancelled') {
        stopPolling();
        
        // Check item results
        const items = response.items || [];
        const item = items[0] as JobItemStatus | undefined;
        
        if (response.status === 'cancelled') {
          setJobStatus('failed');
          setErrorMessage('Job was cancelled');
        } else if (item?.status === 'succeeded') {
          setJobStatus('succeeded');
          if (item.has_edits) {
            setResultMessage('AI suggested changes. Check pending changes to review.');
          } else {
            setResultMessage('AI completed analysis. No changes suggested.');
          }
          onJobComplete?.();
        } else if (item?.status === 'failed') {
          setJobStatus('failed');
          setErrorMessage('AI processing failed. Please try again.');
        } else {
          // Job completed but item still processing - shouldn't happen often
          setJobStatus('succeeded');
          setResultMessage('Job completed.');
          onJobComplete?.();
        }
      }
    } catch (error) {
      console.error('Error polling job status:', error);
      // Don't stop polling on transient errors
    }
  }, [stopPolling, onJobComplete]);

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim()) {
      setErrorMessage('Please enter a prompt');
      return;
    }

    setJobStatus('submitting');
    setErrorMessage(null);
    setResultMessage(null);

    try {
      const entryId = entry.id;
      const displayId = getEntryDisplayId(entry, mode);
      const targetFields = getEditableFields(mode);

      // Create job with single item scope
      const jobPayload = {
        label: `Quick Edit: ${displayId}`,
        promptTemplate: prompt.trim(),
        model: 'gpt-4.1',
        scope: {
          kind: 'ids' as const,
          pos: mode,
          ids: [entryId],
        },
        jobType: 'editing' as const,
        targetFields,
        serviceTier: 'default' as const,
      };

      const job = await api.post<SerializedJob>('/api/llm-jobs', jobPayload);
      
      setJobId(job.id);
      setJobStatus('polling');

      // Start polling for job completion
      pollingIntervalRef.current = setInterval(() => {
        pollJobStatus(job.id);
      }, 2000);

      // Initial poll
      await pollJobStatus(job.id);

    } catch (error) {
      console.error('Error creating AI job:', error);
      setJobStatus('failed');
      setErrorMessage(
        error instanceof Error 
          ? error.message 
          : 'Failed to create AI job. Please try again.'
      );
    }
  }, [prompt, entry, mode, pollJobStatus]);

  const handleClose = useCallback(() => {
    stopPolling();
    onClose();
  }, [stopPolling, onClose]);

  const displayId = getEntryDisplayId(entry, mode);
  const isProcessing = jobStatus === 'submitting' || jobStatus === 'polling';
  const showResult = jobStatus === 'succeeded' || jobStatus === 'failed';

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
        {!showResult && (
          <div className="space-y-2">
            <label htmlFor="ai-prompt" className="block text-sm font-medium text-gray-700">
              What would you like the AI to do?
            </label>
            <textarea
              id="ai-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isProcessing}
              placeholder="e.g., Improve the gloss to be more precise and add better examples..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
              rows={4}
            />
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-red-700">{errorMessage}</p>
          </div>
        )}

        {/* Processing state */}
        {isProcessing && (
          <div className="flex flex-col items-center justify-center py-6 space-y-3">
            <LoadingSpinner size="lg" />
            <p className="text-sm text-gray-600">
              {jobStatus === 'submitting' ? 'Creating AI job...' : 'AI is processing your request...'}
            </p>
            {jobId && (
              <p className="text-xs text-gray-500">
                Job ID: {jobId}
              </p>
            )}
          </div>
        )}

        {/* Success result */}
        {jobStatus === 'succeeded' && resultMessage && (
          <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-green-800">
              <p className="font-medium">Success</p>
              <p className="mt-1">{resultMessage}</p>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 cursor-pointer"
          >
            {showResult ? 'Close' : 'Cancel'}
          </button>
          {!showResult && (
            <button
              onClick={handleSubmit}
              disabled={isProcessing || !prompt.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isProcessing ? 'Processing...' : 'Submit'}
            </button>
          )}
          {showResult && jobStatus !== 'succeeded' && (
            <button
              onClick={() => {
                setJobStatus('idle');
                setErrorMessage(null);
                setResultMessage(null);
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default AIAgentQuickEditModal;
