/**
 * Shared cache + fetcher for `/api/frames/[id]/roles`.
 *
 * Built alongside `frameSummaryCache.ts` so the new always-visible
 * `FrameRolePanel` (and any future role-aware surface) hits the same
 * cache: the inbox should never trigger duplicate role fetches when a
 * reviewer scrolls between buckets.
 *
 * Also de-duplicates concurrent in-flight requests so multiple panels
 * mounting at once collapse onto a single network call per frame id.
 */

export interface FrameRoleRow {
  /** Stringified frame_role id. */
  id: string;
  label: string | null;
  description: string | null;
  notes: string | null;
  main: boolean;
  examples: string[];
}

export interface FrameRolesPayload {
  /** Stringified frame id. */
  id: string;
  label: string;
  code: string | null;
  frame_type: string | null;
  /** Precedence-sorted role list. */
  roles: FrameRoleRow[];
}

const rolesCache = new Map<string, FrameRolesPayload>();
const inflight = new Map<string, Promise<FrameRolesPayload | null>>();

export function getCachedFrameRoles(
  id: string | null | undefined,
): FrameRolesPayload | null {
  if (!id) return null;
  return rolesCache.get(id) ?? null;
}

/**
 * Fetch a frame's roles, sharing in-flight requests across callers.
 *
 * The caller's `signal` is intentionally NOT forwarded to the
 * underlying `fetch`: in dev StrictMode (and when several panels mount
 * the same frame simultaneously) the first caller's cleanup would
 * otherwise abort the shared request and every other consumer of the
 * same `inflight` promise would resolve to `null`. Mirrors the fix we
 * landed in `frameSummaryCache.ts`.
 */
export async function fetchFrameRoles(
  id: string,
  signal?: AbortSignal,
): Promise<FrameRolesPayload | null> {
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
      const res = await fetch(`/api/frames/${id}/roles`);
      if (!res.ok) return null;
      const data = (await res.json()) as FrameRolesPayload;
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

/** Heuristic: real db ids are positive integer strings. */
export function isRealFrameId(id: string | null | undefined): boolean {
  return !!id && /^\d+$/.test(id);
}
