import { useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api-client';

const CHANNEL_NAME = 'ai-job-completion';
const POLL_INTERVAL = 10000; // 10 seconds when overlay is closed

interface JobStatusEntry {
  id: string;
  status: string;
}

interface BroadcastMessage {
  type: 'job-completed';
  entityType: string;
  timestamp: number;
}

/**
 * Hook that broadcasts AI job completions across browser tabs and within the same tab.
 * Uses BroadcastChannel API for cross-tab communication and custom events for same-tab.
 * 
 * @param entityType - The entity type to monitor (e.g., 'frames_only', 'super_frames', 'lexical_units')
 * @param onJobCompleted - Callback to invoke when a job completes
 * @param isOverlayOpen - Whether the AI overlay is currently open (to avoid duplicate polling)
 */
export function useJobCompletionBroadcast(
  entityType: string,
  onJobCompleted: () => void,
  isOverlayOpen: boolean = false
) {
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const previousStatusesRef = useRef<Map<string, string>>(new Map());
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const onJobCompletedRef = useRef(onJobCompleted);
  
  // Keep callback ref up to date
  useEffect(() => {
    onJobCompletedRef.current = onJobCompleted;
  }, [onJobCompleted]);

  // Broadcast a job completion event to all tabs
  const broadcastCompletion = useCallback((forEntityType: string) => {
    // Broadcast to other tabs
    if (broadcastChannelRef.current) {
      const message: BroadcastMessage = {
        type: 'job-completed',
        entityType: forEntityType,
        timestamp: Date.now(),
      };
      broadcastChannelRef.current.postMessage(message);
    }
    
    // Also dispatch a custom event for same-tab listeners
    window.dispatchEvent(new CustomEvent('ai-job-completed', {
      detail: { entityType: forEntityType, timestamp: Date.now() }
    }));
  }, []);

  // Check for job completions via API
  const checkForCompletions = useCallback(async () => {
    try {
      const response = await api.get<{ jobs: JobStatusEntry[] }>(
        `/api/llm-jobs?includeCompleted=true&limit=20&entityType=${entityType}`
      );
      
      let hasCompletion = false;
      
      for (const job of response.jobs) {
        const prevStatus = previousStatusesRef.current.get(job.id);
        const isNowComplete = job.status === 'completed' || job.status === 'cancelled';
        const wasActive = prevStatus === 'queued' || prevStatus === 'running';
        
        if (wasActive && isNowComplete) {
          hasCompletion = true;
        }
        
        previousStatusesRef.current.set(job.id, job.status);
      }
      
      if (hasCompletion) {
        // Broadcast to all tabs including current one
        broadcastCompletion(entityType);
      }
    } catch (error) {
      // Silently fail - this is background polling
      console.warn('[useJobCompletionBroadcast] Failed to check for completions:', error);
    }
  }, [entityType, broadcastCompletion]);

  // Set up BroadcastChannel for cross-tab communication
  useEffect(() => {
    // Only create channel if BroadcastChannel is supported
    if (typeof BroadcastChannel !== 'undefined') {
      broadcastChannelRef.current = new BroadcastChannel(CHANNEL_NAME);
      
      broadcastChannelRef.current.onmessage = (event: MessageEvent<BroadcastMessage>) => {
        if (event.data?.type === 'job-completed') {
          // Check if this completion is relevant to our entity type
          // We refresh for any job completion that could affect our view
          const relevantEntityTypes = getRelevantEntityTypes(entityType);
          if (relevantEntityTypes.includes(event.data.entityType)) {
            onJobCompletedRef.current();
          }
        }
      };
    }
    
    return () => {
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
        broadcastChannelRef.current = null;
      }
    };
  }, [entityType]);

  // Listen for same-tab custom events
  useEffect(() => {
    const handleJobCompleted = (event: CustomEvent<{ entityType: string }>) => {
      const relevantEntityTypes = getRelevantEntityTypes(entityType);
      if (relevantEntityTypes.includes(event.detail.entityType)) {
        onJobCompletedRef.current();
      }
    };
    
    window.addEventListener('ai-job-completed', handleJobCompleted as EventListener);
    
    return () => {
      window.removeEventListener('ai-job-completed', handleJobCompleted as EventListener);
    };
  }, [entityType]);

  // Background polling when overlay is closed
  useEffect(() => {
    // Skip polling if overlay is open (useJobPolling handles it)
    if (isOverlayOpen) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }
    
    // Start background polling
    pollIntervalRef.current = setInterval(checkForCompletions, POLL_INTERVAL);
    
    // Also do an immediate check
    checkForCompletions();
    
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isOverlayOpen, checkForCompletions]);

  return {
    broadcastCompletion,
  };
}

/**
 * Get entity types that should trigger a refresh for the given type.
 * For example, 'frames_only' should refresh when 'frames' jobs complete.
 */
function getRelevantEntityTypes(entityType: string): string[] {
  switch (entityType) {
    case 'frames_only':
    case 'super_frames':
    case 'frames':
      // All frame-related views should refresh for any frame job
      return ['frames_only', 'super_frames', 'frames'];
    case 'lexical_units':
    case 'verbs':
    case 'nouns':
    case 'adjectives':
    case 'adverbs':
      // All lexical unit views refresh together
      return ['lexical_units', 'verbs', 'nouns', 'adjectives', 'adverbs'];
    default:
      return [entityType];
  }
}

/**
 * Utility to manually trigger a job completion broadcast.
 * Can be called from anywhere (e.g., when useJobPolling detects a completion).
 */
export function broadcastJobCompletion(entityType: string) {
  // Dispatch custom event for same-tab listeners
  window.dispatchEvent(new CustomEvent('ai-job-completed', {
    detail: { entityType, timestamp: Date.now() }
  }));
  
  // Also broadcast to other tabs
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({
      type: 'job-completed',
      entityType,
      timestamp: Date.now(),
    });
    channel.close();
  }
}
