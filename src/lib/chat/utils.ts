import type { UIMessage } from 'ai';
import { formatISO } from 'date-fns';

export type DBChatMessage = {
  id: string;
  chat_id: string;
  role: string;
  parts: unknown;
  attachments: unknown;
  created_at: Date;
};

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function convertToUIMessages(messages: DBChatMessage[]): UIMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role as 'user' | 'assistant' | 'system',
    parts: message.parts as UIMessage['parts'],
    metadata: {
      createdAt: formatISO(message.created_at),
    },
  }));
}

export function getTextFromMessage(message: UIMessage): string {
  return message.parts
    .filter((part): part is Extract<UIMessage['parts'][number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

export function sanitizeText(text: string) {
  return text.replace(/\xA0/g, ' ');
}

export const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || data.code || 'Request failed');
  }
  return response.json();
};
