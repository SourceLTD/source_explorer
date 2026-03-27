import { NextRequest, NextResponse } from 'next/server';
import { stageFrameRelationReparent } from '@/lib/version-control';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const frameId = BigInt(idParam);

    const body = await request.json();
    const { newParentId, userId = 'user' } = body as {
      newParentId: number | string;
      userId?: string;
    };

    if (!newParentId) {
      return NextResponse.json(
        { error: 'newParentId is required' },
        { status: 400 }
      );
    }

    const newParentBigInt = BigInt(newParentId);

    const result = await stageFrameRelationReparent(
      frameId,
      newParentBigInt,
      userId,
    );

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (
      message.includes('not found') ||
      message.includes('deleted') ||
      message.includes('cycle') ||
      message.includes('cannot inherit from itself')
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error('[API] Error staging frame reparent:', error);
    return NextResponse.json(
      { error: 'Failed to stage frame reparent' },
      { status: 500 }
    );
  }
}
