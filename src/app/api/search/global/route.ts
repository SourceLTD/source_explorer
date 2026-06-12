import { NextRequest, NextResponse } from 'next/server';
import type { SearchEntityType, UnifiedSearchResult, UnifiedSearchGroups } from '@/lib/types';
import { searchConcepts } from '@/lib/search/concepts';
import { searchSenses } from '@/lib/search/senses';
import { searchReferents } from '@/lib/search/referents';
import { searchClaims } from '@/lib/search/claims';

const SEARCHERS: Record<SearchEntityType, (q: string, limit: number) => Promise<UnifiedSearchResult[]>> = {
  concept: searchConcepts,
  sense: searchSenses,
  referent: searchReferents,
  claim: searchClaims,
};

const VALID_TYPES = Object.keys(SEARCHERS) as SearchEntityType[];

/** Per-group cap when searching all four types at once. */
const GROUPED_LIMIT = 6;
/** Cap when scoped to a single type. */
const SCOPED_LIMIT = 20;

/**
 * GET /api/search/global?q=&type=&limit=
 *
 * - With `type` (concept|sense|referent|claim): returns UnifiedSearchResult[]
 *   for just that entity type.
 * - Without `type`: runs all four searchers in parallel and returns the results
 *   grouped by type ({ concept, sense, referent, claim }).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') || '').trim();
    const typeParam = searchParams.get('type') || '';
    const limitParam = parseInt(searchParams.get('limit') || '', 10);

    if (query.length < 2) {
      // Match the empty/blank-query contract: scoped → [], unscoped → empty groups.
      return NextResponse.json(
        typeParam ? [] : emptyGroups()
      );
    }

    if (typeParam) {
      if (!VALID_TYPES.includes(typeParam as SearchEntityType)) {
        return NextResponse.json({ error: `Invalid type: ${typeParam}` }, { status: 400 });
      }
      const type = typeParam as SearchEntityType;
      const limit = Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, 50)
        : SCOPED_LIMIT;
      const results = await SEARCHERS[type](query, limit);
      return NextResponse.json(results);
    }

    const perGroup = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, 20)
      : GROUPED_LIMIT;

    const [concept, sense, referent, claim] = await Promise.all(
      VALID_TYPES.map(type =>
        SEARCHERS[type](query, perGroup).catch(err => {
          console.error(`[API] global search "${type}" failed:`, err);
          return [] as UnifiedSearchResult[];
        })
      )
    );

    const groups: UnifiedSearchGroups = { concept, sense, referent, claim };
    return NextResponse.json(groups);
  } catch (error) {
    console.error('[API] Error in global search:', error);
    return NextResponse.json({ error: 'Failed to search' }, { status: 500 });
  }
}

function emptyGroups(): UnifiedSearchGroups {
  return { concept: [], sense: [], referent: [], claim: [] };
}
