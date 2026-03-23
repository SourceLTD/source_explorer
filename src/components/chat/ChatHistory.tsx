'use client';

import { motion } from 'framer-motion';
import { isToday, isYesterday, subWeeks, subMonths } from 'date-fns';
import { TrashIcon } from '@heroicons/react/24/outline';
import useSWRInfinite from 'swr/infinite';
import { fetcher } from '@/lib/chat/utils';
import { useState } from 'react';

type Chat = {
  id: string;
  title: string;
  created_at: string;
};

type ChatHistory = {
  chats: Chat[];
  hasMore: boolean;
};

type GroupedChats = {
  today: Chat[];
  yesterday: Chat[];
  lastWeek: Chat[];
  lastMonth: Chat[];
  older: Chat[];
};

const PAGE_SIZE = 20;

function groupChatsByDate(chats: Chat[]): GroupedChats {
  const now = new Date();
  const oneWeekAgo = subWeeks(now, 1);
  const oneMonthAgo = subMonths(now, 1);

  return chats.reduce(
    (groups, chat) => {
      const d = new Date(chat.created_at);
      if (isToday(d)) groups.today.push(chat);
      else if (isYesterday(d)) groups.yesterday.push(chat);
      else if (d > oneWeekAgo) groups.lastWeek.push(chat);
      else if (d > oneMonthAgo) groups.lastMonth.push(chat);
      else groups.older.push(chat);
      return groups;
    },
    { today: [], yesterday: [], lastWeek: [], lastMonth: [], older: [] } as GroupedChats,
  );
}

export function getChatHistoryPaginationKey(
  pageIndex: number,
  previousPageData: ChatHistory | null,
) {
  if (previousPageData && !previousPageData.hasMore) return null;
  if (pageIndex === 0) return `/api/chat/history?limit=${PAGE_SIZE}`;
  const last = previousPageData?.chats.at(-1);
  if (!last) return null;
  return `/api/chat/history?ending_before=${last.id}&limit=${PAGE_SIZE}`;
}

interface ChatHistoryProps {
  activeChatId: string;
  onSelectChat: (chatId: string) => void;
  onClose: () => void;
}

export default function ChatHistory({
  activeChatId,
  onSelectChat,
  onClose,
}: ChatHistoryProps) {
  const {
    data: pages,
    setSize,
    isLoading,
    isValidating,
    mutate,
  } = useSWRInfinite<ChatHistory>(getChatHistoryPaginationKey, fetcher, {
    revalidateOnFocus: false,
  });

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const hasReachedEnd = pages?.some((p) => !p.hasMore) ?? false;
  const allChats = pages?.flatMap((p) => p.chats) ?? [];
  const isEmpty = !isLoading && allChats.length === 0;

  const handleDelete = async (chatId: string) => {
    setConfirmDeleteId(null);
    mutate(
      (prev) =>
        prev?.map((page) => ({
          ...page,
          chats: page.chats.filter((c) => c.id !== chatId),
        })),
      false,
    );
    await fetch(`/api/chat?id=${chatId}`, { method: 'DELETE' });
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        {[44, 32, 52, 28, 40].map((w, i) => (
          <div key={i} className="h-8 rounded-lg bg-gray-100 animate-pulse" style={{ width: `${w + 40}%` }} />
        ))}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        No conversations yet. Start chatting!
      </div>
    );
  }

  const grouped = groupChatsByDate(allChats);
  const sections = [
    { label: 'Today', chats: grouped.today },
    { label: 'Yesterday', chats: grouped.yesterday },
    { label: 'Last 7 days', chats: grouped.lastWeek },
    { label: 'Last 30 days', chats: grouped.lastMonth },
    { label: 'Older', chats: grouped.older },
  ].filter((s) => s.chats.length > 0);

  return (
    <div className="overflow-y-auto max-h-80">
      {sections.map((section) => (
        <div key={section.label}>
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {section.label}
          </div>
          {section.chats.map((chat) => (
            <motion.div
              key={chat.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="group"
            >
              {confirmDeleteId === chat.id ? (
                <div className="flex items-center gap-2 px-3 py-2 text-xs">
                  <span className="text-gray-600">Delete?</span>
                  <button
                    onClick={() => handleDelete(chat.id)}
                    className="text-red-600 hover:text-red-700 font-medium"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    No
                  </button>
                </div>
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    onSelectChat(chat.id);
                    onClose();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectChat(chat.id);
                      onClose();
                    }
                  }}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors cursor-pointer ${
                    chat.id === activeChatId
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="flex-1 truncate">{chat.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(chat.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      ))}

      {!hasReachedEnd && (
        <button
          onClick={() => setSize((s) => s + 1)}
          disabled={isValidating}
          className="w-full py-2 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          {isValidating ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  );
}
