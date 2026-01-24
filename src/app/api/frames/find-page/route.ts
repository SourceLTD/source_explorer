import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/frames/find-page
 * 
 * Calculate which page a superframe appears on in the superframes table.
 * Sorts by code ascending (alphabetically) to match the intended table view.
 * 
 * Query params:
 * - id: The superframe ID to find (required)
 * - limit: Page size (default 100, max 100)
 * 
 * Returns:
 * - { page: number, found: boolean, code: string | null }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const limitParam = parseInt(searchParams.get('limit') || '100');
    const limit = Math.min(Math.max(limitParam || 100, 1), 100);

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required parameter: id' },
        { status: 400 }
      );
    }

    let targetId: bigint;
    try {
      targetId = BigInt(id);
    } catch {
      return NextResponse.json(
        { error: 'Invalid id parameter: must be a valid integer' },
        { status: 400 }
      );
    }

    // First, get the target superframe and its code
    const superframe = await prisma.frames.findFirst({
      where: {
        id: targetId,
        super_frame_id: null, // Must be a superframe (no parent)
      },
      select: { id: true, code: true },
    });

    if (!superframe) {
      return NextResponse.json(
        { page: 1, found: false, code: null },
        { status: 200 }
      );
    }

    const targetCode = superframe.code || '';

    // Count how many superframes come before this one when sorted by code ascending
    // We need to use raw SQL for case-insensitive comparison
    const countResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count 
      FROM frames 
      WHERE super_frame_id IS NULL 
        AND (
          LOWER(COALESCE(code, '')) < LOWER(${targetCode})
          OR (LOWER(COALESCE(code, '')) = LOWER(${targetCode}) AND id < ${targetId})
        )
    `;

    const countBefore = Number(countResult[0].count);

    // Calculate page number (1-indexed)
    const page = Math.floor(countBefore / limit) + 1;

    return NextResponse.json({
      page,
      found: true,
      code: superframe.code,
    });
  } catch (error) {
    console.error('Error finding page for superframe:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
