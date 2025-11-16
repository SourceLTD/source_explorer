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
        frame_roles: {
          include: {
            role_types: true,
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
      createdAt: frame.created_at.toISOString(),
      updatedAt: frame.updated_at.toISOString(),
      roles_count: frame._count.frame_roles,
      verbs_count: frame._count.verbs,
      frame_roles: frame.frame_roles.map(fr => ({
        id: fr.id.toString(),
        description: fr.description,
        notes: fr.notes,
        main: fr.main,
        role_type: {
          id: fr.role_types.id.toString(),
          code: fr.role_types.code,
          label: fr.role_types.label,
          generic_description: fr.role_types.generic_description,
        },
      })),
    }));

    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json({
      data: serializedFrames,
      total: totalCount,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    });
  } catch (error) {
    console.error('[API] Error fetching paginated frames:', error);
    return NextResponse.json(
      { error: 'Failed to fetch frames' },
      { status: 500 }
    );
  }
}
