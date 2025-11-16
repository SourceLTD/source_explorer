import { NextRequest } from 'next/server';
import { handleModerationRequest } from '@/lib/route-handlers';

export async function PATCH(request: NextRequest) {
  return handleModerationRequest(request, 'adjectives');
}


