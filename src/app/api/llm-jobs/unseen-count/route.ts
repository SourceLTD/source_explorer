import { NextRequest, NextResponse } from 'next/server';
import { getUnseenJobsCount } from '@/lib/llm/jobs';
import type { PartOfSpeech } from '@/lib/llm/types';

export async function GET(request: NextRequest) {
  try {
    const pos = request.nextUrl.searchParams.get('pos') as PartOfSpeech | null;
    const count = await getUnseenJobsCount(pos || undefined);
    return NextResponse.json({ count });
  } catch (error) {
    console.error(`[API] Error in unseen-count (pos=${request.nextUrl.searchParams.get('pos')}):`, error);
    
    // Check if it's a connection/timeout error
    const isTimeout = error instanceof Error && (
      error.message.includes('Timed out') || 
      error.message.includes('connection')
    );
    
    return NextResponse.json(
      { 
        error: 'Failed to get unseen count',
        details: error instanceof Error ? error.message : String(error),
        isTimeout
      },
      { status: isTimeout ? 504 : 500 }
    );
  }
}

