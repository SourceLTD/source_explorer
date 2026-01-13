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
    // Cap limit at 2000, default to 10 if invalid
    const limit = (limitParam >= 1 && limitParam <= 2000) ? limitParam : 10;
    const search = searchParams.get('search');
    const rawSortBy = searchParams.get('sortBy') || 'label';
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
      'id', 'label', 'definition', 
      'short_definition', 'prototypical_synset', 'created_at', 'updated_at'
    ];
    
    // Validate sortBy column
    if (!validSortColumns.includes(sortBy)) {
      return NextResponse.json(
        { error: `Invalid sortBy column: ${rawSortBy}. Valid columns are: ${validSortColumns.join(', ')}` },
        { status: 400 }
      );
    }

    // Build where clause - combine search with advanced filters
    let where: Prisma.framesWhereInput = {};
    
    // Parse advanced filters from URL
    const filterAST = parseURLToFilterAST('frames', searchParams);
    const { where: filterWhere } = await translateFilterASTToPrisma('frames', filterAST || undefined);
    
    // Combine basic search with advanced filters and soft delete
    const baseConditions: Prisma.framesWhereInput[] = [{ deleted: false }];
    
    if (search) {
      baseConditions.push({
        OR: [
          { label: { contains: search, mode: 'insensitive' } },
          { definition: { contains: search, mode: 'insensitive' } },
          ...(search.match(/^\d+$/) ? [{ id: BigInt(search) }] : []),
        ],
      });
    }

    if (Object.keys(filterWhere).length > 0) {
      baseConditions.push(filterWhere);
    }

    where = { AND: baseConditions };

    // Get total count
    const totalCount = await prisma.frames.count({ where });

    // Get frames with role counts, verb counts, and sample words
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
        // Include sample words from each POS (up to 3 each)
        nouns: {
          where: { deleted: false },
          select: { code: true, lemmas: true },
          take: 3,
        },
        verbs: {
          where: { deleted: false },
          select: { code: true, lemmas: true },
          take: 3,
        },
        adjectives: {
          where: { deleted: false },
          select: { code: true, lemmas: true },
          take: 3,
        },
        adverbs: {
          where: { deleted: false },
          select: { code: true, lemmas: true },
          take: 3,
        },
      },
    });

    const serializedFrames = frames.map(frame => ({
      id: frame.id.toString(),
      label: frame.label,
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
      verbs_count: frame._count.verbs,
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
      // Sample words from each POS
      words_sample: {
        nouns: frame.nouns.map(n => ({ code: n.code, lemmas: n.lemmas })),
        verbs: frame.verbs.map(v => ({ code: v.code, lemmas: v.lemmas })),
        adjectives: frame.adjectives.map(a => ({ code: a.code, lemmas: a.lemmas })),
        adverbs: frame.adverbs.map(r => ({ code: r.code, lemmas: r.lemmas })),
      },
    }));

    const totalPages = Math.ceil(totalCount / limit);

    // Attach pending change info to each frame
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
