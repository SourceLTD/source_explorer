import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { parseURLToFilterAST } from '@/lib/filters/url';
import { translateFilterASTToPrisma } from '@/lib/filters/translate';
import type { BooleanFilterGroup, BooleanFilterNode, BooleanFilterRule, PostFilterCondition } from '@/lib/filters/types';
import { attachPendingInfoToEntities } from '@/lib/version-control';

type ChildCountMode = 'frame';

const CONCEPT_TABLE_ALIAS = 'f';
const CONCEPT_ID_REF = Prisma.raw('f."id"');

function toSqlDateEndOfDay(value: string): Date {
  return new Date(`${value}T23:59:59.999Z`);
}

function buildTextRuleSql(column: string, rule: BooleanFilterRule): Prisma.Sql | null {
  const raw = String(rule.value ?? '').trim();
  if (!raw) return null;
  const col = Prisma.raw(`${CONCEPT_TABLE_ALIAS}.${column}`);
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
  return Prisma.sql`${Prisma.raw(`${CONCEPT_TABLE_ALIAS}.${column}`)} = ${Boolean(rule.value)}`;
}

function buildDateRuleSql(column: string, rule: BooleanFilterRule): Prisma.Sql | null {
  const raw = String(rule.value ?? '').trim();
  if (!raw) return null;
  const col = Prisma.raw(`${CONCEPT_TABLE_ALIAS}.${column}`);
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

  // Distinct LUs reachable through the concept's senses:
  // concept → sense_concepts → senses → lexical_unit_senses → lexical_units.
  const childCountExpr = Prisma.sql`
    (SELECT COUNT(DISTINCT lus.lexical_unit_id)
     FROM sense_concepts sc
     JOIN lexical_unit_senses lus ON lus.sense_id = sc.sense_id
     JOIN lexical_units lu ON lu.id = lus.lexical_unit_id
     WHERE sc.concept_id = ${CONCEPT_ID_REF} AND COALESCE(lu.deleted, false) = false)
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
    const parent_concept_id = searchParams.get('parent_concept_id');
    
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

    let where: Prisma.conceptsWhereInput = {};
    const filterAST = parseURLToFilterAST('concepts', searchParams);
    const { where: filterWhere, computedFilters } = await translateFilterASTToPrisma('concepts', filterAST || undefined);
    
    const baseConditions: Prisma.conceptsWhereInput[] = [{ deleted: false }];
    
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

    if (parent_concept_id) {
      baseConditions.push({
        concept_relations_concept_relations_child_idToconcepts: {
          some: {
            parent_id: BigInt(parent_concept_id),
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

    if (parent_concept_id) {
      sqlConditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM concept_relations fr
        WHERE fr.child_id = f.id
          AND fr.parent_id = ${BigInt(parent_concept_id)}
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
    let concepts: Array<Prisma.conceptsGetPayload<{
      include: {
        _count: { select: { properties: true; sense_concepts: true } };
        properties: true;
        sense_concepts: {
          include: {
            senses: {
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
        FROM concepts f
        ${whereSql}
      `);
      totalCount = Number(totalRows[0]?.total ?? 0);

      const idRows = await prisma.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
        SELECT f.id
        FROM concepts f
        ${whereSql}
        ${orderBySql}
        LIMIT ${limit} OFFSET ${skip}
      `);
      const pageIds = idRows.map(row => row.id);

      if (pageIds.length > 0) {
        const fetchedConcepts = await prisma.concepts.findMany({
          where: { id: { in: pageIds } },
          include: {
            _count: { select: { properties: true, sense_concepts: true } },
            properties: true,
            sense_concepts: {
              include: {
                senses: {
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
        const conceptsById = new Map(fetchedConcepts.map(concept => [concept.id.toString(), concept]));
        concepts = pageIds
          .map(id => conceptsById.get(id.toString()))
          .filter((concept): concept is (typeof fetchedConcepts)[number] => Boolean(concept));
      }
    } else {
      totalCount = await prisma.concepts.count({ where });
      concepts = await prisma.concepts.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          _count: { select: { properties: true, sense_concepts: true } },
          properties: true,
          sense_concepts: {
            include: {
              senses: {
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

    const serializedConcepts = concepts.map(concept => {
      // Collect distinct LUs across all senses linked to this concept.
      const luMap = new Map<string, { code: string; lemmas: string[]; src_lemmas: string[]; pos: string; gloss: string }>();
      for (const scLink of concept.sense_concepts) {
        for (const lus of scLink.senses.lexical_unit_senses) {
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
      const sensesCount = concept._count.sense_concepts;

      return {
        id: concept.id.toString(),
        label: concept.label,
        code: concept.code,
        definition: concept.definition,
        short_definition: concept.short_definition,
        classifier_guidance: concept.classifier_guidance,
        flagged: concept.flagged ?? false,
        flaggedReason: concept.flagged_reason ?? undefined,
        verifiable: concept.verifiable ?? true,
        unverifiableReason: concept.unverifiable_reason ?? undefined,
        createdAt: concept.created_at.toISOString(),
        updatedAt: concept.updated_at.toISOString(),
        archetype: concept.archetype,
        subtype: concept.subtype,
        state_kind: concept.state_kind,
        disable_healthcheck: concept.disable_healthcheck,
        vendler: concept.vendler,
        multi_perspective: concept.multi_perspective,
        wikidata_id: concept.wikidata_id,
        recipe: concept.recipe,
        roles_count: concept._count.properties,
        senses_count: sensesCount,
        lexical_units_count: lexicalUnitsCount,
        properties: concept.properties.map(fr => ({
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
      serializedConcepts,
      'frame',
      (concept) => BigInt(concept.id)
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
    console.error('[API] Error fetching paginated concepts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch concepts' },
      { status: 500 }
    );
  }
}
