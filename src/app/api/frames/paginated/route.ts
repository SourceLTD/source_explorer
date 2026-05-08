import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { parseURLToFilterAST } from '@/lib/filters/url';
import { translateFilterASTToPrisma } from '@/lib/filters/translate';
import type { BooleanFilterGroup, BooleanFilterNode, BooleanFilterRule, PostFilterCondition } from '@/lib/filters/types';
import { attachPendingInfoToEntities } from '@/lib/version-control';

type ChildCountMode = 'frame';

const FRAME_TABLE_ALIAS = 'f';
const FRAME_ID_REF = Prisma.raw('f."id"');

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
    case 'subtype':
      return buildTextRuleSql('subtype', rule);
    case 'flagged_reason':
      return buildTextRuleSql('flagged_reason', rule);
    case 'unverifiable_reason':
      return buildTextRuleSql('unverifiable_reason', rule);
    case 'flagged':
      return buildBooleanRuleSql('flagged', rule);
    case 'verifiable':
      return buildBooleanRuleSql('verifiable', rule);
    case 'disable_healthcheck':
      return buildBooleanRuleSql('disable_healthcheck', rule);
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

  // Distinct LUs reachable through the frame's senses:
  // frame → frame_sense_frames → frame_senses → lexical_unit_senses → lexical_units.
  const childCountExpr = Prisma.sql`
    (SELECT COUNT(DISTINCT lus.lexical_unit_id)
     FROM frame_sense_frames fsf
     JOIN lexical_unit_senses lus ON lus.frame_sense_id = fsf.frame_sense_id
     JOIN lexical_units lu ON lu.id = lus.lexical_unit_id
     WHERE fsf.frame_id = ${FRAME_ID_REF} AND COALESCE(lu.deleted, false) = false)
  `;

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
    const parent_frame_id = searchParams.get('parent_frame_id');
    
    const skip = (page - 1) * limit;

    const sortByMap: Record<string, string> = {
      'gloss': 'short_definition',
      'createdAt': 'created_at',
      'updatedAt': 'updated_at',
    };
    
    const sortBy = sortByMap[rawSortBy] || rawSortBy;
    
    const validSortColumns = [
      'id', 'label', 'code', 'definition', 
      'short_definition', 'subtype', 'disable_healthcheck', 'created_at', 'updated_at'
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

    if (parent_frame_id) {
      baseConditions.push({
        frame_relations_frame_relations_target_idToframes: {
          some: {
            source_id: BigInt(parent_frame_id),
            type: 'parent_of',
          },
        },
      });
    }

    if (Object.keys(filterWhere).length > 0) {
      baseConditions.push(filterWhere);
    }

    where = { AND: baseConditions };

    const childCountMode: ChildCountMode = 'frame';
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

    if (parent_frame_id) {
      sqlConditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM frame_relations fr
        WHERE fr.target_id = f.id
          AND fr.source_id = ${BigInt(parent_frame_id)}
          AND fr.type = 'parent_of'
      )`);
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
        _count: { select: { frame_roles: true; frame_sense_frames: true } };
        frame_roles: true;
        frame_sense_frames: {
          include: {
            frame_senses: {
              include: {
                lexical_unit_senses: {
                  include: {
                    lexical_units: {
                      select: { id: true; code: true; lemmas: true; src_lemmas: true; pos: true; gloss: true };
                    };
                  };
                };
              };
            };
          };
        };
      };
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
            _count: { select: { frame_roles: true, frame_sense_frames: true } },
            frame_roles: true,
            frame_sense_frames: {
              include: {
                frame_senses: {
                  include: {
                    lexical_unit_senses: {
                      where: { lexical_units: { deleted: false } },
                      include: {
                        lexical_units: {
                          select: { id: true, code: true, lemmas: true, src_lemmas: true, pos: true, gloss: true },
                        },
                      },
                    },
                  },
                },
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
          _count: { select: { frame_roles: true, frame_sense_frames: true } },
          frame_roles: true,
          frame_sense_frames: {
            include: {
              frame_senses: {
                include: {
                  lexical_unit_senses: {
                    where: { lexical_units: { deleted: false } },
                    include: {
                      lexical_units: {
                        select: { id: true, code: true, lemmas: true, src_lemmas: true, pos: true, gloss: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
    }

    const serializedFrames = frames.map(frame => {
      // Collect distinct LUs across all senses linked to this frame.
      const luMap = new Map<string, { code: string; lemmas: string[]; src_lemmas: string[]; pos: string; gloss: string }>();
      for (const sfLink of frame.frame_sense_frames) {
        for (const lus of sfLink.frame_senses.lexical_unit_senses) {
          const lu = lus.lexical_units;
          const key = lu.id.toString();
          if (!luMap.has(key)) {
            luMap.set(key, {
              code: lu.code,
              lemmas: lu.lemmas,
              src_lemmas: lu.src_lemmas,
              pos: lu.pos,
              gloss: lu.gloss,
            });
          }
        }
      }
      const lexicalUnitsCount = luMap.size;
      const lexicalUnitSnippets = Array.from(luMap.values()).slice(0, 10);
      const sensesCount = frame._count.frame_sense_frames;

      return {
        id: frame.id.toString(),
        label: frame.label,
        code: frame.code,
        definition: frame.definition,
        short_definition: frame.short_definition,
        flagged: frame.flagged ?? false,
        flaggedReason: frame.flagged_reason ?? undefined,
        verifiable: frame.verifiable ?? true,
        unverifiableReason: frame.unverifiable_reason ?? undefined,
        createdAt: frame.created_at.toISOString(),
        updatedAt: frame.updated_at.toISOString(),
        frame_type: frame.frame_type,
        subtype: frame.subtype,
        disable_healthcheck: frame.disable_healthcheck,
        vendler: frame.vendler,
        multi_perspective: frame.multi_perspective,
        wikidata_id: frame.wikidata_id,
        recipe: frame.recipe,
        roles_count: frame._count.frame_roles,
        senses_count: sensesCount,
        lexical_units_count: lexicalUnitsCount,
        frame_roles: frame.frame_roles.map(fr => ({
          id: fr.id.toString(),
          description: fr.description,
          notes: fr.notes,
          main: fr.main,
          examples: fr.examples,
          label: fr.label,
          fillers: fr.fillers,
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
