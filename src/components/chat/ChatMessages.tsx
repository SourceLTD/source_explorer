'use client';

import type { UseChatHelpers } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { motion } from 'framer-motion';
import { ArrowDownIcon, WrenchScrewdriverIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChatMessages } from '@/hooks/useChatMessages';
import { sanitizeText } from '@/lib/chat/utils';
import PreviewAttachment from './PreviewAttachment';

interface ChatMessagesProps {
  chatId: string;
  messages: UIMessage[];
  status: UseChatHelpers<UIMessage>['status'];
}

function Greeting() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex-1 flex flex-col items-center justify-center text-center px-8"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        How can I help?
      </h3>
      <p className="text-sm text-gray-500 max-w-sm">
        Ask about frames, lexical units, semantic relations, or anything about your data.
      </p>
    </motion.div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-start gap-3 px-4 py-2">
      <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-medium text-gray-500">AI</span>
      </div>
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
        <div className="flex items-center gap-1">
          <span className="chat-thinking-dot w-1.5 h-1.5 rounded-full bg-gray-400" />
          <span className="chat-thinking-dot w-1.5 h-1.5 rounded-full bg-gray-400" />
          <span className="chat-thinking-dot w-1.5 h-1.5 rounded-full bg-gray-400" />
        </div>
      </div>
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  search_frames: 'Searching frames',
  search_superframes: 'Searching superframes',
  select_frames: 'Looking up frames',
  select_superframes: 'Looking up superframes',
  select_lexical_units: 'Looking up lexical units',
};

function ToolCallIndicator({ part }: { part: any }) {
  const toolName = part.toolName ?? part.type?.replace('tool-', '') ?? 'unknown';
  const label = TOOL_LABELS[toolName] || `Calling ${toolName}`;
  const state = part.state as string;

  const isLoading = state === 'input-streaming' || state === 'input-available';
  const isDone = state === 'output-available';
  const isError = state === 'output-error';

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      transition={{ duration: 0.2 }}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium my-1 ${
        isError
          ? 'bg-red-50 text-red-600 border border-red-200'
          : isDone
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-amber-50 text-amber-700 border border-amber-200'
      }`}
    >
      {isLoading && (
        <div className="w-3.5 h-3.5 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin flex-shrink-0" />
      )}
      {isDone && <CheckCircleIcon className="w-3.5 h-3.5 flex-shrink-0" />}
      {isError && <ExclamationCircleIcon className="w-3.5 h-3.5 flex-shrink-0" />}
      <WrenchScrewdriverIcon className="w-3.5 h-3.5 flex-shrink-0" />
      <span>{label}{isLoading ? '...' : ''}</span>
    </motion.div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user';

  const textParts = message.parts.filter(
    (p): p is { type: 'text'; text: string } => p.type === 'text',
  );
  const fileParts = message.parts.filter(
    (p): p is { type: 'file'; url: string; name: string; mediaType: string } =>
      p.type === 'file',
  );
  const toolParts = message.parts.filter(
    (p) => p.type.startsWith('tool-') || p.type === 'dynamic-tool',
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex items-start gap-3 px-4 py-2 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-medium text-gray-500">AI</span>
        </div>
      )}

      <div
        className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
          isUser
            ? 'bg-blue-50 border border-blue-200 text-gray-900'
            : 'bg-gray-50 border border-gray-200 text-gray-900'
        }`}
      >
        {fileParts.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {fileParts.map((fp, i) => (
              <PreviewAttachment key={i} url={fp.url} name={fp.name} />
            ))}
          </div>
        )}

        {textParts.map((part, i) =>
          isUser ? (
            <p key={i} className="whitespace-pre-wrap">{sanitizeText(part.text)}</p>
          ) : (
            <div key={i} className="chat-markdown prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {sanitizeText(part.text)}
              </ReactMarkdown>
            </div>
          ),
        )}

        {!isUser && toolParts.map((part, i) => (
          <ToolCallIndicator key={`tool-${i}`} part={part} />
        ))}
      </div>
    </motion.div>
  );
}

export default function ChatMessages({ chatId, messages, status }: ChatMessagesProps) {
  const {
    containerRef,
    endRef,
    isAtBottom,
    scrollToBottom,
    reset,
  } = useChatMessages({ status });

  const isThinking =
    status === 'submitted' && messages.at(-1)?.role !== 'assistant';

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        className="h-full overflow-y-auto flex flex-col"
      >
        {messages.length === 0 && !isThinking && <Greeting />}

        <div className="py-4">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {isThinking && <ThinkingIndicator />}

          <div ref={endRef} />
        </div>
      </div>

      {!isAtBottom && (
        <button
          onClick={() => scrollToBottom('smooth')}
          type="button"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white border border-gray-200 shadow-md rounded-full p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-all"
        >
          <ArrowDownIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
