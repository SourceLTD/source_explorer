/**
 * Shared cache + fetcher for `/api/frames/[id]/summary`.
 *
 * Pulled out of `FrameRefPopover` so the new always-visible `FrameInfoCard`
 * can hit the same cache: hovering a chip with a popover and rendering
 * a card for the same frame should never trigger two requests, and the
 * second consumer should mount with data already in hand.
 *
 * Also de-duplicates concurrent in-flight requests so multiple panels
 * mounting at once collapse onto a single network call per frame id.
 */

export interface FrameSenseSummary {
  /** Numeric id from the `frame_senses` table. */
  id: number;
  /** Part of speech, e.g. "verb", "noun". */
  pos: string;
  /** Server-truncated to ~240 chars. */
  definition: string;
  /** Up to 4 sample lemmas per sense. */
  lemmas: string[];
  /** True when the sense actually has more lemmas than were returned. */
  lemmas_truncated: boolean;
}

export interface FrameSummary {
  id: string;
  label: string;
  code: string | null;
  frame_type: string | null;
  subtype: string | null;
  short_definition: string | null;
  definition_excerpt: string | null;
  verifiable: boolean | null;
  /**
   * Up to 6 senses for the frame. When the frame has more, see
   * `senses_total` for the real count so the UI can render a
   * "+N more" hint.
   */
  senses: FrameSenseSummary[];
  /** Total senses on this frame (may exceed `senses.length`). */
  senses_total: number;
}

const summaryCache = new Map<string, FrameSummary>();
const inflight = new Map<string, Promise<FrameSummary | null>>();

export function getCachedFrameSummary(id: string | null | undefined): FrameSummary | null {
  if (!id) return null;
  return summaryCache.get(id) ?? null;
}

/**
 * Fetch a frame summary, sharing in-flight requests across callers.
 *
 * The caller's `signal` is intentionally NOT forwarded to the underlying
 * `fetch`: in dev StrictMode (and when several cards mount the same frame
 * simultaneously) the first caller's cleanup would otherwise abort the
 * shared request and every other consumer of the same `inflight` promise
 * would resolve to `null`. Instead, the network request always runs to
 * completion and populates the cache; consumers just check their own
 * `signal` after the await to decide whether to use the result.
 */
export async function fetchFrameSummary(
  id: string,
  signal?: AbortSignal,
): Promise<FrameSummary | null> {
  const cached = summaryCache.get(id);
  if (cached) return cached;

  const existing = inflight.get(id);
  if (existing) {
    const result = await existing;
    if (signal?.aborted) return null;
    return result;
  }

  const p = (async () => {
    try {
      const res = await fetch(`/api/frames/${id}/summary`);
      if (!res.ok) return null;
      const data = (await res.json()) as FrameSummary;
      summaryCache.set(id, data);
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
