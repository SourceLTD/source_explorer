import { Prisma, part_of_speech } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { translateFilterASTToPrisma } from '@/lib/filters/translate';
import type { BooleanFilterGroup } from '@/lib/filters/types';
import { sortRolesByPrecedence } from '@/lib/types';
import type { PartOfSpeech as POSType } from '@/lib/types';
import type { 
  JobScope, 
  LexicalUnitSummary, 
  JobTargetType, 
  ConceptPropertyData, 
  ConceptLexicalUnitData,
  ConceptRelationData,
} from './types';

function mergeLemmas(lemmas?: string[] | null, srcLemmas?: string[] | null): string[] {
  return Array.from(new Set([...(srcLemmas ?? []), ...(lemmas ?? [])].filter(Boolean)));
}

/**
 * Build structured concept data for template loops.
 */
function buildStructuredConceptData(conceptRecord: {
  id: bigint;
  code?: string | null;
  label: string;
  definition?: string | null;
  short_definition?: string | null;
  classifier_guidance?: string | null;
  properties?: Array<{
    id: bigint;
    description: string | null;
    notes: string | null;
    main: boolean | null;
    examples: string[] | null;
    label: string | null;
  }>;
  sense_concepts?: Array<{
    senses: {
      lexical_unit_senses: Array<{
        lexical_units: {
          id: bigint;
          code: string;
          pos: part_of_speech;
          gloss: string;
          lemmas: string[];
          src_lemmas?: string[] | null;
          examples: string[];
          flagged: boolean | null;
        };
      }>;
    };
  }>;
}): { additional: Record<string, unknown>; concept: ConceptRelationData } {
  const roles: ConceptPropertyData[] = sortRolesByPrecedence(
    (conceptRecord.properties ?? []).map(fr => ({
      main: fr.main ?? false,
      description: fr.description ?? '',
      examples: fr.examples ?? [],
      label: fr.label ?? '',
    }))
  ).map(fr => ({
    type: fr.label,
    description: fr.description,
    examples: fr.examples,
    label: fr.label,
    main: fr.main,
  }));

  // Build structured lexical units array — flatten across senses and dedupe by LU id.
  const luMap = new Map<string, ConceptLexicalUnitData>();
  for (const sfLink of (conceptRecord.sense_concepts ?? [])) {
    for (const lus of (sfLink.senses.lexical_unit_senses ?? [])) {
      const lu = lus.lexical_units;
      const key = lu.id.toString();
      if (luMap.has(key)) continue;
      luMap.set(key, {
        id: key,
        code: lu.code,
        gloss: lu.gloss,
        pos: lu.pos as POSType,
        lemmas: mergeLemmas(lu.lemmas, lu.src_lemmas),
        examples: lu.examples,
        flagged: lu.flagged ?? false,
      });
    }
  }
  const lexical_units: ConceptLexicalUnitData[] = Array.from(luMap.values());

  // Build flat additional data for backward compatibility
  const additional: Record<string, unknown> = {
    'concept.id': conceptRecord.id.toString(),
    'concept.code': conceptRecord.code ?? conceptRecord.label ?? conceptRecord.id.toString(),
    'concept.label': conceptRecord.label,
    'concept.definition': conceptRecord.definition,
    'concept.short_definition': conceptRecord.short_definition,
    'concept.classifier_guidance': conceptRecord.classifier_guidance,
    'concept.properties': roles.map(fr => {
      const examples = fr.examples.length > 0 ? fr.examples.join(', ') : '';
      return `**${fr.type}**: ${fr.description}${examples ? ` (e.g. ${examples})` : ''}${fr.label ? `; ${fr.label}` : ''}`;
    }).join('\n'),
  };

  // Build structured concept object for loop iteration
  const concept: ConceptRelationData = {
    id: conceptRecord.id.toString(),
    code: conceptRecord.code ?? conceptRecord.label ?? conceptRecord.id.toString(),
    label: conceptRecord.label,
    definition: conceptRecord.definition,
    short_definition: conceptRecord.short_definition,
    classifier_guidance: conceptRecord.classifier_guidance,
    roles,
    lexical_units,
  };

  return { additional, concept };
}

/**
 * Fetch lexical units based on job scope configuration.
 */
export async function fetchUnitsForScope(scope: JobScope): Promise<LexicalUnitSummary[]> {
  switch (scope.kind) {
    case 'ids':
      return fetchEntriesByIds(scope.targetType, scope.ids);
    case 'concept_ids':
      return fetchEntriesByConceptIds(scope.conceptIds, scope.targetType, scope.includeLexicalUnits, scope.offset, scope.limit);
    case 'filters':
      return fetchEntriesByFilters(scope.targetType, scope.filters);
    default:
      return [];
  }
}

/**
 * Quickly counts entries in a scope without fetching them all
 */
export async function countEntriesForScope(scope: JobScope): Promise<number> {
  let count = 0;

  if (scope.kind === 'ids') {
    // For IDs, just return the array length
    count = scope.ids.length;
  } else if (scope.kind === 'concept_ids') {
    // For concept IDs, count frames and/or associated lexical units depending on flagTarget
    const MAX_BIND_VARS = 15000;
    const conceptIds: bigint[] = [];
    
    // Process conceptIds in chunks to avoid bind variable limits
    for (let i = 0; i < scope.conceptIds.length; i += MAX_BIND_VARS) {
      const chunk = scope.conceptIds.slice(i, i + MAX_BIND_VARS);
      const resolved = await prisma.concepts.findMany({
        where: {
          deleted: false,
          OR: chunk.map(id =>
            id.match(/^\d+$/)
              ? { id: BigInt(id) }
              : { label: { equals: id, mode: 'insensitive' as Prisma.QueryMode } }
          ),
        },
        select: { id: true },
      });
      conceptIds.push(...resolved.map(f => f.id));
    }

    const flagTarget = scope.flagTarget ?? 'lexical_unit';

    if (flagTarget === 'concept' || flagTarget === 'both') {
      count += conceptIds.length;
    }

    if (flagTarget === 'lexical_unit' || flagTarget === 'both') {
      const targetType = scope.targetType;
      // Count distinct LUs reachable via sense_concepts → senses → lexical_unit_senses.
      for (let i = 0; i < conceptIds.length; i += MAX_BIND_VARS) {
        const chunk = conceptIds.slice(i, i + MAX_BIND_VARS);
        const luWhere: Prisma.lexical_unitsWhereInput = {
          deleted: false,
          lexical_unit_senses: {
            some: {
              senses: {
                sense_concepts: {
                  some: { concept_id: { in: chunk } },
                },
              },
            },
          },
        };
        if (targetType && targetType !== 'concepts' && targetType !== 'lexical_units') {
          luWhere.pos = targetType as part_of_speech;
        }
        const luCount = await prisma.lexical_units.count({ where: luWhere });
        count += luCount;
      }
    }
  } else if (scope.kind === 'filters') {
    // For filters, we need to run a count query
    const targetType = scope.targetType;
    const legacyPos = targetType === 'concepts' ? 'concepts' : 
                     targetType === 'lexical_units' ? 'lexical_units' : 
                     targetType + 's';
    const { where } = await translateFilterASTToPrisma(legacyPos as any, scope.filters.where);
    const limit = scope.filters.limit;

    if (targetType === 'concepts') {
      const framesWhere: Prisma.conceptsWhereInput = {
        AND: [
          where as Prisma.conceptsWhereInput,
          { deleted: false },
        ],
      };
      count = await prisma.concepts.count({ where: framesWhere });
    } else {
      const luWhere: any = {
        AND: [
          where as Record<string, unknown>,
          { deleted: false },
          ...(targetType !== 'lexical_units' ? [{ pos: targetType as part_of_speech }] : []),
        ],
      };
      count = await prisma.lexical_units.count({ where: luWhere });
    }

    // Apply limit if specified and less than actual count
    if (limit && limit > 0 && limit < count) {
      count = limit;
    }
  }

  return count;
}

/**
 * Fetch units by their lexical codes (e.g., say.v.01) or concept IDs.
 */
async function fetchEntriesByIds(targetType: JobTargetType, ids: string[]): Promise<LexicalUnitSummary[]> {
  if (ids.length === 0) return [];

  const uniqueIds = Array.from(new Set(ids));
  let entries: LexicalUnitSummary[] = [];

  if (targetType === 'concepts') {
    const numericIds = uniqueIds.filter(id => /^\d+$/.test(id)).map(id => BigInt(id));
    const labels = uniqueIds.filter(id => !/^\d+$/.test(id));

    const MAX_BIND_VARS = 15000;
    const records: any[] = [];

    // Process numeric IDs in chunks
    for (let i = 0; i < numericIds.length; i += MAX_BIND_VARS) {
      const chunk = numericIds.slice(i, i + MAX_BIND_VARS);
      const chunkRecords = await prisma.concepts.findMany({
        where: {
          id: { in: chunk },
          deleted: false,
        },
        select: {
          id: true,
          code: true,
          label: true,
          definition: true,
          short_definition: true,
          classifier_guidance: true,
          flagged: true,
          flagged_reason: true,
          verifiable: true,
          unverifiable_reason: true,
          properties: {
            select: {
              id: true,
              description: true,
              notes: true,
              main: true,
              examples: true,
              label: true,
            },
          },
          sense_concepts: {
            include: {
              senses: {
                include: {
                  lexical_unit_senses: {
                    where: { lexical_units: { deleted: false } },
                    include: {
                      lexical_units: {
                        select: {
                          id: true,
                          code: true,
                          pos: true,
                          gloss: true,
                          lemmas: true,
                          src_lemmas: true,
                          examples: true,
                          flagged: true,
                        },
                      },
                    },
                  },
                },
              },
            },
            take: 200,
          },
        },
      });
      records.push(...chunkRecords);
    }

    // Process labels in chunks
    for (let i = 0; i < labels.length; i += MAX_BIND_VARS) {
      const chunk = labels.slice(i, i + MAX_BIND_VARS);
      const chunkRecords = await prisma.concepts.findMany({
        where: {
          label: { in: chunk },
          deleted: false,
        },
        select: {
          id: true,
          code: true,
          label: true,
          definition: true,
          short_definition: true,
          classifier_guidance: true,
          flagged: true,
          flagged_reason: true,
          verifiable: true,
          unverifiable_reason: true,
          properties: {
            select: {
              id: true,
              description: true,
              notes: true,
              main: true,
              examples: true,
              label: true,
            },
          },
          sense_concepts: {
            include: {
              senses: {
                include: {
                  lexical_unit_senses: {
                    where: { lexical_units: { deleted: false } },
                    include: {
                      lexical_units: {
                        select: {
                          id: true,
                          code: true,
                          pos: true,
                          gloss: true,
                          lemmas: true,
                          src_lemmas: true,
                          examples: true,
                          flagged: true,
                        },
                      },
                    },
                  },
                },
              },
            },
            take: 200,
          },
        },
      });
      records.push(...chunkRecords);
    }
    
    const byIdOrLabel = new Map<string, typeof records[number]>();
    for (const record of records) {
      byIdOrLabel.set(record.id.toString(), record);
      byIdOrLabel.set(record.label, record);
    }

    entries = uniqueIds
      .map(id => byIdOrLabel.get(id))
      .filter((record): record is (typeof records)[number] => Boolean(record))
      .map(record => {
        const conceptInfo = buildStructuredConceptData(record);
        
        return {
          dbId: record.id,
          code: record.code ?? record.label ?? record.id.toString(),
          pos: 'concepts',
          gloss: record.definition ?? '',
          lemmas: [],
          examples: [],
          label: record.label,
          definition: record.definition,
          short_definition: record.short_definition,
          classifier_guidance: record.classifier_guidance,
          flagged: record.flagged,
          flagged_reason: record.flagged_reason,
          verifiable: record.verifiable,
          unverifiable_reason: record.unverifiable_reason,
          roles: conceptInfo.concept.roles,
          lexical_units: conceptInfo.concept.lexical_units,
        };
      });
  } else {
    // Lexical units (verb, noun, adjective, adverb, or generic lexical_units)
    const MAX_BIND_VARS = 15000;
    const records: any[] = [];
    
    for (let i = 0; i < uniqueIds.length; i += MAX_BIND_VARS) {
      const chunk = uniqueIds.slice(i, i + MAX_BIND_VARS);
      const chunkRecords = await prisma.lexical_units.findMany({
        where: { 
          code: { in: chunk },
          ...(targetType !== 'lexical_units' ? { pos: targetType as part_of_speech } : {}),
          deleted: false,
        },
        select: {
          id: true,
          code: true,
          pos: true,
          gloss: true,
          lemmas: true,
          src_lemmas: true,
          examples: true,
          flagged: true,
          flagged_reason: true,
          lexfile: true,
          lexical_unit_senses: {
            include: {
              senses: {
                include: {
                  sense_concepts: {
                    include: {
                      concepts: {
                        select: {
                          id: true,
                          code: true,
                          label: true,
                          definition: true,
                          short_definition: true,
                          classifier_guidance: true,
                          properties: {
                            select: {
                              id: true,
                              description: true,
                              notes: true,
                              main: true,
                              examples: true,
                              label: true,
                            },
                          },
                          sense_concepts: {
                            include: {
                              senses: {
                                include: {
                                  lexical_unit_senses: {
                                    where: { lexical_units: { deleted: false } },
                                    include: {
                                      lexical_units: {
                                        select: {
                                          id: true,
                                          code: true,
                                          pos: true,
                                          gloss: true,
                                          lemmas: true,
                                          src_lemmas: true,
                                          examples: true,
                                          flagged: true,
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      records.push(...chunkRecords);
    }

    const byCode = new Map(records.map(record => [record.code, record]));
    entries = uniqueIds
      .map(code => byCode.get(code))
      .filter((record): record is (typeof records)[number] => Boolean(record))
      .map(record => {
        // Walk the sense chain to find the primary frame for this LU (first sense's first frame).
        const conceptRecord = record.lexical_unit_senses?.[0]?.senses?.sense_concepts?.[0]?.concepts;
        const conceptInfo = conceptRecord
          ? buildStructuredConceptData(conceptRecord)
          : { additional: {}, concept: null };

        return {
          dbId: record.id,
          code: record.code,
          pos: targetType,
          gloss: record.gloss,
          lemmas: mergeLemmas(record.lemmas, record.src_lemmas),
          examples: record.examples,
          flagged: record.flagged,
          flagged_reason: record.flagged_reason,
          label: conceptRecord?.label ?? null,
          lexfile: record.lexfile,
          additional: conceptInfo.additional,
          concept: conceptInfo.concept,
        };
      });
  }

  return entries;
}

/**
 * Fetch entries by concept IDs, optionally including associated lexical units.
 */
async function fetchEntriesByConceptIds(
  conceptIds: string[], 
  targetType?: JobTargetType, 
  includeLexicalUnits?: boolean,
  offset?: number,
  limit?: number,
): Promise<LexicalUnitSummary[]> {
  if (conceptIds.length === 0) return [];

  const numericIds = conceptIds.filter(id => id.match(/^\d+$/)).map(id => BigInt(id));
  const labels = conceptIds.filter(id => !id.match(/^\d+$/));

  // Chunking to avoid "too many bind variables" error (max 32767)
  const MAX_BIND_VARS = 15000;
  const conceptRecords: any[] = [];
  
  // Process numeric IDs in chunks
  for (let i = 0; i < numericIds.length; i += MAX_BIND_VARS) {
    const chunk = numericIds.slice(i, i + MAX_BIND_VARS);
    const records = await prisma.concepts.findMany({
      where: {
        id: { in: chunk },
        deleted: false,
      },
      select: {
        id: true,
        code: true,
        label: true,
        definition: true,
        short_definition: true,
        classifier_guidance: true,
        flagged: true,
        flagged_reason: true,
        verifiable: true,
        unverifiable_reason: true,
        properties: {
          select: {
            id: true,
            description: true,
            notes: true,
            main: true,
            examples: true,
            label: true,
          },
        },
        sense_concepts: {
          include: {
            senses: {
              include: {
                lexical_unit_senses: {
                  where: { lexical_units: { deleted: false } },
                  include: {
                    lexical_units: {
                      select: {
                        id: true,
                        code: true,
                        pos: true,
                        gloss: true,
                        lemmas: true,
                        src_lemmas: true,
                        examples: true,
                        flagged: true,
                        flagged_reason: true,
                        lexfile: true,
                      },
                    },
                  },
                },
              },
            },
          },
          take: 200,
        },
      },
    });
    conceptRecords.push(...records);
  }

  // Process labels in chunks
  for (let i = 0; i < labels.length; i += MAX_BIND_VARS) {
    const chunk = labels.slice(i, i + MAX_BIND_VARS);
    const records = await prisma.concepts.findMany({
      where: {
        label: { in: chunk },
        deleted: false,
      },
      select: {
        id: true,
        code: true,
        label: true,
        definition: true,
        short_definition: true,
        classifier_guidance: true,
        flagged: true,
        flagged_reason: true,
        verifiable: true,
        unverifiable_reason: true,
        properties: {
          select: {
            id: true,
            description: true,
            notes: true,
            main: true,
            examples: true,
            label: true,
          },
        },
        sense_concepts: {
          include: {
            senses: {
              include: {
                lexical_unit_senses: {
                  where: { lexical_units: { deleted: false } },
                  include: {
                    lexical_units: {
                      select: {
                        id: true,
                        code: true,
                        pos: true,
                        gloss: true,
                        lemmas: true,
                        src_lemmas: true,
                        examples: true,
                        flagged: true,
                        flagged_reason: true,
                        lexfile: true,
                      },
                    },
                  },
                },
              },
            },
          },
          take: 200,
        },
      },
    });
    conceptRecords.push(...records);
  }

  const concepts = conceptRecords;

  const entries: LexicalUnitSummary[] = [];
  
  // If targeting frames directly
  if (!includeLexicalUnits || targetType === 'concepts') {
    for (const concept of concepts) {
      const conceptInfo = buildStructuredConceptData(concept);
      entries.push({
        dbId: concept.id,
        code: concept.code ?? concept.label ?? concept.id.toString(),
        pos: 'concepts',
        gloss: concept.definition ?? '',
        lemmas: [],
        examples: [],
        label: concept.label,
        definition: concept.definition,
        short_definition: concept.short_definition,
        classifier_guidance: concept.classifier_guidance,
        flagged: concept.flagged,
        flagged_reason: concept.flagged_reason,
        verifiable: concept.verifiable,
        unverifiable_reason: concept.unverifiable_reason,
        roles: conceptInfo.concept.roles,
        lexical_units: conceptInfo.concept.lexical_units,
      });
    }
  }
  
  // If including lexical units
  if (includeLexicalUnits && concepts.length > 0) {
    for (const concept of concepts) {
      const conceptInfo = buildStructuredConceptData(concept);

      // Walk the sense chain and dedupe LUs across senses for this concept.
      const seenLuIds = new Set<string>();
      for (const sfLink of (concept.sense_concepts ?? [])) {
        for (const lus of (sfLink.senses?.lexical_unit_senses ?? [])) {
          const lu = lus.lexical_units;
          const key = lu.id.toString();
          if (seenLuIds.has(key)) continue;
          seenLuIds.add(key);
          // Apply targetType filter if specified (and not 'concepts')
          if (targetType && targetType !== 'concepts' && lu.pos !== targetType) {
            continue;
          }

          entries.push({
            dbId: lu.id,
            code: lu.code,
            pos: lu.pos as POSType,
            gloss: lu.gloss,
            lemmas: mergeLemmas(lu.lemmas, lu.src_lemmas),
            examples: lu.examples,
            flagged: lu.flagged,
            flagged_reason: lu.flagged_reason,
            label: concept.label,
            lexfile: lu.lexfile,
            additional: conceptInfo.additional,
            concept: conceptInfo.concept,
          });
        }
      }
    }
  }

  // Apply offset and limit if provided
  if (offset !== undefined || limit !== undefined) {
    const start = offset ?? 0;
    const end = limit !== undefined ? start + limit : entries.length;
    return entries.slice(start, end);
  }

  return entries;
}

/**
 * Fetch units using boolean filter AST.
 */
async function fetchEntriesByFilters(
  targetType: JobTargetType, 
  filters: { limit?: number; offset?: number; where?: BooleanFilterGroup | undefined } | Record<string, unknown>,
): Promise<LexicalUnitSummary[]> {
  const limit = typeof (filters as { limit?: unknown }).limit === 'number' ? Number((filters as { limit?: number }).limit) : undefined;
  const offset = typeof (filters as { offset?: unknown }).offset === 'number' ? Number((filters as { offset?: number }).offset) : undefined;
  const ast = (filters as { where?: BooleanFilterGroup }).where as BooleanFilterGroup | undefined;
  
  // translateFilterASTToPrisma expects 'verbs' style POS, but for lexical_units it's 'verb'
  const legacyPos = targetType === 'concepts' ? 'concepts' : 
                   targetType === 'lexical_units' ? 'lexical_units' : 
                   targetType + 's';
  const { where, computedFilters } = await translateFilterASTToPrisma(legacyPos as any, ast);

  if (targetType === 'concepts') {
    const takeArg = limit === 0 ? undefined : (limit ?? 50);
    const skipArg = offset;
    const records = await prisma.concepts.findMany({
      where: {
        AND: [
          where as Prisma.conceptsWhereInput,
          { deleted: false },
        ],
      },
      take: takeArg,
      skip: skipArg,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        code: true,
        label: true,
        definition: true,
        short_definition: true,
        classifier_guidance: true,
        flagged: true,
        flagged_reason: true,
        verifiable: true,
        unverifiable_reason: true,
        properties: {
          select: {
            id: true,
            description: true,
            notes: true,
            main: true,
            examples: true,
            label: true,
          },
        },
        sense_concepts: {
          include: {
            senses: {
              include: {
                lexical_unit_senses: {
                  where: { lexical_units: { deleted: false } },
                  include: {
                    lexical_units: {
                      select: {
                        id: true,
                        code: true,
                        pos: true,
                        gloss: true,
                        lemmas: true,
                        src_lemmas: true,
                        examples: true,
                        flagged: true,
                      },
                    },
                  },
                },
              },
            },
          },
          take: 200,
        },
      },
    });
    return records.map(record => {
      const conceptInfo = buildStructuredConceptData(record);
      return {
        dbId: record.id,
        code: record.code ?? record.label ?? record.id.toString(),
        pos: 'concepts',
        gloss: record.definition ?? '',
        lemmas: [] as string[],
        examples: [] as string[],
        label: record.label,
        definition: record.definition,
        short_definition: record.short_definition,
        classifier_guidance: record.classifier_guidance,
        flagged: record.flagged,
        flagged_reason: record.flagged_reason,
        verifiable: record.verifiable,
        unverifiable_reason: record.unverifiable_reason,
        roles: conceptInfo.concept.roles,
        lexical_units: conceptInfo.concept.lexical_units,
      };
    }) as LexicalUnitSummary[];
  }

  // Lexical units (verb, noun, adjective, adverb)
  const takeArg = limit === 0 ? undefined : (limit ?? 50);
  const skipArg = offset;
  
  // Add POS filter and deleted filter
  const luWhere = where as Prisma.lexical_unitsWhereInput;
  const finalWhere: Prisma.lexical_unitsWhereInput = {
    AND: [
      luWhere,
      ...(targetType !== 'lexical_units' ? [{ pos: targetType as part_of_speech }] : []),
      { deleted: false },
    ],
  };
  
  const records = await prisma.lexical_units.findMany({
    where: finalWhere,
    take: takeArg,
    skip: skipArg,
    orderBy: { id: 'asc' },
    include: {
      _count: {
        select: {
          lexical_unit_relations_lexical_unit_relations_source_idTolexical_units: { where: { type: 'hypernym' } },
          lexical_unit_relations_lexical_unit_relations_target_idTolexical_units: { where: { type: 'hypernym' } },
        },
      },
      lexical_unit_senses: {
        include: {
          senses: {
            include: {
              sense_concepts: {
                include: {
                  concepts: {
                    select: {
                      id: true,
                      code: true,
                      label: true,
                      definition: true,
                      short_definition: true,
                      classifier_guidance: true,
                      properties: {
                        select: {
                          id: true,
                          description: true,
                          notes: true,
                          main: true,
                          examples: true,
                          label: true,
                        },
                      },
                      sense_concepts: {
                        include: {
                          senses: {
                            include: {
                              lexical_unit_senses: {
                                where: { lexical_units: { deleted: false } },
                                include: {
                                  lexical_units: {
                                    select: {
                                      id: true,
                                      code: true,
                                      pos: true,
                                      gloss: true,
                                      lemmas: true,
                                      src_lemmas: true,
                                      examples: true,
                                      flagged: true,
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  let entries = records.map(record => {
    const conceptRecord = record.lexical_unit_senses?.[0]?.senses?.sense_concepts?.[0]?.concepts;
    const conceptInfo = conceptRecord
      ? buildStructuredConceptData(conceptRecord)
      : { additional: {}, concept: null };

    return {
      dbId: record.id,
      code: record.code,
      pos: targetType,
      gloss: record.gloss,
      lemmas: mergeLemmas(record.lemmas, record.src_lemmas),
      examples: record.examples,
      flagged: record.flagged ?? undefined,
      flagged_reason: record.flagged_reason ?? null,
      label: conceptRecord?.label ?? null,
      lexfile: record.lexfile,
      additional: conceptInfo.additional,
      concept: conceptInfo.concept,
      _parentsCount: record._count?.lexical_unit_relations_lexical_unit_relations_source_idTolexical_units ?? 0,
      _childrenCount: record._count?.lexical_unit_relations_lexical_unit_relations_target_idTolexical_units ?? 0,
    };
  }) as Array<LexicalUnitSummary & { _parentsCount: number; _childrenCount: number }>;

  // Apply computed filters on counts
  for (const cf of computedFilters) {
    const field = cf.field === 'parentsCount' ? '_parentsCount' : '_childrenCount';
    entries = entries.filter(e => compareNumber((e as unknown as Record<string, unknown>)[field] as number, cf.operator, cf.value, cf.value2));
  }

  // Strip temporary fields
  return entries.map(entry => {
    const { _parentsCount, _childrenCount, ...rest } = entry;
    void _parentsCount;
    void _childrenCount;
    return rest;
  });
}

/**
 * Compare a number against an operator and value(s).
 */
function compareNumber(actual: number, op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between', v: number, v2?: number): boolean {
  switch (op) {
    case 'eq':
      return actual === v;
    case 'neq':
      return actual !== v;
    case 'gt':
      return actual > v;
    case 'gte':
      return actual >= v;
    case 'lt':
      return actual < v;
    case 'lte':
      return actual <= v;
    case 'between':
      if (v2 === undefined) return true;
      return actual >= v && actual <= v2;
    default:
      return true;
  }
}
