'use server';

import { generateText, type UIMessage } from 'ai';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/utils/supabase/server';
import {
  deleteMessagesByChatIdAfterTimestamp,
  getChatById,
} from './db';
import { getTitleModel } from './models';
import { titlePrompt } from './prompts';
import { getTextFromMessage } from './utils';

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set('chat-model', model, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function generateTitleFromUserMessage({
  message,
}: {
  message: UIMessage;
}) {
  const { text } = await generateText({
    model: getTitleModel(),
    system: titlePrompt,
    prompt: getTextFromMessage(message),
  });

  return text
    .replace(/^[#*"\s]+/, '')
    .replace(/["]+$/, '')
    .trim();
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const user = await getCurrentUser();
  if (!user?.id) throw new Error('Unauthorized');

  const chat = await getChatById({ id });
  if (!chat || chat.user_id !== user.id) throw new Error('Unauthorized');

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: id,
    timestamp: new Date(),
  });
}
