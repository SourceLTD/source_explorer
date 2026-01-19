import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { parseURLToFilterAST } from '@/lib/filters/url';
import { translateFilterASTToPrisma } from '@/lib/filters/translate';
import type { PostFilterCondition } from '@/lib/filters/types';
import { attachPendingInfoToEntities } from '@/lib/version-control';

type ChildCountMode = 'super' | 'frame' | 'mixed';

function matchesComputedFilter(value: number, filter: PostFilterCondition): boolean {
  switch (filter.operator) {
    case 'eq':
      return value === filter.value;
    case 'neq':
      return value !== filter.value;
    case 'gt':
      return value > filter.value;
    case 'gte':
      return value >= filter.value;
    case 'lt':
      return value < filter.value;
    case 'lte':
      return value <= filter.value;
    case 'between':
      if (filter.value2 === undefined) return true;
      return value >= filter.value && value <= filter.value2;
    default:
      return true;
  }
}

function getChildCount(
  frame: { _count: { other_frames: number; lexical_units: number }; super_frame_id: bigint | null },
  mode: ChildCountMode
): number {
  if (mode === 'super') return frame._count.other_frames;
  if (mode === 'frame') return frame._count.lexical_units;
  return frame.super_frame_id ? frame._count.lexical_units : frame._count.other_frames;
}

function applyChildrenCountFilters<T extends { _count: { other_frames: number; lexical_units: number }; super_frame_id: bigint | null }>(
  frames: T[],
  computedFilters: PostFilterCondition[],
  mode: ChildCountMode
): T[] {
  const childFilters = computedFilters.filter(f => f.field === 'childrenCount');
  if (childFilters.length === 0) return frames;

  return frames.filter(frame => {
    const childCount = getChildCount(frame, mode);
    return childFilters.every(filter => matchesComputedFilter(childCount, filter));
  });
}

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
      'short_definition', 'created_at', 'updated_at'
    ];
    
    if (!validSortColumns.includes(sortBy)) {
      return NextResponse.json(
        { error: `Invalid sortBy column: ${rawSortBy}` },
        { status: 400 }
      );
    }

    let where: Prisma.framesWhereInput = {};
    const filterAST = parseURLToFilterAST('frames', searchParams);
    const { where: filterWhere, computedFilters } = await translateFilterASTToPrisma('frames', filterAST || undefined);
    
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

    let frames = await prisma.frames.findMany({
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
          select: { code: true, lemmas: true, src_lemmas: true, pos: true, gloss: true },
          take: 11, // Take up to 11 to indicate if there are more than 10
        },
        // Parent super-frame (for regular frames); used to render derived code prefix + pending super-frame label previews.
        frames: {
          select: {
            id: true,
            label: true,
            code: true,
          },
        },
      },
    });

    const childCountMode: ChildCountMode =
      isSuperFrame === 'true' ? 'super' : isSuperFrame === 'false' ? 'frame' : 'mixed';
    if (computedFilters.length > 0) {
      frames = applyChildrenCountFilters(frames, computedFilters, childCountMode);
    }

    // Attach pending info to super-frames referenced on this page so child frames can preview
    // derived code prefix when the super-frame label is pending-changed.
    const superFramesById = new Map<string, { id: string; label: string; code: string | null }>();
    for (const f of frames) {
      const sf = (f as any).frames as { id: bigint; label: string; code: string | null } | null | undefined;
      if (!sf?.id) continue;
      const id = sf.id.toString();
      if (!superFramesById.has(id)) {
        superFramesById.set(id, { id, label: sf.label, code: sf.code });
      }
    }

    const superFramesWithPending =
      superFramesById.size > 0
        ? await attachPendingInfoToEntities(
            Array.from(superFramesById.values()),
            'frame',
            (sf) => BigInt(sf.id)
          )
        : [];
    const superFrameByIdWithPending = new Map(superFramesWithPending.map(sf => [sf.id, sf]));

    const serializedFrames = frames.map(frame => {
      const lexicalUnitsCount = frame._count.lexical_units;
      const lexicalUnitSnippets = frame.lexical_units.slice(0, 10).map(lu => ({
        code: lu.code,
        lemmas: lu.lemmas,
        src_lemmas: lu.src_lemmas,
        pos: lu.pos,
        gloss: lu.gloss
      }));

      return {
        id: frame.id.toString(),
        label: frame.label,
        code: frame.code,
        super_frame_id: frame.super_frame_id?.toString() ?? null,
        super_frame: (() => {
          const sf = (frame as any).frames as { id: bigint; label: string; code: string | null } | null | undefined;
          const sfId = sf?.id ? sf.id.toString() : null;
          const sfPendingApplied = sfId ? superFrameByIdWithPending.get(sfId) : null;
          if (sfPendingApplied) {
            return {
              id: sfPendingApplied.id,
              label: sfPendingApplied.label,
              code: sfPendingApplied.code ?? null,
            };
          }
          if (!sfId) return null;
          return {
            id: sfId,
            label: sf?.label ?? 'Unknown',
            code: sf?.code ?? null,
          };
        })(),
        definition: frame.definition,
        short_definition: frame.short_definition,
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
        lexical_entries: {
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
