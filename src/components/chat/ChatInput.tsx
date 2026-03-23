'use client';

import type { UIMessage } from 'ai';
import type { UseChatHelpers } from '@ai-sdk/react';
import {
  ArrowUpIcon,
  StopIcon,
  PaperClipIcon,
} from '@heroicons/react/24/outline';
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import toast from 'react-hot-toast';
import { useLocalStorage } from 'usehooks-ts';
import type { SlashCommand } from './SlashCommands';
import SlashCommandMenu, { slashCommands } from './SlashCommands';
import ModelSelector from './ModelSelector';
import PreviewAttachment from './PreviewAttachment';

type Attachment = { name: string; url: string; contentType: string };

interface ChatInputProps {
  chatId: string;
  input: string;
  setInput: (input: string) => void;
  status: UseChatHelpers<UIMessage>['status'];
  stop: () => void;
  sendMessage: UseChatHelpers<UIMessage>['sendMessage'];
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
}

export default function ChatInput({
  chatId,
  input,
  setInput,
  status,
  stop,
  sendMessage,
  selectedModelId,
  onModelChange,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localStorageInput, setLocalStorageInput] = useLocalStorage('chat-input', '');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);

  const isStreaming = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    if (localStorageInput && !input) {
      setInput(localStorageInput);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const submitForm = useCallback(() => {
    if (!input.trim() && attachments.length === 0) return;

    sendMessage({
      role: 'user',
      parts: [
        ...attachments.map((a) => ({
          type: 'file' as const,
          url: a.url,
          name: a.name,
          mediaType: a.contentType,
        })),
        { type: 'text' as const, text: input },
      ],
    });

    setAttachments([]);
    setLocalStorageInput('');
    setInput('');
    textareaRef.current?.focus();
  }, [input, attachments, sendMessage, setInput, setLocalStorageInput]);

  const uploadFile = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch('/api/chat/files/upload', {
        method: 'POST',
        body: formData,
      });
      if (response.ok) {
        const data = await response.json();
        return { url: data.url, name: data.name, contentType: data.contentType };
      }
      const { error } = await response.json();
      toast.error(error || 'Upload failed');
    } catch (_) {
      toast.error('Failed to upload file');
    }
    return undefined;
  }, []);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      setUploadQueue(files.map((f) => f.name));
      try {
        const results = await Promise.all(files.map(uploadFile));
        const uploaded = results.filter((r): r is Attachment => r !== undefined);
        setAttachments((prev) => [...prev, ...uploaded]);
      } finally {
        setUploadQueue([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [uploadFile],
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handlePaste = async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      const imageItems = Array.from(items).filter((item) =>
        item.type.startsWith('image/'),
      );
      if (imageItems.length === 0) return;
      event.preventDefault();
      setUploadQueue((prev) => [...prev, 'Pasted image']);
      try {
        const files = imageItems
          .map((item) => item.getAsFile())
          .filter((f): f is File => f !== null);
        const results = await Promise.all(files.map(uploadFile));
        const uploaded = results.filter((r): r is Attachment => r !== undefined);
        setAttachments((prev) => [...prev, ...uploaded]);
      } finally {
        setUploadQueue([]);
      }
    };

    textarea.addEventListener('paste', handlePaste);
    return () => textarea.removeEventListener('paste', handlePaste);
  }, [uploadFile]);

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    if (val.startsWith('/') && !val.includes(' ')) {
      setSlashOpen(true);
      setSlashQuery(val.slice(1));
      setSlashIndex(0);
    } else {
      setSlashOpen(false);
    }
  };

  const handleSlashSelect = (cmd: SlashCommand) => {
    setSlashOpen(false);
    setInput('');
    switch (cmd.action) {
      case 'new':
        window.dispatchEvent(new CustomEvent('chat:new'));
        break;
      case 'clear':
        window.dispatchEvent(new CustomEvent('chat:clear'));
        break;
      case 'delete':
        window.dispatchEvent(new CustomEvent('chat:delete'));
        break;
      case 'purge':
        window.dispatchEvent(new CustomEvent('chat:purge'));
        break;
      case 'model': {
        const btn = document.querySelector<HTMLButtonElement>('[data-testid="model-selector"] button');
        btn?.click();
        break;
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashOpen) {
      const filtered = slashCommands.filter((cmd) =>
        cmd.name.startsWith(slashQuery.toLowerCase()),
      );
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((prev) => Math.min(prev + 1, filtered.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' && filtered[slashIndex]) {
        e.preventDefault();
        handleSlashSelect(filtered[slashIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setSlashOpen(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming) submitForm();
    }
  };

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      {(attachments.length > 0 || uploadQueue.length > 0) && (
        <div className="flex gap-2 mb-2 flex-wrap">
          {attachments.map((a, i) => (
            <PreviewAttachment
              key={a.url}
              url={a.url}
              name={a.name}
              onRemove={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
            />
          ))}
          {uploadQueue.map((name) => (
            <PreviewAttachment key={name} url="" name={name} isUploading />
          ))}
        </div>
      )}

      <div className="relative">
        {slashOpen && (
          <SlashCommandMenu
            query={slashQuery}
            selectedIndex={slashIndex}
            onSelect={handleSlashSelect}
          />
        )}

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100"
            title="Attach image"
          >
            <PaperClipIcon className="w-5 h-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            onChange={handleFileChange}
            className="hidden"
            multiple
          />

          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Message Source Explorer..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 max-h-40"
            disabled={isStreaming}
          />

          {isStreaming ? (
            <button
              type="button"
              onClick={stop}
              className="flex-shrink-0 p-2 bg-gray-100 text-gray-700 rounded-xl border border-gray-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-colors"
              title="Stop"
            >
              <StopIcon className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submitForm}
              disabled={!input.trim() && attachments.length === 0}
              className="flex-shrink-0 p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Send"
            >
              <ArrowUpIcon className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between mt-2 px-1">
          <ModelSelector
            selectedModelId={selectedModelId}
            onModelChange={onModelChange}
          />
          <span className="text-xs text-gray-400">
            Shift+Enter for new line
          </span>
        </div>
      </div>
    </div>
  );
}
