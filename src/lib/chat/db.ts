import { prisma } from '@/lib/prisma';
import { ChatError } from './errors';

export async function saveChat({
  id,
  userId,
  title,
}: {
  id: string;
  userId: string;
  title: string;
}) {
  try {
    return await prisma.chat_conversations.create({
      data: { id, user_id: userId, title },
    });
  } catch (_error) {
    throw new ChatError('bad_request:database', 'Failed to save chat');
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    return await prisma.chat_conversations.findUnique({ where: { id } });
  } catch (_error) {
    throw new ChatError('bad_request:database', 'Failed to get chat by id');
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    let cursor: { created_at: Date } | undefined;

    if (startingAfter) {
      const ref = await prisma.chat_conversations.findUnique({
        where: { id: startingAfter },
        select: { created_at: true },
      });
      if (!ref) throw new ChatError('not_found:database', `Chat ${startingAfter} not found`);
      cursor = { created_at: ref.created_at };
    } else if (endingBefore) {
      const ref = await prisma.chat_conversations.findUnique({
        where: { id: endingBefore },
        select: { created_at: true },
      });
      if (!ref) throw new ChatError('not_found:database', `Chat ${endingBefore} not found`);
      cursor = { created_at: ref.created_at };
    }

    const chats = await prisma.chat_conversations.findMany({
      where: {
        user_id: id,
        ...(cursor && startingAfter
          ? { created_at: { gt: cursor.created_at } }
          : cursor && endingBefore
            ? { created_at: { lt: cursor.created_at } }
            : {}),
      },
      orderBy: { created_at: 'desc' },
      take: extendedLimit,
    });

    const hasMore = chats.length > limit;
    return {
      chats: hasMore ? chats.slice(0, limit) : chats,
      hasMore,
    };
  } catch (_error) {
    if (_error instanceof ChatError) throw _error;
    throw new ChatError('bad_request:database', 'Failed to get chats by user id');
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    return await prisma.chat_conversations.delete({ where: { id } });
  } catch (_error) {
    throw new ChatError('bad_request:database', 'Failed to delete chat');
  }
}

export async function deleteAllChatsByUserId({ userId }: { userId: string }) {
  try {
    const result = await prisma.chat_conversations.deleteMany({
      where: { user_id: userId },
    });
    return { deletedCount: result.count };
  } catch (_error) {
    throw new ChatError('bad_request:database', 'Failed to delete all chats');
  }
}

export async function updateChatTitleById({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}) {
  try {
    return await prisma.chat_conversations.update({
      where: { id: chatId },
      data: { title },
    });
  } catch (_error) {
    // Non-critical: title update failure shouldn't break the chat
  }
}

export async function saveMessages({
  messages,
}: {
  messages: Array<{
    id: string;
    chatId: string;
    role: string;
    parts: unknown;
    attachments?: unknown;
    createdAt: Date;
  }>;
}) {
  try {
    return await prisma.chat_messages.createMany({
      data: messages.map((m) => ({
        id: m.id,
        chat_id: m.chatId,
        role: m.role,
        parts: m.parts as any,
        attachments: (m.attachments ?? []) as any,
        created_at: m.createdAt,
      })),
    });
  } catch (_error) {
    throw new ChatError('bad_request:database', 'Failed to save messages');
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await prisma.chat_messages.findMany({
      where: { chat_id: id },
      orderBy: { created_at: 'asc' },
    });
  } catch (_error) {
    throw new ChatError('bad_request:database', 'Failed to get messages');
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    return await prisma.chat_messages.deleteMany({
      where: {
        chat_id: chatId,
        created_at: { gte: timestamp },
      },
    });
  } catch (_error) {
    throw new ChatError('bad_request:database', 'Failed to delete messages');
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await prisma.chat_streams.create({
      data: { id: streamId, chat_id: chatId },
    });
  } catch (_error) {
    throw new ChatError('bad_request:database', 'Failed to create stream id');
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streams = await prisma.chat_streams.findMany({
      where: { chat_id: chatId },
      orderBy: { created_at: 'asc' },
      select: { id: true },
    });
    return streams.map(({ id }: { id: string }) => id);
  } catch (_error) {
    throw new ChatError('bad_request:database', 'Failed to get stream ids');
  }
}
