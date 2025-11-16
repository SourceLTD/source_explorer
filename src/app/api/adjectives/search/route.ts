import { NextRequest } from 'next/server';
import { handleSearchRequest } from '@/lib/route-handlers';

export async function GET(request: NextRequest) {
  return handleSearchRequest(request, 'adjectives');
}


