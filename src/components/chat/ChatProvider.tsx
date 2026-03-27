'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { generateUUID } from '@/lib/chat/utils';

type DraftChat = {
  id: string;
  title: string;
  created_at: string;
};

type ChatContextType = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  activeChatId: string;
  setActiveChatId: (id: string) => void;
  selectedModelId: string;
  setSelectedModelId: (id: string) => void;
  startNewChat: () => void;
  drafts: DraftChat[];
  ensureDraft: (chatId: string) => void;
  removeDraft: (id: string) => void;
  streamingChatId: string | null;
  setStreamingChatId: (id: string | null) => void;
};

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeChatId, setActiveChatId] = useState(() => generateUUID());
  const [drafts, setDrafts] = useState<DraftChat[]>([]);
  const [streamingChatId, setStreamingChatId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState(() => {
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(/chat-model=([^;]+)/);
      return match ? decodeURIComponent(match[1]) : '';
    }
    return '';
  });

  const startNewChat = useCallback(() => {
    const newId = generateUUID();
    setActiveChatId(newId);
  }, []);

  const ensureDraft = useCallback((chatId: string) => {
    setDrafts((prev) => {
      if (prev.some((d) => d.id === chatId)) return prev;
      return [
        { id: chatId, title: 'New chat', created_at: new Date().toISOString() },
        ...prev,
      ];
    });
  }, []);

  const removeDraft = useCallback((id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'l') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <ChatContext.Provider
      value={{
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
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatContext must be used within ChatProvider');
  return ctx;
}
