import { Prisma, part_of_speech } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { UnifiedSearchResult } from '@/lib/types';

const PART_OF_SPEECH_VALUES = Object.values(part_of_speech);

const LEGACY_POS_FILTER: Record<string, part_of_speech> = {
  n: part_of_speech.noun,
  v: part_of_speech.verb,
  adj: part_of_speech.adjective,
  adv: part_of_speech.adverb,
};

/** Substring matches on enum labels (`verb`, `nou`, adj→adjective aliases). */
function partOfSpeechValuesMatchingFreeText(search: string): part_of_speech[] {
  const q = search.trim().toLowerCase();
  if (!q) return [];
  const matched = new Set<part_of_speech>();
  if (LEGACY_POS_FILTER[q] !== undefined) matched.add(LEGACY_POS_FILTER[q]);
  for (const v of PART_OF_SPEECH_VALUES) {
    if (v.includes(q)) matched.add(v);
  }
  return [...matched];
}

/**
 * Build the same free-text OR clause used by /api/senses/paginated so the
 * unified search matches senses identically (definition / pos / archetype /
 * lemmas / linked concept label·code / linked lexical unit code·lemmas / id).
 */
export function buildSenseSearchWhere(search: string): Prisma.sensesWhereInput {
  const matchingPosEnums = partOfSpeechValuesMatchingFreeText(search);
  const or: Prisma.sensesWhereInput[] = [
    { definition: { contains: search, mode: 'insensitive' } },
    ...(matchingPosEnums.length > 0 ? [{ pos: { in: matchingPosEnums } }] : []),
    { archetype: { contains: search, mode: 'insensitive' } },
    { lemmas: { has: search } },
    {
      sense_concepts: {
        some: {
          concepts: {
            OR: [
              { label: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      },
    },
    {
      lexical_unit_senses: {
        some: {
          lexical_units: {
            OR: [
              { code: { contains: search, mode: 'insensitive' } },
              { lemmas: { has: search } },
              { src_lemmas: { has: search } },
            ],
          },
        },
      },
    },
  ];

  if (/^\d+$/.test(search)) {
    or.push({ id: Number(search) });
  }

  return { OR: or };
}

/** Sense search in the unified cross-entity shape. */
export async function searchSenses(query: string, limit: number): Promise<UnifiedSearchResult[]> {
  const search = query.trim();
  if (search.length < 2) return [];

  const senses = await prisma.senses.findMany({
    where: buildSenseSearchWhere(search),
    take: limit,
    orderBy: { id: 'asc' },
    select: {
      id: true,
      pos: true,
      definition: true,
      lemmas: true,
      sense_concepts: {
        select: { concepts: { select: { label: true } } },
        take: 1,
      },
    },
  });

  return senses.map(sense => {
    const lemmaLabel = (sense.lemmas ?? []).filter(Boolean).join(', ');
    const conceptLabel = sense.sense_concepts[0]?.concepts?.label;
    const id = sense.id.toString();
    return {
      type: 'sense' as const,
      id,
      label: lemmaLabel || sense.definition || `Sense #${id}`,
      sublabel: sense.definition || conceptLabel || undefined,
      badge: sense.pos ?? undefined,
      href: `/table?search=${encodeURIComponent(id)}&highlightId=${encodeURIComponent(id)}`,
    };
  });
}
