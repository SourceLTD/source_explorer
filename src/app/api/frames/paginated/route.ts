import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const search = searchParams.get('search');
    const rawSortBy = searchParams.get('sortBy') || 'frame_name';
    const sortOrder = searchParams.get('sortOrder') === 'desc' ? 'desc' : 'asc';
    
    const skip = (page - 1) * limit;

    // Map sortBy to valid frame column names
    // Frames don't have 'gloss', they have 'short_definition' instead
    const sortByMap: Record<string, string> = {
      'gloss': 'short_definition',
      'createdAt': 'created_at',
      'updatedAt': 'updated_at',
    };
    
    const sortBy = sortByMap[rawSortBy] || rawSortBy;
    
    // Valid columns for sorting in the frames table
    const validSortColumns = [
      'id', 'code', 'framebank_id', 'frame_name', 'definition', 
      'short_definition', 'prototypical_synset', 'prototypical_synset_definition',
      'is_supporting_frame', 'communication', 'created_at', 'updated_at'
    ];
    
    // Validate sortBy column
    if (!validSortColumns.includes(sortBy)) {
      return NextResponse.json(
        { error: `Invalid sortBy column: ${rawSortBy}. Valid columns are: ${validSortColumns.join(', ')}` },
        { status: 400 }
      );
    }

    // Build where clause
    let where: Prisma.framesWhereInput = {};
    
    if (search) {
      where = {
        OR: [
          { frame_name: { contains: search, mode: 'insensitive' } },
          { definition: { contains: search, mode: 'insensitive' } },
          // Only allow numeric ID search, not code or framebank_id
          ...(search.match(/^\d+$/) ? [{ id: BigInt(search) }] : []),
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
      flagged: frame.flagged ?? false,
      flaggedReason: frame.flagged_reason ?? undefined,
      forbidden: frame.forbidden ?? false,
      forbiddenReason: frame.forbidden_reason ?? undefined,
      createdAt: frame.created_at.toISOString(),
      updatedAt: frame.updated_at.toISOString(),
      roles_count: frame._count.frame_roles,
      verbs_count: frame._count.verbs,
      frame_roles: frame.frame_roles.map(fr => ({
        id: fr.id.toString(),
        description: fr.description,
        notes: fr.notes,
        main: fr.main,
        examples: fr.examples,
        role_type: {
          id: fr.role_types.id.toString(),
          code: fr.role_types.code,
          label: fr.role_types.label,
          generic_description: fr.role_types.generic_description,
          explanation: fr.role_types.explanation,
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
