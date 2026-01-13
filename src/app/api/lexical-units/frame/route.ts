import { NextRequest, NextResponse } from 'next/server';
import { updateFramesForEntries } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, frameId } = body ?? {};

    if (!Array.isArray(ids) || ids.length === 0 || !ids.every(id => typeof id === 'string')) {
      return NextResponse.json({ error: 'Lexical Unit IDs are required' }, { status: 400 });
    }

    if (frameId !== undefined && frameId !== null && typeof frameId !== 'string') {
      return NextResponse.json({ error: 'frameId must be a string or null' }, { status: 400 });
    }

    const normalizedFrameId =
      frameId === undefined || frameId === null
        ? null
        : frameId.trim() === '' || frameId.trim() === '__NONE__'
          ? null
          : frameId.trim();

    const { updatedCount } = await updateFramesForEntries(ids, normalizedFrameId);

    return NextResponse.json(
      {
        success: true,
        updatedCount,
        message:
          normalizedFrameId === null
            ? `Cleared frames for ${updatedCount} lexical units`
            : `Updated frames for ${updatedCount} lexical units`,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
        },
      }
    );
  } catch (error) {
    console.error('Error updating frames for lexical units:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message.startsWith('Frame not found') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
