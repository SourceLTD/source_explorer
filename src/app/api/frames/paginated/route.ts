import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const search = searchParams.get('search');
    const sortBy = searchParams.get('sortBy') || 'frame_name';
    const sortOrder = searchParams.get('sortOrder') === 'desc' ? 'desc' : 'asc';
    
    const skip = (page - 1) * limit;

    // Build where clause
    let where: Prisma.framesWhereInput = {};
    
    if (search) {
      where = {
        OR: [
          { frame_name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { framebank_id: { contains: search, mode: 'insensitive' } },
          { definition: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    // Get total count
    const totalCount = await prisma.frames.count({ where });

    // Get frames with role counts and verb counts
    const frames = await prisma.frames.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: {
        _count: {
          select: {
            frame_roles: true,
            verbs: {
              where: {
                deleted: false,
              },
            },
          },
        },
      },
    });

    const serializedFrames = frames.map(frame => ({
      id: frame.id.toString(),
      code: frame.code,
      framebank_id: frame.framebank_id,
      frame_name: frame.frame_name,
      definition: frame.definition,
      short_definition: frame.short_definition,
      prototypical_synset: frame.prototypical_synset,
      prototypical_synset_definition: frame.prototypical_synset_definition,
      is_supporting_frame: frame.is_supporting_frame,
      communication: frame.communication,
      created_at: frame.created_at.toISOString(),
      updated_at: frame.updated_at.toISOString(),
      roles_count: frame._count.frame_roles,
      verbs_count: frame._count.verbs,
    }));

    return NextResponse.json({
      entries: serializedFrames,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error) {
    console.error('[API] Error fetching paginated frames:', error);
    return NextResponse.json(
      { error: 'Failed to fetch frames' },
      { status: 500 }
    );
  }
}
