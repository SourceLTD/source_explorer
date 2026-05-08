'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

export interface LazyMountProps {
  children: ReactNode;
  /**
   * Estimated minimum height of the actual content (in px). Used as
   * the placeholder height before the children mount so the
   * scrollbar / scroll position behaves naturally and the user can
   * scroll past unmounted cards without the page collapsing.
   *
   * Pick a value close to the typical rendered height of the card —
   * a small mismatch is fine and just causes a tiny scroll jump on
   * first reveal.
   */
  placeholderHeight?: number;
  /**
   * Distance from the viewport edge at which to start mounting. We
   * default to a generous margin so cards begin loading slightly
   * before they scroll into view, hiding the brief "loading" flash.
   */
  rootMargin?: string;
  /**
   * Optional className for the placeholder wrapper. Once the content
   * mounts, the wrapper is replaced with the children entirely so
   * this only affects the pre-mount appearance.
   */
  placeholderClassName?: string;
  /**
   * Optional inline style merged into the placeholder. `minHeight`
   * from `placeholderHeight` is applied separately and wins.
   */
  placeholderStyle?: CSSProperties;
}

/**
 * Defers rendering its children until the wrapper scrolls into (or
 * near) the viewport, using an IntersectionObserver. Once mounted,
 * the children stay mounted so scrolling away and back doesn't tear
 * down their state or refetch data.
 *
 * Used to keep long lists of heavy review cards cheap to render: the
 * pending-changes inbox stacks many cards that each fetch frame
 * summaries / DAG context on mount, and we only want to pay that
 * cost for cards the reviewer is actually about to see.
 *
 * Falls back to mounting immediately when `IntersectionObserver` is
 * unavailable (e.g. SSR snapshot or very old browsers) so the UI
 * still works, just without the lazy benefit.
 */
export default function LazyMount({
  children,
  placeholderHeight = 240,
  rootMargin = '400px 0px',
  placeholderClassName,
  placeholderStyle,
}: LazyMountProps) {
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const [shouldMount, setShouldMount] = useState(false);

  useEffect(() => {
    if (shouldMount) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShouldMount(true);
      return;
    }
    const node = placeholderRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShouldMount(true);
            observer.disconnect();
            return;
          }
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldMount, rootMargin]);

  if (shouldMount) return <>{children}</>;

  return (
    <div
      ref={placeholderRef}
      aria-hidden="true"
      className={placeholderClassName}
      style={{ minHeight: placeholderHeight, ...placeholderStyle }}
    />
  );
}
