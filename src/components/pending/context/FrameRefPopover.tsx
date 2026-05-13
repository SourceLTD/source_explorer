'use client';

import React, { useEffect, useRef, useState } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';
import { posShortLabel } from '@/lib/types';
import {
  fetchFrameSummary,
  getCachedFrameSummary,
  type FrameSummary,
} from './frameSummaryCache';

// Re-export so existing imports of `FrameSummary` from this module keep
// working. The cache + fetcher live in `frameSummaryCache.ts` so the
// new always-visible `FrameInfoCard` can share state with this popover.
export type { FrameSummary };

const OPEN_DELAY_MS = 220;
const CLOSE_DELAY_MS = 160;
const POPUP_WIDTH = 320;
const VIEWPORT_MARGIN = 8;
const TRIGGER_GAP = 6;
// Pick "below" unless the trigger is so close to the viewport bottom
// that the popup would be cramped. Anything taller than this fits
// comfortably on either side via `maxHeight` + internal scroll.
const MIN_COMFORTABLE_HEIGHT = 200;

interface FrameRefPopoverProps {
  frameId: string | null | undefined;
  /** Shown briefly on first hover before the summary lands. */
  fallbackLabel?: string;
  /**
   * Tag for the wrapper element. Defaults to 'span' (inline-flex)
   * so chips inside flex rows don't break layout. Pass 'div' when
   * wrapping block-level content like a NodeCard.
   */
  as?: 'span' | 'div';
  className?: string;
  /** Skip popover behaviour entirely (renders children plain). */
  disabled?: boolean;
  children: React.ReactNode;
}

/**
 * Wraps any UI that mentions a frame and reveals a small identity
 * card on hover/focus. Pure presentation: callers don't need to
 * know about the summary endpoint or its caching.
 *
 * Behaviour:
 *  - Opens after a short delay so a sweeping cursor doesn't trigger.
 *  - Stays open while the cursor is over the popover itself.
 *  - Falls back to no-op for missing or virtual ids (e.g. negative
 *    ids assigned by the LLM virtual-index).
 *  - Closes on Escape and on outside scroll/resize to avoid
 *    floating off the trigger.
 */
export default function FrameRefPopover({
  frameId,
  fallbackLabel,
  as = 'span',
  className,
  disabled,
  children,
}: FrameRefPopoverProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    /**
     * Reference Y coordinate the popup is anchored to. For 'below' it's
     * the popup's top edge; for 'above' it's the popup's bottom edge
     * (the popup is shifted up via `translateY(-100%)`). This keeps the
     * popup glued to the trigger regardless of its measured height.
     */
    top: number;
    left: number;
    placement: 'below' | 'above';
    maxHeight: number;
  } | null>(null);
  const [summary, setSummary] = useState<FrameSummary | null>(() =>
    frameId ? getCachedFrameSummary(frameId) : null,
  );
  const [loading, setLoading] = useState(false);

  const triggerRef = useRef<HTMLElement | null>(null);
  const openTimerRef = useRef<NodeJS.Timeout | null>(null);
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const acRef = useRef<AbortController | null>(null);

  const isVirtualId = !frameId || !/^\d+$/.test(frameId);
  const inactive = Boolean(disabled || isVirtualId);

  useEffect(() => {
    return () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (acRef.current) acRef.current.abort();
    };
  }, []);

  // Cache might warm up while we're mounted — surface it.
  useEffect(() => {
    if (!frameId) return;
    const cached = getCachedFrameSummary(frameId);
    if (cached) setSummary(cached);
  }, [frameId]);

  // Keep the popover anchored on scroll/resize by closing it; the
  // user can re-trigger by hovering. Cheaper than recomputing.
  useEffect(() => {
    if (!open) return;
    const onClose = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const computePlacement = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();

    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;

    // Pure "fits or not" decision based on viewport space (not on a
    // guessed popup height). Prefer below when there's enough room,
    // otherwise pick whichever side has more space. This makes the
    // placement deterministic for a given trigger position.
    const placement: 'below' | 'above' =
      spaceBelow >= MIN_COMFORTABLE_HEIGHT || spaceBelow >= spaceAbove
        ? 'below'
        : 'above';

    // For 'below', `top` is the popup's top edge (popup grows
    // downward). For 'above', `top` is the popup's bottom edge — the
    // popup itself is rendered with `translateY(-100%)` so it grows
    // upward from the trigger. Either way the popup hugs the trigger.
    const top =
      placement === 'below' ? rect.bottom + TRIGGER_GAP : rect.top - TRIGGER_GAP;
    const maxHeight = Math.max(
      120,
      (placement === 'below' ? spaceBelow : spaceAbove) - TRIGGER_GAP,
    );

    let left = rect.left;
    if (left + POPUP_WIDTH > window.innerWidth - VIEWPORT_MARGIN) {
      left = Math.max(
        VIEWPORT_MARGIN,
        window.innerWidth - POPUP_WIDTH - VIEWPORT_MARGIN,
      );
    }
    setPosition({ top, left, placement, maxHeight });
  };

  const load = async () => {
    if (!frameId) return;
    const cached = getCachedFrameSummary(frameId);
    if (cached) {
      setSummary(cached);
      return;
    }
    setLoading(true);
    if (acRef.current) acRef.current.abort();
    acRef.current = new AbortController();
    const data = await fetchFrameSummary(frameId, acRef.current.signal);
    if (data) setSummary(data);
    setLoading(false);
  };

  const openSoon = () => {
    if (inactive) return;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (open) return;
    openTimerRef.current = setTimeout(() => {
      computePlacement();
      setOpen(true);
      void load();
    }, OPEN_DELAY_MS);
  };

  const closeSoon = () => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (!open) return;
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
    }, CLOSE_DELAY_MS);
  };

  if (inactive) {
    // Render children as-is; passing className through preserves
    // any caller styling that would normally land on the wrapper.
    if (className) {
      return (
        <span className={className} style={{ display: 'inline-flex' }}>
          {children}
        </span>
      );
    }
    return <>{children}</>;
  }

  const Tag = as;
  const wrapperStyle: React.CSSProperties =
    as === 'span' ? { display: 'inline-flex' } : {};

  return (
    <>
      <Tag
        ref={triggerRef as React.Ref<HTMLDivElement & HTMLSpanElement>}
        className={className}
        style={wrapperStyle}
        onMouseEnter={openSoon}
        onMouseLeave={closeSoon}
        onFocus={openSoon}
        onBlur={closeSoon}
      >
        {children}
      </Tag>
      {open && position && (
        <div
          role="tooltip"
          className="fixed z-50 w-80 max-w-[90vw] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg p-3 text-left"
          style={{
            top: position.top,
            left: position.left,
            maxHeight: position.maxHeight,
            // For 'above', anchor the popup's bottom edge at `top` so
            // it sits flush against the trigger regardless of how tall
            // the rendered content turns out to be.
            transform:
              position.placement === 'above' ? 'translateY(-100%)' : undefined,
          }}
          onMouseEnter={() => {
            if (closeTimerRef.current) {
              clearTimeout(closeTimerRef.current);
              closeTimerRef.current = null;
            }
          }}
          onMouseLeave={closeSoon}
        >
          {loading && !summary ? (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <LoadingSpinner size="sm" noPadding />
              Loading {fallbackLabel ?? 'frame'}…
            </div>
          ) : summary ? (
            <FrameSummaryBody summary={summary} />
          ) : (
            <div className="text-xs text-gray-500">
              {fallbackLabel ?? 'Frame'}{' '}
              <span className="font-mono">#{frameId}</span> — could not load.
            </div>
          )}
        </div>
      )}
    </>
  );
}

const FRAME_TYPE_BADGE: Record<string, string> = {
  event: 'bg-blue-50 text-blue-700 border-blue-200',
  state: 'bg-amber-50 text-amber-700 border-amber-200',
  entity: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  property: 'bg-purple-50 text-purple-700 border-purple-200',
  relation: 'bg-pink-50 text-pink-700 border-pink-200',
};

function frameTypeBadgeClass(t: string | null): string {
  if (!t) return 'bg-gray-100 text-gray-700 border-gray-200';
  return FRAME_TYPE_BADGE[t] ?? 'bg-gray-100 text-gray-700 border-gray-200';
}

function FrameSummaryBody({ summary }: { summary: FrameSummary }) {
  const def = summary.short_definition ?? summary.definition_excerpt;
  const hiddenSenses = Math.max(summary.senses_total - summary.senses.length, 0);
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className="text-sm font-semibold text-gray-900 truncate"
            title={summary.label}
          >
            {summary.label}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-mono text-gray-400">
              #{summary.id}
            </span>
            {summary.code && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                {summary.code}
              </span>
            )}
          </div>
        </div>
        {summary.frame_type && (
          <span
            className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium uppercase tracking-wide ${frameTypeBadgeClass(summary.frame_type)}`}
            title={
              summary.subtype
                ? `${summary.frame_type} · ${summary.subtype}`
                : summary.frame_type
            }
          >
            {summary.frame_type}
            {summary.subtype && (
              <span className="ml-1 opacity-70 normal-case">
                / {summary.subtype}
              </span>
            )}
          </span>
        )}
      </div>
      {def && (
        <p className="text-xs text-gray-700 leading-snug line-clamp-3">{def}</p>
      )}
      {summary.senses.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Senses ({summary.senses_total})
          </div>
          <ul className="space-y-1.5">
            {summary.senses.map((s) => (
              <li
                key={s.id}
                className="rounded-md border border-gray-200 bg-gray-50/50 px-2 py-1.5"
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-600 uppercase">
                    {posShortLabel(s.pos)}
                  </span>
                  {s.lemmas.length > 0 && (
                    <span className="text-[11px] text-gray-700">
                      {s.lemmas.join(', ')}
                      {s.lemmas_truncated && (
                        <span className="text-gray-400"> …</span>
                      )}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-gray-600 leading-snug line-clamp-2">
                  {s.definition}
                </p>
              </li>
            ))}
          </ul>
          {hiddenSenses > 0 && (
            <div className="text-[10px] text-gray-400">
              +{hiddenSenses} more sense{hiddenSenses === 1 ? '' : 's'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
