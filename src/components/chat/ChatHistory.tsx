'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { isToday, isYesterday, subWeeks, subMonths } from 'date-fns';
import {
  TrashIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  MapPinIcon,
  ArchiveBoxIcon,
  ArchiveBoxXMarkIcon,
  EllipsisHorizontalIcon,
  PencilSquareIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { MapPinIcon as MapPinSolidIcon } from '@heroicons/react/24/solid';
import useSWRInfinite from 'swr/infinite';
import { fetcher } from '@/lib/chat/utils';
import { useCallback, useEffect, useRef, useState } from 'react';

type Chat = {
  id: string;
  title: string;
  created_at: string;
  pinned: boolean;
  archived: boolean;
};

type DraftChat = {
  id: string;
  title: string;
  created_at: string;
};

type ChatHistoryResponse = {
  chats: Chat[];
  hasMore: boolean;
};

type GroupedChats = {
  pinned: Chat[];
  today: Chat[];
  yesterday: Chat[];
  lastWeek: Chat[];
  lastMonth: Chat[];
  older: Chat[];
};

const PAGE_SIZE = 30;

function compactTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function groupChatsByDate(chats: Chat[]): GroupedChats {
  const now = new Date();
  const oneWeekAgo = subWeeks(now, 1);
  const oneMonthAgo = subMonths(now, 1);

  return chats.reduce(
    (groups, chat) => {
      if (chat.pinned) {
        groups.pinned.push(chat);
        return groups;
      }
      const d = new Date(chat.created_at);
      if (isToday(d)) groups.today.push(chat);
      else if (isYesterday(d)) groups.yesterday.push(chat);
      else if (d > oneWeekAgo) groups.lastWeek.push(chat);
      else if (d > oneMonthAgo) groups.lastMonth.push(chat);
      else groups.older.push(chat);
      return groups;
    },
    { pinned: [], today: [], yesterday: [], lastWeek: [], lastMonth: [], older: [] } as GroupedChats,
  );
}

function getChatHistoryPaginationKey(showArchived: boolean) {
  return (pageIndex: number, previousPageData: ChatHistoryResponse | null) => {
    if (previousPageData && !previousPageData.hasMore) return null;
    const base = `/api/chat/history?limit=${PAGE_SIZE}&archived=${showArchived}`;
    if (pageIndex === 0) return base;
    const last = previousPageData?.chats.at(-1);
    if (!last) return null;
    return `${base}&ending_before=${last.id}`;
  };
}

function SmallSpinner() {
  return (
    <span className="inline-block w-3 h-3 border-[1.5px] border-gray-300 border-t-blue-500 rounded-full animate-spin flex-shrink-0" />
  );
}

interface ChatHistoryProps {
  activeChatId: string;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  drafts: DraftChat[];
  onDeleteDraft: (id: string) => void;
  streamingChatId: string | null;
}

export default function ChatHistory({
  activeChatId,
  onSelectChat,
  onNewChat,
  drafts,
  onDeleteDraft,
  streamingChatId,
}: ChatHistoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ chatId: string; x: number; y: number } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const prevDraftCountRef = useRef(drafts.length);

  const {
    data: pages,
    setSize,
    isLoading,
    isValidating,
    mutate,
  } = useSWRInfinite<ChatHistoryResponse>(
    getChatHistoryPaginationKey(showArchived),
    fetcher,
    { revalidateOnFocus: false },
  );

  useEffect(() => {
    if (drafts.length < prevDraftCountRef.current) {
      const timer = setTimeout(() => mutate(), 800);
      return () => clearTimeout(timer);
    }
    prevDraftCountRef.current = drafts.length;
  }, [drafts.length, mutate]);

  const hasReachedEnd = pages?.some((p) => !p.hasMore) ?? false;
  const allChats = pages?.flatMap((p) => p.chats) ?? [];

  const filteredChats = searchQuery
    ? allChats.filter((c) =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : allChats;

  const filteredDrafts = searchQuery
    ? drafts.filter((d) =>
        d.title.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : drafts;

  const isEmpty = !isLoading && filteredChats.length === 0 && filteredDrafts.length === 0;

  const handleDelete = useCallback(async (chatId: string) => {
    setConfirmDeleteId(null);
    setContextMenu(null);
    mutate(
      (prev) =>
        prev?.map((page) => ({
          ...page,
          chats: page.chats.filter((c) => c.id !== chatId),
        })),
      false,
    );
    await fetch(`/api/chat?id=${chatId}`, { method: 'DELETE' });
  }, [mutate]);

  const handleTogglePin = useCallback(async (chat: Chat) => {
    setContextMenu(null);
    const newPinned = !chat.pinned;
    mutate(
      (prev) =>
        prev?.map((page) => ({
          ...page,
          chats: page.chats.map((c) =>
            c.id === chat.id ? { ...c, pinned: newPinned } : c,
          ),
        })),
      false,
    );
    await fetch('/api/chat', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: chat.id, pinned: newPinned }),
    });
    mutate();
  }, [mutate]);

  const handleToggleArchive = useCallback(async (chat: Chat) => {
    setContextMenu(null);
    mutate(
      (prev) =>
        prev?.map((page) => ({
          ...page,
          chats: page.chats.filter((c) => c.id !== chat.id),
        })),
      false,
    );
    await fetch('/api/chat', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: chat.id, archived: !chat.archived }),
    });
    mutate();
  }, [mutate]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu]);

  const openContextMenu = useCallback((e: React.MouseEvent | { clientX: number; clientY: number; currentTarget: EventTarget }, chatId: string) => {
    const el = (e as React.MouseEvent).currentTarget as HTMLElement;
    const sidebar = el.closest('.chat-sidebar')?.getBoundingClientRect();
    if (sidebar) {
      setContextMenu({
        chatId,
        x: (e as MouseEvent).clientX - sidebar.left,
        y: (e as MouseEvent).clientY - sidebar.top,
      });
    }
  }, []);

  const contextChat = contextMenu ? allChats.find((c) => c.id === contextMenu.chatId) : null;
  const contextIsDraft = contextMenu ? drafts.some((d) => d.id === contextMenu.chatId) : false;

  const grouped = groupChatsByDate(filteredChats);
  const sections = [
    { label: 'Pinned', chats: grouped.pinned },
    { label: 'Today', chats: grouped.today },
    { label: 'Yesterday', chats: grouped.yesterday },
    { label: 'Last 7 days', chats: grouped.lastWeek },
    { label: 'Last 30 days', chats: grouped.lastMonth },
    { label: 'Older', chats: grouped.older },
  ].filter((s) => s.chats.length > 0);

  const renderChatRow = (chat: Chat) => {
    const isStreaming = chat.id === streamingChatId;

    if (confirmDeleteId === chat.id) {
      return (
        <div className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-lg bg-red-50">
          <span className="text-gray-600 flex-1">Delete?</span>
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
      );
    }

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectChat(chat.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openContextMenu(e, chat.id);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectChat(chat.id);
          }
        }}
        className={`group w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${
          chat.id === activeChatId
            ? 'bg-blue-50 text-blue-700'
            : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        {isStreaming ? (
          <SmallSpinner />
        ) : (
          <CheckCircleIcon className="w-3 h-3 flex-shrink-0 text-green-500" />
        )}
        {chat.pinned && (
          <MapPinSolidIcon className="w-3 h-3 flex-shrink-0 text-amber-500" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">{chat.title}</div>
          <div className="text-[10px] text-gray-400">
            {compactTimeAgo(new Date(chat.created_at))}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            const sidebar = (e.currentTarget as HTMLElement).closest('.chat-sidebar')?.getBoundingClientRect();
            if (sidebar) {
              setContextMenu({
                chatId: chat.id,
                x: rect.right - sidebar.left,
                y: rect.top - sidebar.top,
              });
            }
          }}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-gray-600 transition-all flex-shrink-0"
        >
          <EllipsisHorizontalIcon className="w-4 h-4" />
        </button>
      </div>
    );
  };

  const renderDraftRow = (draft: DraftChat) => {
    const isActive = draft.id === activeChatId;

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectChat(draft.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectChat(draft.id);
          }
        }}
        className={`group w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${
          isActive
            ? 'bg-gray-200/60 text-gray-500'
            : 'text-gray-400 hover:bg-gray-100'
        }`}
      >
        <PencilSquareIcon className="w-3 h-3 flex-shrink-0 text-gray-400" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate italic text-gray-400">{draft.title}</div>
          <div className="text-[10px] text-gray-300">Draft</div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDeleteDraft(draft.id);
          }}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-red-500 transition-all flex-shrink-0"
        >
          <TrashIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  return (
    <div className="chat-sidebar flex flex-col h-full relative">
      {/* Search */}
      <div className="px-3 pt-3 pb-2 space-y-2">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-100 border-none rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300 placeholder-gray-400 text-gray-700"
          />
        </div>

        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          New Chat
        </button>
      </div>

      {/* Tab toggle: Active / Archived */}
      <div className="px-3 pb-2 flex gap-1">
        <button
          onClick={() => setShowArchived(false)}
          className={`flex-1 text-xs py-1 rounded-md font-medium transition-colors ${
            !showArchived ? 'bg-gray-200 text-gray-800' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Active
        </button>
        <button
          onClick={() => setShowArchived(true)}
          className={`flex-1 text-xs py-1 rounded-md font-medium transition-colors flex items-center justify-center gap-1 ${
            showArchived ? 'bg-gray-200 text-gray-800' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <ArchiveBoxIcon className="w-3 h-3" />
          Archived
        </button>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto px-1.5 pb-2 min-h-0">
        {isLoading ? (
          <div className="px-2 space-y-1.5 pt-1">
            {[60, 45, 70, 35, 55].map((w, i) => (
              <div key={i} className="h-10 rounded-lg bg-gray-100 animate-pulse" style={{ width: `${w + 20}%` }} />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <p className="text-xs">
              {showArchived ? 'No archived chats' : searchQuery ? 'No matching chats' : 'No conversations yet'}
            </p>
          </div>
        ) : (
          <>
            {/* Draft chats - shown only in Active tab */}
            {!showArchived && filteredDrafts.length > 0 && (
              <div className="mb-1">
                <AnimatePresence mode="popLayout">
                  {filteredDrafts.map((draft) => (
                    <motion.div
                      key={draft.id}
                      layout
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.15 }}
                    >
                      {renderDraftRow(draft)}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Persisted chats grouped by date */}
            {sections.map((section) => (
              <div key={section.label} className="mb-1">
                <div className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {section.label}
                </div>
                <AnimatePresence mode="popLayout">
                  {section.chats.map((chat) => (
                    <motion.div
                      key={chat.id}
                      layout
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.15 }}
                    >
                      {renderChatRow(chat)}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            ))}

            {!hasReachedEnd && sections.length > 0 && (
              <button
                onClick={() => setSize((s) => s + 1)}
                disabled={isValidating}
                className="w-full py-2 text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                {isValidating ? 'Loading...' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>

      {/* Context menu */}
      <AnimatePresence>
        {contextMenu && contextChat && !contextIsDraft && (
          <motion.div
            ref={contextMenuRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="absolute z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-44"
            style={{ left: Math.min(contextMenu.x, 140), top: contextMenu.y }}
          >
            <button
              onClick={() => handleTogglePin(contextChat)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {contextChat.pinned ? (
                <>
                  <MapPinIcon className="w-3.5 h-3.5" />
                  Unpin
                </>
              ) : (
                <>
                  <MapPinSolidIcon className="w-3.5 h-3.5" />
                  Pin to top
                </>
              )}
            </button>
            <button
              onClick={() => handleToggleArchive(contextChat)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {contextChat.archived ? (
                <>
                  <ArchiveBoxXMarkIcon className="w-3.5 h-3.5" />
                  Unarchive
                </>
              ) : (
                <>
                  <ArchiveBoxIcon className="w-3.5 h-3.5" />
                  Archive
                </>
              )}
            </button>
            <div className="border-t border-gray-100 my-0.5" />
            <button
              onClick={() => {
                setContextMenu(null);
                setConfirmDeleteId(contextChat.id);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 transition-colors"
            >
              <TrashIcon className="w-3.5 h-3.5" />
              Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
