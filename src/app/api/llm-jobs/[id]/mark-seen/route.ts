import { NextRequest, NextResponse } from 'next/server';
import { markJobAsSeen } from '@/lib/llm/jobs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await markJobAsSeen(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error marking job as seen:', error);
    return NextResponse.json(
      { error: 'Failed to mark job as seen' },
      { status: 500 }
    );
  }
}

