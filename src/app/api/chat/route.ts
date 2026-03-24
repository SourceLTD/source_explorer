import {
  type UIMessage,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
} from 'ai';
import { after } from 'next/server';
import { createResumableStreamContext } from 'resumable-stream';
import { getCurrentUser } from '@/utils/supabase/server';
import {
  createStreamId,
  getChatById,
  saveChat,
  saveMessages,
} from '@/lib/chat/db';
import { ChatError } from '@/lib/chat/errors';
import { allowedModelIds, DEFAULT_CHAT_MODEL, getChatModel } from '@/lib/chat/models';
import { systemPrompt } from '@/lib/chat/prompts';
import { generateUUID, getTextFromMessage } from '@/lib/chat/utils';
import { chatTools } from '@/lib/chat/tools';
import { type PostRequestBody, postRequestBodySchema } from './schema';

export const maxDuration = 300;

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch (_) {
    return null;
  }
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatError('bad_request:api').toResponse();
  }

  try {
    const { id, messages: clientMessages, selectedChatModel } = requestBody;

    const user = await getCurrentUser();
    if (!user?.id) {
      return new ChatError('unauthorized:chat').toResponse();
    }

    const chatModel =
      selectedChatModel && allowedModelIds.has(selectedChatModel)
        ? selectedChatModel
        : DEFAULT_CHAT_MODEL;

    const chat = await getChatById({ id });

    const lastMessage = clientMessages[clientMessages.length - 1];
    const isNewUserMessage = lastMessage?.role === 'user';

    if (chat) {
      if (chat.user_id !== user.id) {
        return new ChatError('forbidden:chat').toResponse();
      }
    } else if (isNewUserMessage) {
      const text = getTextFromMessage(lastMessage as UIMessage).trim();
      const maxLen = 40;
      const title = text.length > maxLen
        ? text.slice(0, maxLen).trimEnd() + '...'
        : text || 'New chat';
      await saveChat({ id, userId: user.id, title });
    }

    if (isNewUserMessage) {
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: lastMessage.id,
            role: 'user',
            parts: lastMessage.parts,
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });
    }

    const uiMessages = clientMessages as UIMessage[];
    const modelMessages = await convertToModelMessages(uiMessages);

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        const result = streamText({
          model: getChatModel(chatModel),
          system: systemPrompt(),
          messages: modelMessages,
          tools: chatTools,
          stopWhen: stepCountIs(10),
        });

        dataStream.merge(result.toUIMessageStream());
      },
      generateId: generateUUID,
      onFinish: async ({ messages: finishedMessages }) => {
        if (finishedMessages.length > 0) {
          await saveMessages({
            messages: finishedMessages.map((msg) => ({
              id: msg.id,
              role: msg.role,
              parts: msg.parts as any,
              createdAt: new Date(),
              attachments: [],
              chatId: id,
            })),
          });
        }
      },
      onError: () => {
        return 'Oops, an error occurred!';
      },
    });

    return createUIMessageStreamResponse({
      stream,
      async consumeSseStream({ stream: sseStream }) {
        if (!process.env.REDIS_URL) return;
        try {
          const streamContext = getStreamContext();
          if (streamContext) {
            const streamIdValue = generateId();
            await createStreamId({ streamId: streamIdValue, chatId: id });
            await streamContext.createNewResumableStream(
              streamIdValue,
              () => sseStream,
            );
          }
        } catch (_) {
          /* non-critical */
        }
      },
    });
  } catch (error) {
    if (error instanceof ChatError) {
      return error.toResponse();
    }
    console.error('Unhandled error in chat API:', error);
    return new ChatError('offline:chat').toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new ChatError('bad_request:api').toResponse();
  }

  const user = await getCurrentUser();
  if (!user?.id) {
    return new ChatError('unauthorized:chat').toResponse();
  }

  const chat = await getChatById({ id });
  if (chat?.user_id !== user.id) {
    return new ChatError('forbidden:chat').toResponse();
  }

  const { deleteChatById } = await import('@/lib/chat/db');
  const deletedChat = await deleteChatById({ id });
  return Response.json(deletedChat, { status: 200 });
}
