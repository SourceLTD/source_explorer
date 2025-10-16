import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withRetry } from '@/lib/db-utils';

export async function GET() {
  try {
    // Get all unique frame IDs with their names for display
    const frames = await withRetry(
      () => prisma.frames.findMany({
        select: {
          id: true,
          frame_name: true,
        },
        orderBy: {
          frame_name: 'asc'
        }
      }),
      undefined,
      'GET /api/frames'
    );

    return NextResponse.json(frames);
  } catch (error) {
    console.error('Error fetching frames:', error);
    return NextResponse.json(
      { error: 'Failed to fetch frames' },
      { status: 500 }
    );
  }
}

