'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  XMarkIcon,
  PlusIcon,
  ClockIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useChatContext } from './ChatProvider';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';
import ChatHistory from './ChatHistory';
import { DEFAULT_CHAT_MODEL } from '@/lib/chat/models';
import { generateUUID, convertToUIMessages } from '@/lib/chat/utils';

export default function ChatModal() {
  const {
    isOpen,
    setIsOpen,
    activeChatId,
    setActiveChatId,
    selectedModelId,
    setSelectedModelId,
    startNewChat,
  } = useChatContext();

  const [showHistory, setShowHistory] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [input, setInput] = useState('');
  const historyRef = useRef<HTMLDivElement>(null);
  const pendingMessagesRef = useRef<UIMessage[] | null>(null);

  const effectiveModel = selectedModelId || DEFAULT_CHAT_MODEL;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: {
          id: activeChatId,
          selectedChatModel: effectiveModel,
        },
      }),
    [activeChatId, effectiveModel],
  );

  const {
    messages,
    status,
    stop,
    sendMessage,
    setMessages,
  } = useChat({
    id: activeChatId,
    transport,
    generateId: generateUUID,
    onError: (error) => {
      toast.error(error.message || 'Something went wrong');
    },
  });

  useEffect(() => {
    if (pendingMessagesRef.current) {
      const pending = pendingMessagesRef.current;
      pendingMessagesRef.current = null;
      setMessages(pending);
      setIsLoadingMessages(false);
    }
  }, [activeChatId, setMessages]);

  const handleSendMessage: typeof sendMessage = useCallback(
    (message, options) => {
      setInput('');
      return sendMessage(message, options);
    },
    [sendMessage],
  );

  const loadChat = useCallback(
    async (chatId: string) => {
      setIsLoadingMessages(true);
      try {
        const res = await fetch(`/api/chat/${chatId}/messages`);
        if (res.ok) {
          const dbMessages = await res.json();
          const uiMessages = convertToUIMessages(dbMessages);
          pendingMessagesRef.current = uiMessages;
          setActiveChatId(chatId);
        } else {
          toast.error('Failed to load chat');
          setIsLoadingMessages(false);
        }
      } catch (_) {
        toast.error('Failed to load chat');
        setIsLoadingMessages(false);
      }
    },
    [setActiveChatId],
  );

  const handleNewChat = useCallback(() => {
    startNewChat();
    setMessages([]);
    setInput('');
    setShowHistory(false);
  }, [startNewChat, setMessages]);

  useEffect(() => {
    const handlers: Record<string, () => void> = {
      'chat:new': handleNewChat,
      'chat:clear': () => setMessages([]),
      'chat:delete': () => {
        fetch(`/api/chat?id=${activeChatId}`, { method: 'DELETE' });
        handleNewChat();
        toast.success('Chat deleted');
      },
      'chat:purge': () => {
        if (confirm('Delete all chats? This cannot be undone.')) {
          fetch('/api/chat/history', { method: 'DELETE' });
          handleNewChat();
          toast.success('All chats deleted');
        }
      },
    };

    Object.entries(handlers).forEach(([event, handler]) => {
      window.addEventListener(event, handler);
    });
    return () => {
      Object.entries(handlers).forEach(([event, handler]) => {
        window.removeEventListener(event, handler);
      });
    };
  }, [activeChatId, handleNewChat, setMessages]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };
    if (showHistory) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showHistory]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[60]">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}
        onClick={() => setIsOpen(false)}
      />

      <div
        className="bg-white rounded-xl w-[95vw] mx-4 h-[90vh] overflow-hidden relative z-10 flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="relative" ref={historyRef}>
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-gray-900 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ClockIcon className="w-4 h-4" />
                History
                <ChevronDownIcon className="w-3 h-3" />
              </button>
              {showHistory && (
                <div className="absolute top-full left-0 mt-1 w-72 bg-white rounded-xl border border-gray-200 shadow-lg z-30">
                  <ChatHistory
                    activeChatId={activeChatId}
                    onSelectChat={loadChat}
                    onClose={() => setShowHistory(false)}
                  />
                </div>
              )}
            </div>

            <button
              onClick={handleNewChat}
              className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
              title="New chat"
            >
              <PlusIcon className="w-4 h-4" />
              New
            </button>
          </div>

          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
            title="Close (Esc)"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        {isLoadingMessages ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : (
          <ChatMessages
            chatId={activeChatId}
            messages={messages}
            status={status}
          />
        )}

        {/* Input */}
        <ChatInput
          chatId={activeChatId}
          input={input}
          setInput={setInput}
          status={status}
          stop={stop}
          sendMessage={handleSendMessage}
          selectedModelId={effectiveModel}
          onModelChange={setSelectedModelId}
        />
      </div>
    </div>
  );
}
