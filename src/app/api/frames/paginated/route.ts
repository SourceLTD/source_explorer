import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { parseURLToFilterAST } from '@/lib/filters/url';
import { translateFilterASTToPrisma } from '@/lib/filters/translate';
import { attachPendingInfoToEntities } from '@/lib/version-control';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limitParam = parseInt(searchParams.get('limit') || '10', 10);
    const limit = (limitParam >= 1 && limitParam <= 2000) ? limitParam : 10;
    const search = searchParams.get('search');
    const rawSortBy = searchParams.get('sortBy') || 'label';
    const sortOrder = searchParams.get('sortOrder') === 'desc' ? 'desc' : 'asc';
    const isSuperFrame = searchParams.get('isSuperFrame');
    const super_frame_id = searchParams.get('super_frame_id');
    
    const skip = (page - 1) * limit;

    const sortByMap: Record<string, string> = {
      'gloss': 'short_definition',
      'createdAt': 'created_at',
      'updatedAt': 'updated_at',
    };
    
    const sortBy = sortByMap[rawSortBy] || rawSortBy;
    
    const validSortColumns = [
      'id', 'label', 'code', 'definition', 
      'short_definition', 'prototypical_synset', 'created_at', 'updated_at'
    ];
    
    if (!validSortColumns.includes(sortBy)) {
      return NextResponse.json(
        { error: `Invalid sortBy column: ${rawSortBy}` },
        { status: 400 }
      );
    }

    let where: Prisma.framesWhereInput = {};
    const filterAST = parseURLToFilterAST('frames', searchParams);
    const { where: filterWhere } = await translateFilterASTToPrisma('frames', filterAST || undefined);
    
    const baseConditions: Prisma.framesWhereInput[] = [{ deleted: false }];
    
    if (search) {
      baseConditions.push({
        OR: [
          { label: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { definition: { contains: search, mode: 'insensitive' } },
          ...(search.match(/^\d+$/) ? [{ id: BigInt(search) }] : []),
        ],
      });
    }

    if (isSuperFrame === 'true') {
      baseConditions.push({ super_frame_id: null });
    } else if (isSuperFrame === 'false') {
      baseConditions.push({ super_frame_id: { not: null } });
    }

    if (super_frame_id) {
      baseConditions.push({ super_frame_id: BigInt(super_frame_id) });
    }

    if (Object.keys(filterWhere).length > 0) {
      baseConditions.push(filterWhere);
    }

    where = { AND: baseConditions };

    const totalCount = await prisma.frames.count({ where });

    const frames = await prisma.frames.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: {
        _count: {
          select: {
            frame_roles: true,
            other_frames: true,
            lexical_units: {
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
        // Include sample lexical units from unified lexical_units table
        lexical_units: {
          where: { deleted: false },
          select: { code: true, lemmas: true, pos: true },
          take: 11, // Take up to 11 to indicate if there are more than 10
        },
      },
    });

    const serializedFrames = frames.map(frame => {
      const lexicalUnitsCount = frame._count.lexical_units;
      const lexicalUnitSnippets = frame.lexical_units.slice(0, 10).map(lu => ({
        code: lu.code,
        lemmas: lu.lemmas,
        pos: lu.pos
      }));

      return {
        id: frame.id.toString(),
        label: frame.label,
        code: frame.code,
        definition: frame.definition,
        short_definition: frame.short_definition,
        prototypical_synset: frame.prototypical_synset,
        flagged: frame.flagged ?? false,
        flaggedReason: frame.flagged_reason ?? undefined,
        verifiable: frame.verifiable ?? true,
        unverifiableReason: frame.unverifiable_reason ?? undefined,
        createdAt: frame.created_at.toISOString(),
        updatedAt: frame.updated_at.toISOString(),
        roles_count: frame._count.frame_roles,
        lexical_units_count: lexicalUnitsCount,
        subframes_count: frame._count.other_frames,
        frame_roles: frame.frame_roles.map(fr => ({
          id: fr.id.toString(),
          description: fr.description,
          notes: fr.notes,
          main: fr.main,
          examples: fr.examples,
          label: fr.label,
          role_type: {
            id: fr.role_types.id.toString(),
            code: fr.role_types.code,
            label: fr.role_types.label,
            generic_description: fr.role_types.generic_description,
            explanation: fr.role_types.explanation,
          },
        })),
        lexical_units: {
          entries: lexicalUnitSnippets,
          totalCount: lexicalUnitsCount,
          hasMore: lexicalUnitsCount > 10,
        },
      };
    });

    const totalPages = Math.ceil(totalCount / limit);

    const dataWithPending = await attachPendingInfoToEntities(
      serializedFrames,
      'frame',
      (frame) => BigInt(frame.id)
    );

    return NextResponse.json({
      data: dataWithPending,
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
