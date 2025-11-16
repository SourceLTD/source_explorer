import { NextRequest } from 'next/server';
import { handlePaginatedRequest } from '@/lib/route-handlers';

export async function GET(request: NextRequest) {
  return handlePaginatedRequest(request, 'adverbs');
}
