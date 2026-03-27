'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  XMarkIcon,
  PlusIcon,
  Bars3Icon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useChatContext } from './ChatProvider';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';
import ChatHistory from './ChatHistory';
import QuestionCard from './QuestionCard';
import { DEFAULT_CHAT_MODEL } from '@/lib/chat/models';
import { generateUUID, convertToUIMessages } from '@/lib/chat/utils';
import type { AskQuestionsInput } from '@/lib/chat/tools';

export default function ChatModal() {
  const {
    isOpen,
    setIsOpen,
    activeChatId,
    setActiveChatId,
    selectedModelId,
    setSelectedModelId,
    startNewChat,
    drafts,
    ensureDraft,
    removeDraft,
    streamingChatId,
    setStreamingChatId,
  } = useChatContext();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [input, setInputRaw] = useState('');
  const pendingMessagesRef = useRef<UIMessage[] | null>(null);
  const autoSentToolCallRef = useRef<string | null>(null);

  const setInput = useCallback(
    (value: string) => {
      setInputRaw(value);
      if (value.trim()) {
        ensureDraft(activeChatId);
      }
    },
    [ensureDraft, activeChatId],
  );

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
    addToolResult,
  } = useChat({
    id: activeChatId,
    transport,
    generateId: generateUUID,
    sendAutomaticallyWhen({ messages: msgs }) {
      const last = msgs[msgs.length - 1];
      if (last?.role !== 'assistant') return false;
      const toolParts = last.parts.filter(
        (p: any) => typeof p.type === 'string' && p.type.startsWith('tool-'),
      );
      if (toolParts.length === 0) return false;
      const askPart = toolParts.find(
        (p: any) => p.type === 'tool-ask_questions',
      ) as any;
      if (!askPart) return false;
      const allResolved = toolParts.every(
        (p: any) => p.state === 'output-available' || p.state === 'output-error',
      );
      if (!allResolved) return false;
      if (autoSentToolCallRef.current === askPart.toolCallId) return false;
      autoSentToolCallRef.current = askPart.toolCallId;
      return true;
    },
    onError: (error) => {
      toast.error(error.message || 'Something went wrong');
    },
  });

  useEffect(() => {
    const isActive = status === 'streaming' || status === 'submitted';
    setStreamingChatId(isActive ? activeChatId : null);
  }, [status, activeChatId, setStreamingChatId]);

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
      setInputRaw('');
      removeDraft(activeChatId);
      return sendMessage(message, options);
    },
    [sendMessage, activeChatId, removeDraft],
  );

  const loadChat = useCallback(
    async (chatId: string) => {
      if (chatId === activeChatId) return;
      autoSentToolCallRef.current = null;
      const isDraft = drafts.some((d) => d.id === chatId);
      if (isDraft) {
        setActiveChatId(chatId);
        setMessages([]);
        return;
      }
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
    [activeChatId, setActiveChatId, setMessages, drafts],
  );

  const handleNewChat = useCallback(() => {
    startNewChat();
    setMessages([]);
    setInputRaw('');
    autoSentToolCallRef.current = null;
  }, [startNewChat, setMessages]);

  const handleDeleteDraft = useCallback(
    (draftId: string) => {
      removeDraft(draftId);
      if (draftId === activeChatId) {
        const remaining = drafts.filter((d) => d.id !== draftId);
        if (remaining.length > 0) {
          setActiveChatId(remaining[0].id);
          setMessages([]);
        } else {
          startNewChat();
          setMessages([]);
          setInputRaw('');
        }
      }
    },
    [removeDraft, activeChatId, drafts, setActiveChatId, setMessages, startNewChat],
  );

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

  if (!isOpen) return null;

  const activeQuestion = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== 'assistant') continue;
      for (const part of msg.parts) {
        if (
          (part as any).type === 'tool-ask_questions' &&
          (part as any).state === 'input-available'
        ) {
          return {
            toolCallId: (part as any).toolCallId as string,
            input: (part as any).input as AskQuestionsInput,
            state: (part as any).state as string,
            output: (part as any).output as unknown,
          };
        }
      }
    }
    return null;
  })();

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[60]">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}
        onClick={() => setIsOpen(false)}
      />

      <div
        className="bg-white rounded-xl w-[95vw] mx-4 h-[90vh] overflow-hidden relative z-10 flex shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div
          className={`bg-gray-50 border-r border-gray-200 flex-shrink-0 transition-all duration-200 ease-in-out overflow-hidden ${
            sidebarOpen ? 'w-72' : 'w-0'
          }`}
        >
          {sidebarOpen && (
            <ChatHistory
              activeChatId={activeChatId}
              onSelectChat={loadChat}
              onNewChat={handleNewChat}
              drafts={drafts}
              onDeleteDraft={handleDeleteDraft}
              streamingChatId={streamingChatId}
            />
          )}
        </div>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="px-4 py-2.5 border-b border-gray-200 bg-white flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-1.5 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              >
                <Bars3Icon className="w-4.5 h-4.5" />
              </button>
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
          <div className="relative flex-1 min-h-0">
            {isLoadingMessages ? (
              <div className="h-full flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : (
              <ChatMessages
                chatId={activeChatId}
                messages={messages}
                status={status}
              />
            )}

            {activeQuestion && (
              <div
                className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
                style={{
                  background: 'linear-gradient(to bottom, transparent, white)',
                }}
              />
            )}
          </div>

          {/* Question card anchored above input */}
          {activeQuestion && (
            <div className="shrink-0 bg-white px-4 pt-3 pb-0">
              <QuestionCard
                toolCallId={activeQuestion.toolCallId}
                input={activeQuestion.input}
                state={activeQuestion.state}
                output={activeQuestion.output}
                addToolResult={addToolResult as any}
              />
            </div>
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
    </div>
  );
}
