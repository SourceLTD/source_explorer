import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { stageFrameRolesUpdate } from '@/lib/version-control';
import { getCurrentUserName } from '@/utils/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const frameId = BigInt(idParam);
    const body = await request.json();
    
    const { roles } = body;

    if (!Array.isArray(roles)) {
      return NextResponse.json(
        { error: 'roles must be an array' },
        { status: 400 }
      );
    }

    // Check if frame exists
    const existingFrame = await prisma.frames.findUnique({
      where: { id: frameId },
    });

    if (!existingFrame) {
      return NextResponse.json(
        { error: 'Frame not found' },
        { status: 404 }
      );
    }

    const userId = await getCurrentUserName();

    const response = await stageFrameRolesUpdate(idParam, roles, userId);

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[API] Error staging frame roles update:', error);
    return NextResponse.json(
      { error: 'Failed to stage frame roles update' },
      { status: 500 }
    );
  }
}
