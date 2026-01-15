import { NextRequest } from 'next/server';
import { handleFlagRequest } from '@/lib/route-handlers';

export async function PATCH(request: NextRequest) {
  return handleFlagRequest(request, 'lexical_units' as any);
}

