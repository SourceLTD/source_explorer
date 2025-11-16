import { NextRequest, NextResponse } from 'next/server';
import { getUnseenJobsCount } from '@/lib/llm/jobs';
import type { PartOfSpeech } from '@/lib/llm/types';

export async function GET(request: NextRequest) {
  try {
    const pos = request.nextUrl.searchParams.get('pos') as PartOfSpeech | null;
    const count = await getUnseenJobsCount(pos || undefined);
    return NextResponse.json({ count });
  } catch (error) {
    console.error('Error getting unseen jobs count:', error);
    return NextResponse.json(
      { error: 'Failed to get unseen count' },
      { status: 500 }
    );
  }
}

