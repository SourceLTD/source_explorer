import { prisma } from '@/lib/prisma';
import type { UnifiedSearchResult } from '@/lib/types';

type ConceptCandidate = {
  id: bigint;
  label: string;
  definition: string | null;
  short_definition: string | null;
  archetype: string | null;
};

type ScoredConcept = {
  concept: ConceptCandidate;
  score: number;
  matchPosition: number;
};

const SELECT_FIELDS = {
  id: true,
  label: true,
  definition: true,
  short_definition: true,
  archetype: true,
} as const;

/**
 * Compute a simple character-level overlap ratio between two strings.
 * Used as a fuzzy fallback when no substring match exists.
 */
function fuzzyScore(a: string, b: string): number {
  if (!a || !b) return 0;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  let matches = 0;
  let searchFrom = 0;
  for (const ch of shorter) {
    const idx = longer.indexOf(ch, searchFrom);
    if (idx !== -1) {
      matches++;
      searchFrom = idx + 1;
    }
  }
  return matches / longer.length;
}

/**
 * Score a concept's relevance against the normalized lowercase query tokens.
 *
 * Score tiers (higher = ranked first):
 *   1000 – exact label match
 *    800 – all query tokens matched exactly as label tokens
 *    500 – label starts with full query
 *    400 – label tokens start with all query tokens (prefix)
 *    300 – label contains full query as a substring
 *    200 – label contains all query tokens (any order)
 *    150 – label contains full query on a word boundary
 *     50 – label contains full query as arbitrary substring
 *     30 – fuzzy token overlap on label (score proportional, max 29)
 *     10 – full query found in definition / short_definition
 *      5 – query tokens found in definition / short_definition
 *
 * Ties broken by matchPosition → label length → alphabetical.
 */
function scoreConcept(concept: ConceptCandidate, q: string, qTokens: string[]): ScoredConcept | null {
  const label = concept.label ?? '';
  const labelLower = label.toLowerCase();
  const definition = (concept.definition ?? '').toLowerCase();
  const shortDefinition = (concept.short_definition ?? '').toLowerCase();

  // Tokenise label on non-alphanumeric boundaries.
  const labelTokens = labelLower.split(/[^a-z0-9]+/i).filter(Boolean);

  let score = 0;
  let matchPosition = Number.MAX_SAFE_INTEGER;

  // ── Tier 1: exact label match ──────────────────────────────────────────────
  if (labelLower === q) {
    score = 1000;
    matchPosition = 0;

  // ── Tier 2: all query tokens match label tokens exactly (full-word match) ──
  } else if (
    qTokens.length > 0 &&
    qTokens.every(qt => labelTokens.includes(qt))
  ) {
    score = 800;
    // matchPosition = index of first matched token in the label
    for (let i = 0; i < labelTokens.length; i++) {
      if (qTokens.includes(labelTokens[i])) {
        matchPosition = i;
        break;
      }
    }

  // ── Tier 3: label starts with full query ───────────────────────────────────
  } else if (labelLower.startsWith(q)) {
    score = 500;
    matchPosition = 0;

  // ── Tier 4: each query token is a prefix of some label token ───────────────
  } else if (
    qTokens.length > 0 &&
    qTokens.every(qt => labelTokens.some(lt => lt.startsWith(qt)))
  ) {
    score = 400;
    for (let i = 0; i < labelTokens.length; i++) {
      if (qTokens.some(qt => labelTokens[i].startsWith(qt))) {
        matchPosition = i;
        break;
      }
    }

  // ── Tier 5 / 6: label contains the full query string ──────────────────────
  } else if (labelLower.includes(q)) {
    const idx = labelLower.indexOf(q);
    const prevChar = idx > 0 ? labelLower[idx - 1] : '';
    const onWordBoundary = idx === 0 || /[^a-z0-9]/i.test(prevChar);
    score = onWordBoundary ? 150 : 50;
    matchPosition = idx;

  // ── Tier 7: label contains all individual query tokens (any order) ─────────
  } else if (
    qTokens.length > 1 &&
    qTokens.every(qt => labelLower.includes(qt))
  ) {
    score = 200;
    matchPosition = Math.min(...qTokens.map(qt => labelLower.indexOf(qt)));

  // ── Tier 8: fuzzy character overlap on label ───────────────────────────────
  } else if (labelTokens.length > 0) {
    // Try each query token against each label token; take the best pairing.
    let bestFuzzy = 0;
    for (const qt of qTokens) {
      for (const lt of labelTokens) {
        const f = fuzzyScore(qt, lt);
        if (f > bestFuzzy) bestFuzzy = f;
      }
    }
    if (bestFuzzy >= 0.5) {
      // Map [0.5, 1.0] → [1, 29] so it stays below definition matches.
      score = Math.round((bestFuzzy - 0.5) * 2 * 28) + 1;
      matchPosition = 0;
    }
  }

  // ── Tier 9 / 10: definition fallback ──────────────────────────────────────
  if (score === 0) {
    if (definition.includes(q) || shortDefinition.includes(q)) {
      score = 10;
      matchPosition = Math.min(
        definition.includes(q) ? definition.indexOf(q) : Number.MAX_SAFE_INTEGER,
        shortDefinition.includes(q) ? shortDefinition.indexOf(q) : Number.MAX_SAFE_INTEGER,
      );
    } else if (
      qTokens.length > 0 &&
      qTokens.every(qt => definition.includes(qt) || shortDefinition.includes(qt))
    ) {
      score = 5;
      matchPosition = Math.min(
        ...qTokens.map(qt =>
          Math.min(
            definition.includes(qt) ? definition.indexOf(qt) : Number.MAX_SAFE_INTEGER,
            shortDefinition.includes(qt) ? shortDefinition.indexOf(qt) : Number.MAX_SAFE_INTEGER,
          )
        ),
      );
    } else {
      return null;
    }
  }

  return { concept, score, matchPosition };
}

/**
 * Search concepts by label/definition with multi-tier relevance scoring.
 * Returns ranked candidates as raw scored objects so callers can map them into
 * whatever result shape they need.
 */
async function rankConcepts(query: string, limit: number): Promise<ScoredConcept[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const qTokens = q.split(/[^a-z0-9]+/i).filter(Boolean);

  // Fetch a larger candidate pool so ranking has meaningful choices.
  const candidatePoolSize = Math.min(Math.max(limit * 4, 100), 300);

  // Run two queries in parallel:
  //   1. A broad pool based on substring/definition matches.
  //   2. A guaranteed exact-label-match query so a concept named exactly what
  //      the user typed is always present in the candidate set.
  const [poolConcepts, exactConcepts] = await Promise.all([
    prisma.concepts.findMany({
      where: {
        deleted: false,
        OR: [
          { label: { contains: q, mode: 'insensitive' } },
          { definition: { contains: q, mode: 'insensitive' } },
          { short_definition: { contains: q, mode: 'insensitive' } },
          ...qTokens.length > 1
            ? qTokens.map(token => ({ label: { contains: token, mode: 'insensitive' as const } }))
            : [],
        ],
      },
      select: SELECT_FIELDS,
      take: candidatePoolSize,
    }),
    prisma.concepts.findMany({
      where: {
        deleted: false,
        label: { equals: q, mode: 'insensitive' },
      },
      select: SELECT_FIELDS,
    }),
  ]);

  // Merge, deduplicating by id (exact matches take precedence).
  const seenIds = new Set<bigint>();
  const merged: ConceptCandidate[] = [];
  for (const concept of [...exactConcepts, ...poolConcepts]) {
    if (!seenIds.has(concept.id)) {
      seenIds.add(concept.id);
      merged.push(concept);
    }
  }

  const scored = merged
    .map(concept => scoreConcept(concept, q, qTokens))
    .filter((item): item is ScoredConcept => item !== null);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.matchPosition !== b.matchPosition) return a.matchPosition - b.matchPosition;
    if (a.concept.label.length !== b.concept.label.length) {
      return a.concept.label.length - b.concept.label.length;
    }
    return a.concept.label.localeCompare(b.concept.label);
  });

  return scored.slice(0, limit);
}

/**
 * Legacy result shape used by /api/concepts/search and the existing SearchBox.
 */
export interface ConceptSearchResult {
  id: string;
  label: string;
  gloss: string;
  pos: 'f';
  lemmas: string[];
  src_lemmas: string[];
  legacy_id: string;
  conceptDefinition: string;
  archetype: string | null;
}

/** Concept search in the legacy SearchBox shape. */
export async function searchConceptsLegacy(query: string, limit: number): Promise<ConceptSearchResult[]> {
  const scored = await rankConcepts(query, limit);
  return scored.map(({ concept }) => ({
    id: concept.id.toString(),
    label: concept.label,
    gloss: concept.short_definition || concept.definition || '',
    pos: 'f' as const,
    lemmas: [],
    src_lemmas: [],
    legacy_id: '',
    conceptDefinition: concept.definition || concept.short_definition || '',
    archetype: concept.archetype,
  }));
}

/** Concept search in the unified cross-entity shape. */
export async function searchConcepts(query: string, limit: number): Promise<UnifiedSearchResult[]> {
  const scored = await rankConcepts(query, limit);
  return scored.map(({ concept }) => ({
    type: 'concept' as const,
    id: concept.id.toString(),
    label: concept.label,
    sublabel: concept.short_definition || concept.definition || undefined,
    badge: concept.archetype ?? undefined,
    href: `/graph/concepts?entry=${concept.id.toString()}`,
  }));
}
