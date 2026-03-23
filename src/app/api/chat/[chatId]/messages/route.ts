import { getCurrentUser } from '@/utils/supabase/server';
import { getChatById, getMessagesByChatId } from '@/lib/chat/db';
import { ChatError } from '@/lib/chat/errors';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chatId: string }> },
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return new ChatError('unauthorized:chat').toResponse();
  }

  const { chatId } = await params;
  const chat = await getChatById({ id: chatId });

  if (!chat) {
    return new ChatError('not_found:chat').toResponse();
  }

  if (chat.user_id !== user.id) {
    return new ChatError('forbidden:chat').toResponse();
  }

  try {
    const messages = await getMessagesByChatId({ id: chatId });
    return Response.json(messages);
  } catch (error) {
    if (error instanceof ChatError) return error.toResponse();
    return new ChatError('bad_request:database').toResponse();
  }
}
