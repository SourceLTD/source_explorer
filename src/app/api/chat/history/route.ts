import { getCurrentUser } from '@/utils/supabase/server';
import { getChatsByUserId, deleteAllChatsByUserId } from '@/lib/chat/db';
import { ChatError } from '@/lib/chat/errors';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return new ChatError('unauthorized:chat').toResponse();
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);
  const startingAfter = searchParams.get('starting_after');
  const endingBefore = searchParams.get('ending_before');
  const archived = searchParams.get('archived') === 'true';

  try {
    const result = await getChatsByUserId({
      id: user.id,
      limit,
      startingAfter,
      endingBefore,
      archived,
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ChatError) return error.toResponse();
    return new ChatError('bad_request:database').toResponse();
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return new ChatError('unauthorized:chat').toResponse();
  }

  try {
    const result = await deleteAllChatsByUserId({ userId: user.id });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ChatError) return error.toResponse();
    return new ChatError('bad_request:database').toResponse();
  }
}
