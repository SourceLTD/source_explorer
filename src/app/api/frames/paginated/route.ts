import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { parseURLToFilterAST } from '@/lib/filters/url';
import { translateFilterASTToPrisma } from '@/lib/filters/translate';
import type { BooleanFilterGroup, BooleanFilterNode, BooleanFilterRule, PostFilterCondition } from '@/lib/filters/types';
import { attachPendingInfoToEntities } from '@/lib/version-control';

type ChildCountMode = 'super' | 'frame' | 'mixed';

const FRAME_TABLE_ALIAS = 'f';
const FRAME_ID_REF = Prisma.raw('f."id"');
const FRAME_SUPER_ID_REF = Prisma.raw('f."super_frame_id"');

function toSqlDateEndOfDay(value: string): Date {
  return new Date(`${value}T23:59:59.999Z`);
}

function buildTextRuleSql(column: string, rule: BooleanFilterRule): Prisma.Sql | null {
  const raw = String(rule.value ?? '').trim();
  if (!raw) return null;
  const col = Prisma.raw(`${FRAME_TABLE_ALIAS}.${column}`);
  switch (rule.operator) {
    case 'contains':
      return Prisma.sql`${col} ILIKE ${`%${raw}%`}`;
    case 'not_contains':
      return Prisma.sql`${col} NOT ILIKE ${`%${raw}%`}`;
    case 'starts_with':
      return Prisma.sql`${col} ILIKE ${`${raw}%`}`;
    case 'ends_with':
      return Prisma.sql`${col} ILIKE ${`%${raw}`}`;
    default:
      return null;
  }
}

function buildBooleanRuleSql(column: string, rule: BooleanFilterRule): Prisma.Sql | null {
  if (rule.operator !== 'is') return null;
  return Prisma.sql`${Prisma.raw(`${FRAME_TABLE_ALIAS}.${column}`)} = ${Boolean(rule.value)}`;
}

function buildDateRuleSql(column: string, rule: BooleanFilterRule): Prisma.Sql | null {
  const raw = String(rule.value ?? '').trim();
  if (!raw) return null;
  const col = Prisma.raw(`${FRAME_TABLE_ALIAS}.${column}`);
  if (rule.operator === 'after') {
    return Prisma.sql`${col} >= ${new Date(raw)}`;
  }
  if (rule.operator === 'before') {
    return Prisma.sql`${col} <= ${toSqlDateEndOfDay(raw)}`;
  }
  if (rule.operator === 'between') {
    const raw2 = String(rule.value2 ?? '').trim();
    if (!raw2) return null;
    return Prisma.sql`${col} BETWEEN ${new Date(raw)} AND ${toSqlDateEndOfDay(raw2)}`;
  }
  return null;
}

function buildFilterRuleSql(rule: BooleanFilterRule): Prisma.Sql | null {
  switch (rule.field) {
    case 'label':
      return buildTextRuleSql('label', rule);
    case 'definition':
      return buildTextRuleSql('definition', rule);
    case 'short_definition':
      return buildTextRuleSql('short_definition', rule);
    case 'flagged_reason':
      return buildTextRuleSql('flagged_reason', rule);
    case 'unverifiable_reason':
      return buildTextRuleSql('unverifiable_reason', rule);
    case 'flagged':
      return buildBooleanRuleSql('flagged', rule);
    case 'verifiable':
      return buildBooleanRuleSql('verifiable', rule);
    case 'created_at':
      return buildDateRuleSql('created_at', rule);
    case 'updated_at':
      return buildDateRuleSql('updated_at', rule);
    default:
      return null;
  }
}

function buildFilterSql(node?: BooleanFilterNode | null): Prisma.Sql | null {
  if (!node) return null;
  if (node.kind === 'rule') {
    return buildFilterRuleSql(node);
  }
  const group = node as BooleanFilterGroup;
  const children = group.children
    .map(buildFilterSql)
    .filter((sql): sql is Prisma.Sql => Boolean(sql));
  if (children.length === 0) return null;
  const joiner = group.op === 'or' ? ' OR ' : ' AND ';
  return Prisma.sql`(${Prisma.join(children, joiner)})`;
}

function buildChildrenCountSql(
  computedFilters: PostFilterCondition[],
  mode: ChildCountMode
): Prisma.Sql | null {
  const childFilters = computedFilters.filter(f => f.field === 'childrenCount');
  if (childFilters.length === 0) return null;

  const frameChildCount = Prisma.sql`
    (SELECT COUNT(*) FROM frames sf WHERE sf.super_frame_id = ${FRAME_ID_REF} AND sf.deleted = false)
  `;
  const lexicalUnitCount = Prisma.sql`
    (SELECT COUNT(*) FROM lexical_units lu WHERE lu.frame_id = ${FRAME_ID_REF} AND COALESCE(lu.deleted, false) = false)
  `;

  const childCountExpr =
    mode === 'super'
      ? frameChildCount
      : mode === 'frame'
        ? lexicalUnitCount
        : Prisma.sql`CASE WHEN ${FRAME_SUPER_ID_REF} IS NULL THEN ${frameChildCount} ELSE ${lexicalUnitCount} END`;

  const conditions = childFilters.map(filter => {
    const value = Number(filter.value);
    if (Number.isNaN(value)) return null;
    switch (filter.operator) {
      case 'eq':
        return Prisma.sql`${childCountExpr} = ${value}`;
      case 'neq':
        return Prisma.sql`${childCountExpr} <> ${value}`;
      case 'gt':
        return Prisma.sql`${childCountExpr} > ${value}`;
      case 'gte':
        return Prisma.sql`${childCountExpr} >= ${value}`;
      case 'lt':
        return Prisma.sql`${childCountExpr} < ${value}`;
      case 'lte':
        return Prisma.sql`${childCountExpr} <= ${value}`;
      case 'between': {
        const value2 = filter.value2 !== undefined ? Number(filter.value2) : NaN;
        if (Number.isNaN(value2)) return null;
        return Prisma.sql`${childCountExpr} BETWEEN ${value} AND ${value2}`;
      }
      default:
        return null;
    }
  }).filter((sql): sql is Prisma.Sql => Boolean(sql));

  if (conditions.length === 0) return null;
  return Prisma.sql`(${Prisma.join(conditions, ' AND ')})`;
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

    const childCountMode: ChildCountMode =
      isSuperFrame === 'true' ? 'super' : isSuperFrame === 'false' ? 'frame' : 'mixed';
    const hasChildrenCountFilter = computedFilters.some(filter => filter.field === 'childrenCount');
    const filterSql = buildFilterSql(filterAST);
    const childrenCountSql = hasChildrenCountFilter ? buildChildrenCountSql(computedFilters, childCountMode) : null;

    const sqlConditions: Prisma.Sql[] = [Prisma.sql`f.deleted = false`];

    if (search) {
      const searchConditions: Prisma.Sql[] = [
        Prisma.sql`f.label ILIKE ${`%${search}%`}`,
        Prisma.sql`f.code ILIKE ${`%${search}%`}`,
        Prisma.sql`f.definition ILIKE ${`%${search}%`}`,
      ];
      if (search.match(/^\d+$/)) {
        searchConditions.push(Prisma.sql`f.id = ${BigInt(search)}`);
      }
      sqlConditions.push(Prisma.sql`(${Prisma.join(searchConditions, ' OR ')})`);
    }

    if (isSuperFrame === 'true') {
      sqlConditions.push(Prisma.sql`f.super_frame_id IS NULL`);
    } else if (isSuperFrame === 'false') {
      sqlConditions.push(Prisma.sql`f.super_frame_id IS NOT NULL`);
    }

    if (super_frame_id) {
      sqlConditions.push(Prisma.sql`f.super_frame_id = ${BigInt(super_frame_id)}`);
    }

    if (filterSql) {
      sqlConditions.push(filterSql);
    }

    if (childrenCountSql) {
      sqlConditions.push(childrenCountSql);
    }

    const whereSql =
      sqlConditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(sqlConditions, ' AND ')}` : Prisma.sql``;
    const orderBySql = Prisma.sql`ORDER BY ${Prisma.raw(`f.${sortBy}`)} ${Prisma.raw(sortOrder)}`;

    let totalCount = 0;
    let frames: Array<Prisma.framesGetPayload<{
      include: {
        _count: { select: { frame_roles: true; other_frames: true; lexical_units: true } };
        frame_roles: { include: { role_types: true } };
        lexical_units: { select: { code: true; lemmas: true; src_lemmas: true; pos: true; gloss: true } };
        frames: { select: { id: true; label: true; code: true } };
      }
    }>> = [];

    if (hasChildrenCountFilter) {
      const totalRows = await prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS total
        FROM frames f
        ${whereSql}
      `);
      totalCount = Number(totalRows[0]?.total ?? 0);

      const idRows = await prisma.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
        SELECT f.id
        FROM frames f
        ${whereSql}
        ${orderBySql}
        LIMIT ${limit} OFFSET ${skip}
      `);
      const pageIds = idRows.map(row => row.id);

      if (pageIds.length > 0) {
        const fetchedFrames = await prisma.frames.findMany({
          where: { id: { in: pageIds } },
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
        const framesById = new Map(fetchedFrames.map(frame => [frame.id.toString(), frame]));
        frames = pageIds
          .map(id => framesById.get(id.toString()))
          .filter((frame): frame is (typeof fetchedFrames)[number] => Boolean(frame));
      }
    } else {
      totalCount = await prisma.frames.count({ where });
      frames = await prisma.frames.findMany({
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
