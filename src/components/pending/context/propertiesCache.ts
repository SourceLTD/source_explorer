/**
 * Shared cache + fetcher for `/api/concepts/[id]/roles`.
 *
 * Built alongside `conceptSummaryCache.ts` so the new always-visible
 * `PropertyPanel` (and any future property-aware surface) hits the same
 * cache: the inbox should never trigger duplicate property fetches when a
 * reviewer scrolls between buckets.
 *
 * Also de-duplicates concurrent in-flight requests so multiple panels
 * mounting at once collapse onto a single network call per concept id.
 */

export interface ConceptPropertyRow {
  /** Stringified property id. */
  id: string;
  label: string | null;
  description: string | null;
  notes: string | null;
  main: boolean;
  examples: string[];
}

/** @deprecated Use ConceptPropertyRow instead */
export type FrameRoleRow = ConceptPropertyRow;

export interface ConceptPropertiesPayload {
  /** Stringified concept id. */
  id: string;
  label: string;
  code: string | null;
  archetype: string | null;
  /** Precedence-sorted property list. */
  roles: ConceptPropertyRow[];
}

/** @deprecated Use ConceptPropertiesPayload instead */
export type FrameRolesPayload = ConceptPropertiesPayload;

const rolesCache = new Map<string, ConceptPropertiesPayload>();
const inflight = new Map<string, Promise<ConceptPropertiesPayload | null>>();

export function getCachedProperties(
  id: string | null | undefined,
): ConceptPropertiesPayload | null {
  if (!id) return null;
  return rolesCache.get(id) ?? null;
}

/** @deprecated Use getCachedProperties instead */
export const getCachedFrameRoles = getCachedProperties;

/**
 * Fetch a concept's properties, sharing in-flight requests across callers.
 *
 * The caller's `signal` is intentionally NOT forwarded to the
 * underlying `fetch`: in dev StrictMode (and when several panels mount
 * the same concept simultaneously) the first caller's cleanup would
 * otherwise abort the shared request and every other consumer of the
 * same `inflight` promise would resolve to `null`. Mirrors the fix we
 * landed in `conceptSummaryCache.ts`.
 */
export async function fetchProperties(
  id: string,
  signal?: AbortSignal,
): Promise<ConceptPropertiesPayload | null> {
  const cached = rolesCache.get(id);
  if (cached) return cached;

  const existing = inflight.get(id);
  if (existing) {
    const result = await existing;
    if (signal?.aborted) return null;
    return result;
  }

  const p = (async () => {
    try {
      const res = await fetch(`/api/concepts/${id}/roles`);
      if (!res.ok) return null;
      const data = (await res.json()) as ConceptPropertiesPayload;
      rolesCache.set(id, data);
      return data;
    } catch {
      return null;
    } finally {
      inflight.delete(id);
    }
  })();

  inflight.set(id, p);
  const result = await p;
  if (signal?.aborted) return null;
  return result;
}

/** @deprecated Use fetchProperties instead */
export const fetchFrameRoles = fetchProperties;

/** Heuristic: real db ids are positive integer strings. */
export function isRealConceptId(id: string | null | undefined): boolean {
  return !!id && /^\d+$/.test(id);
}

/** @deprecated Use isRealConceptId instead */
export const isRealFrameId = isRealConceptId;
