import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, updates } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'ids must be a non-empty array' },
        { status: 400 }
      );
    }

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json(
        { error: 'updates must be an object' },
        { status: 400 }
      );
    }

    // Convert string IDs to BigInt
    const bigIntIds = ids.map((id: string) => BigInt(id));

    // Build update object
    const updateData: Record<string, unknown> = {};
    
    if (updates.flagged !== undefined) updateData.flagged = updates.flagged;
    if (updates.flaggedReason !== undefined) updateData.flagged_reason = updates.flaggedReason;
    if (updates.forbidden !== undefined) updateData.forbidden = updates.forbidden;
    if (updates.forbiddenReason !== undefined) updateData.forbidden_reason = updates.forbiddenReason;
    
    updateData.updated_at = new Date();

    // Update all frames
    const result = await prisma.frames.updateMany({
      where: {
        id: {
          in: bigIntIds,
        },
      },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      count: Number(result.count),
    });
  } catch (error) {
    console.error('[API] Error updating frame moderation:', error);
    return NextResponse.json(
      { error: 'Failed to update frame moderation' },
      { status: 500 }
    );
  }
}

