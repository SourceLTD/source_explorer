import { NextRequest, NextResponse } from 'next/server';
import { stageConceptRelationReparent } from '@/lib/version-control';
import { getCurrentUserName } from '@/utils/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const frameId = BigInt(idParam);

    const body = await request.json();
    const { newParentId } = body as {
      newParentId: number | string;
    };

    if (!newParentId) {
      return NextResponse.json(
        { error: 'newParentId is required' },
        { status: 400 }
      );
    }

    const newParentBigInt = BigInt(newParentId);
    const userId = await getCurrentUserName();

    const result = await stageConceptRelationReparent(
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

    console.error('[API] Error staging concept reparent:', error);
    return NextResponse.json(
      { error: 'Failed to stage concept reparent' },
      { status: 500 }
    );
  }
}
