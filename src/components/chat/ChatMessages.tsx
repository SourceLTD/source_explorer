'use client';

import type { UseChatHelpers } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowDownIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChatMessages } from '@/hooks/useChatMessages';
import { sanitizeText } from '@/lib/chat/utils';
import PreviewAttachment from './PreviewAttachment';
import { QuestionCardSummary } from './QuestionCard';
import type { AskQuestionsInput } from '@/lib/chat/tools';

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
        Ask about frames, senses, semantic relations, or anything about your data.
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
  select_frames: 'Looking up frames',
  select_lexical_units: 'Looking up words',
  ask_questions: 'Waiting for your response',
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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="relative py-1.5 my-1"
    >
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t border-gray-200" />
      </div>
      <div className="relative inline-flex items-center gap-1.5 bg-gray-50 pr-2 text-xs text-gray-400 italic">
        {isLoading && (
          <span className="inline-block w-2.5 h-2.5 border-[1.5px] border-gray-300 border-t-gray-500 rounded-full animate-spin flex-shrink-0" />
        )}
        {isDone && <CheckCircleIcon className="w-3 h-3 text-green-500 flex-shrink-0" />}
        {isError && <ExclamationCircleIcon className="w-3 h-3 text-red-400 flex-shrink-0" />}
        <span>{label}{isLoading ? '…' : ''}</span>
      </div>
    </motion.div>
  );
}

function MessageBubble({
  message,
  renderedAnswerIds,
}: {
  message: UIMessage;
  renderedAnswerIds: Set<string>;
}) {
  const isUser = message.role === 'user';

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
        {message.parts.map((part, i) => {
          if (part.type === 'file') {
            const fp = part as { type: 'file'; url: string; name: string; mediaType: string };
            return (
              <div key={`file-${i}`} className="flex gap-2 mb-2 flex-wrap">
                <PreviewAttachment url={fp.url} name={fp.name} />
              </div>
            );
          }

          if (part.type === 'text') {
            const tp = part as { type: 'text'; text: string };
            return isUser ? (
              <p key={`text-${i}`} className="whitespace-pre-wrap">{sanitizeText(tp.text)}</p>
            ) : (
              <div key={`text-${i}`} className="chat-markdown prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {sanitizeText(tp.text)}
                </ReactMarkdown>
              </div>
            );
          }

          if (!isUser && (part as any).type === 'tool-ask_questions') {
            const toolPart = part as {
              type: 'tool-ask_questions';
              toolCallId: string;
              input: AskQuestionsInput;
              output?: unknown;
              state: string;
            };
            if (toolPart.state === 'output-available') {
              if (renderedAnswerIds.has(toolPart.toolCallId)) return null;
              renderedAnswerIds.add(toolPart.toolCallId);
              let skipped = false;
              let selections: Record<string, Set<string>> | undefined;
              let additionalText: string | undefined;
              try {
                const parsed = typeof toolPart.output === 'string'
                  ? JSON.parse(toolPart.output)
                  : toolPart.output;
                if (parsed?.skipped) {
                  skipped = true;
                } else if (Array.isArray(parsed?.answers)) {
                  selections = {};
                  for (const q of toolPart.input.questions) {
                    const a = parsed.answers.find((ans: any) => ans.question_id === q.id);
                    selections[q.id] = new Set(a?.selected_option_ids ?? []);
                  }
                  additionalText = parsed.answers[0]?.additional_text;
                }
              } catch {}
              return (
                <QuestionCardSummary
                  key={`question-summary-${toolPart.toolCallId}`}
                  input={toolPart.input}
                  selections={selections}
                  additionalText={additionalText}
                  skipped={skipped}
                />
              );
            }
            if (toolPart.state === 'input-available') return null;
            return <ToolCallIndicator key={`tool-${i}`} part={part} />;
          }

          if (!isUser && (part.type.startsWith('tool-') || part.type === 'dynamic-tool')) {
            return <ToolCallIndicator key={`tool-${i}`} part={part} />;
          }

          return null;
        })}
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

  const renderedAnswerIds = useMemo(() => new Set<string>(), [messages]);

  return (
    <div className="h-full overflow-y-auto flex flex-col" ref={containerRef}>
      {messages.length === 0 && !isThinking && <Greeting />}

      <div className="py-4">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            renderedAnswerIds={renderedAnswerIds}
          />
        ))}

        {isThinking && <ThinkingIndicator />}

        <div ref={endRef} />
      </div>

      {!isAtBottom && (
        <button
          onClick={() => scrollToBottom('smooth')}
          type="button"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white border border-gray-200 shadow-md rounded-full p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-all z-10"
        >
          <ArrowDownIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
