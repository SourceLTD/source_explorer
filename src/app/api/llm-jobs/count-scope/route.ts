import { NextRequest, NextResponse } from 'next/server';
import { countEntriesForScope } from '@/lib/llm/entries';
import type { JobScope } from '@/lib/llm/types';

/**
 * Quickly counts entries in a scope without fetching them all
 * Used by frontend to determine if batching is needed
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as { scope: JobScope };
    
    if (!payload.scope || typeof payload.scope !== 'object') {
      return NextResponse.json({ error: 'scope is required.' }, { status: 400 });
    }

    const count = await countEntriesForScope(payload.scope);
    return NextResponse.json({ count });
  } catch (error) {
    console.error('[LLM] Failed to count scope:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to count scope' },
      { status: 500 }
    );
  }
}

