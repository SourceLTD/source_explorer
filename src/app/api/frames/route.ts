import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withRetry } from '@/lib/db-utils';
import type { Prisma } from '@prisma/client';

export async function GET() {
  try {
    // Get all unique frame IDs with their names for display
    const frames = await withRetry(
      () => prisma.frames.findMany({
        select: {
          id: true,
          frame_name: true,
        } as Prisma.framesSelect,
        orderBy: {
          frame_name: 'asc'
        }
      }),
      undefined,
      'GET /api/frames'
    );

    // Return frames for display
    const formattedFrames = frames.map(f => ({
      id: f.id.toString(),
      frame_name: f.frame_name,
    }));

    return NextResponse.json(formattedFrames);
  } catch (error) {
    console.error('Error fetching frames:', error);
    return NextResponse.json(
      { error: 'Failed to fetch frames' },
      { status: 500 }
    );
  }
}

