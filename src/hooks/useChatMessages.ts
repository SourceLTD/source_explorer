import type { UseChatHelpers } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { useEffect, useState } from 'react';
import { useScrollToBottom } from './useScrollToBottom';

export function useChatMessages({
  status,
}: {
  status: UseChatHelpers<UIMessage>['status'];
}) {
  const {
    containerRef,
    endRef,
    isAtBottom,
    scrollToBottom,
    reset,
  } = useScrollToBottom();

  const [hasSentMessage, setHasSentMessage] = useState(false);

  useEffect(() => {
    if (status === 'submitted') {
      setHasSentMessage(true);
    }
  }, [status]);

  return {
    containerRef,
    endRef,
    isAtBottom,
    scrollToBottom,
    hasSentMessage,
    reset,
  };
}
