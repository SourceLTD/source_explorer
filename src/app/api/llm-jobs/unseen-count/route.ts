import { NextRequest, NextResponse } from 'next/server';
import { getUnseenJobsCount } from '@/lib/llm/jobs';

export async function GET(request: NextRequest) {
  try {
    const pos = request.nextUrl.searchParams.get('pos') as any;
    const count = await getUnseenJobsCount(pos || undefined);
    return NextResponse.json({ count });
  } catch (error) {
    console.error(`[API] Error in unseen-count (pos=${request.nextUrl.searchParams.get('pos')}):`, error);
    
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
