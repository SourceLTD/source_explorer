'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import NodeCard from './NodeCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import ConceptRefPopover from './ConceptRefPopover';

// ============================================
// Types
// ============================================

interface ConceptSummary {
  id: string;
  label: string;
  short_definition?: string | null;
  /**
   * Server-truncated excerpt of the long `definition`. Used as a
   * graceful fallback when `short_definition` is null so the
   * NodeCards always have at least *some* identity context to show.
   */
  definition_excerpt?: string | null;
}

interface DAGContext {
  id: string;
  label: string;
  short_definition?: string | null;
  definition_excerpt?: string | null;
  parents: ConceptSummary[];
  children: ConceptSummary[];
}

/** Pick the best available short blurb for a concept card. */
function conceptBlurb(concept: { short_definition?: string | null; definition_excerpt?: string | null }): string | null {
  return concept.short_definition || concept.definition_excerpt || null;
}

export interface DAGMoveVisualizationProps {
  /** The concept being moved (source_id in both changesets) */
  conceptId: string;
  conceptLabel?: string;
  /** Old parent concept ID (from the DELETE changeset) - null if concept had no parent */
  oldParentId: string | null;
  oldParentLabel?: string | null;
  /** New parent concept ID (from the CREATE changeset) */
  newParentId: string;
  newParentLabel?: string | null;
}

// ============================================
// Data fetching hook
// ============================================

function useDAGMoveContext(props: DAGMoveVisualizationProps) {
  const [movingConcept, setMovingConcept] = useState<DAGContext | null>(null);
  const [oldParent, setOldParent] = useState<DAGContext | null>(null);
  const [newParent, setNewParent] = useState<DAGContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();

    const fetchContext = async (conceptId: string): Promise<DAGContext | null> => {
      const res = await fetch(`/api/concepts/${conceptId}/dag-context`, { signal: ac.signal });
      if (!res.ok) return null;
      return res.json();
    };

    const loadAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const promises: Promise<DAGContext | null>[] = [fetchContext(props.conceptId)];
        if (props.oldParentId) promises.push(fetchContext(props.oldParentId));
        else promises.push(Promise.resolve(null));
        promises.push(fetchContext(props.newParentId));

        const [moving, oldP, newP] = await Promise.all(promises);
        setMovingConcept(moving);
        setOldParent(oldP);
        setNewParent(newP);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load DAG context');
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    };

    void loadAll();
    return () => ac.abort();
  }, [props.conceptId, props.oldParentId, props.newParentId]);

  return { movingConcept, oldParent, newParent, loading, error };
}

// ============================================
// Mini DAG Tree Component
// ============================================

interface MiniDAGTreeProps {
  parent: ConceptSummary | null;
  parentLabel?: string | null;
  siblings: ConceptSummary[];
  movingConcept: ConceptSummary;
  movingConceptChildren: ConceptSummary[];
  side: 'before' | 'after';
}

function MiniDAGTree({
  parent,
  parentLabel,
  siblings,
  movingConcept,
  movingConceptChildren,
  side,
}: MiniDAGTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const movingRef = useRef<HTMLDivElement>(null);
  const childRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const siblingRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [lines, setLines] = useState<Array<{
    x1: number; y1: number; x2: number; y2: number;
    stroke: string;
    dashed: boolean;
  }>>([]);

  const isBefore = side === 'before';
  const displayedParent = parent ?? (parentLabel ? { id: '', label: parentLabel, short_definition: null } : null);
  const filteredSiblings = siblings.filter(s => s.id !== movingConcept.id).slice(0, 4);

  // Split siblings into two halves around a central spacer so the
  // straight parent → moving line drops cleanly through the middle
  // of the row instead of clipping a centered sibling card. Heavier
  // half on the left when the count is odd. The two halves are
  // rendered as `flex-1` containers so the central spacer sits on
  // the container's exact centerline regardless of how wide each
  // individual sibling card ends up being.
  const leftCount = Math.ceil(filteredSiblings.length / 2);
  const leftSiblings = filteredSiblings.slice(0, leftCount);
  const rightSiblings = filteredSiblings.slice(leftCount);

  const renderSiblingCard = (sib: ConceptSummary) => (
    <div
      key={sib.id}
      ref={el => {
        if (el) siblingRefs.current.set(sib.id, el);
        else siblingRefs.current.delete(sib.id);
      }}
      className="max-w-[140px]"
    >
      <ConceptRefPopover as="div" conceptId={sib.id} fallbackLabel={sib.label}>
        <NodeCard
          title={sib.label}
          subtitle={`#${sib.id}`}
          type="sibling"
          className="!p-1.5 opacity-60"
          titleClassName="text-[10px] leading-tight"
          noDivider
          wrap
        />
      </ConceptRefPopover>
    </div>
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newLines: typeof lines = [];

      const getCenter = (el: HTMLElement | null | undefined) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          x: r.left + r.width / 2 - containerRect.left,
          yTop: r.top - containerRect.top,
          yBottom: r.top + r.height - containerRect.top,
        };
      };

      const parentCenter = getCenter(parentRef.current);
      const movingCenter = getCenter(movingRef.current);

      // Lines from parent to moving concept
      if (parentCenter && movingCenter) {
        newLines.push({
          x1: parentCenter.x, y1: parentCenter.yBottom,
          x2: movingCenter.x, y2: movingCenter.yTop,
          stroke: isBefore ? '#fca5a5' : '#34d399',
          dashed: isBefore,
        });
      }

      // Lines from parent to siblings
      for (const [, el] of siblingRefs.current) {
        const sibCenter = getCenter(el);
        if (parentCenter && sibCenter) {
          newLines.push({
            x1: parentCenter.x, y1: parentCenter.yBottom,
            x2: sibCenter.x, y2: sibCenter.yTop,
            stroke: '#e5e7eb',
            dashed: false,
          });
        }
      }

      // Lines from moving concept to its children
      for (const [, el] of childRefs.current) {
        const childCenter = getCenter(el);
        if (movingCenter && childCenter) {
          newLines.push({
            x1: movingCenter.x, y1: movingCenter.yBottom,
            x2: childCenter.x, y2: childCenter.yTop,
            stroke: isBefore ? '#e5e7eb' : '#d1d5db',
            dashed: false,
          });
        }
      }

      setLines(newLines);
    }, 50);

    return () => clearTimeout(timer);
  }, [displayedParent, filteredSiblings, movingConcept, movingConceptChildren, isBefore]);

  return (
    <div className="relative" ref={containerRef}>
      {/* SVG overlay for connection lines */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 0 }}
      >
        {lines.map((line, i) => (
          <line
            key={i}
            x1={line.x1} y1={line.y1}
            x2={line.x2} y2={line.y2}
            stroke={line.stroke}
            strokeWidth={2}
            strokeDasharray={line.dashed ? '4 3' : undefined}
          />
        ))}
      </svg>

      <div className="relative flex flex-col items-center gap-4" style={{ zIndex: 1 }}>
        {/* Header */}
        <div className={`text-xs font-bold uppercase tracking-wider ${
          isBefore ? 'text-gray-400' : 'text-emerald-600'
        }`}>
          {isBefore ? 'Before' : 'After'}
        </div>

        {/* Parent — hero card: full title + full first-sentence blurb,
            no truncation. Width sized so most labels fit on one line. */}
        {displayedParent ? (
          <div ref={parentRef} className="w-full max-w-[380px]">
            <ConceptRefPopover
              as="div"
              conceptId={displayedParent.id || null}
              fallbackLabel={displayedParent.label}
            >
              <NodeCard
                title={displayedParent.label}
                subtitle={displayedParent.id ? `#${displayedParent.id}` : undefined}
                type={isBefore ? 'origin' : 'destination'}
                className="!p-2.5"
                wrap
              >
                {conceptBlurb(displayedParent) && (
                  <div>{conceptBlurb(displayedParent)}</div>
                )}
              </NodeCard>
            </ConceptRefPopover>
          </div>
        ) : (
          <div ref={parentRef} className="w-full max-w-[380px]">
            <div className="px-3 py-2 rounded-lg border border-dashed border-gray-300 text-center text-xs text-gray-400 italic">
              No parent (root)
            </div>
          </div>
        )}

        {/* Siblings row. Siblings are split into two halves with a fixed
            central spacer so the parent → moving line drops cleanly through
            the middle of the row instead of clipping a centered sibling
            card. A phantom placeholder pads the right when the count is
            odd, keeping the spacer exactly on the centerline. */}
        {filteredSiblings.length > 0 && (
          <div className="flex w-full items-start">
            <div className="flex-1 flex flex-wrap justify-center items-start gap-2 min-w-0">
              {leftSiblings.map(renderSiblingCard)}
            </div>
            <div className="w-10 shrink-0" aria-hidden />
            <div className="flex-1 flex flex-wrap justify-center items-start gap-2 min-w-0">
              {rightSiblings.map(renderSiblingCard)}
            </div>
          </div>
        )}

        {/* Moving concept row. Always on its own line below the siblings so
            the parent → moving line passes vertically through the spacer
            opened up in the siblings row above. */}
        <div className="flex justify-center w-full">
          <div
            ref={movingRef}
            className="w-full max-w-[400px]"
          >
            <ConceptRefPopover
              as="div"
              conceptId={movingConcept.id}
              fallbackLabel={movingConcept.label}
            >
              <NodeCard
                title={movingConcept.label}
                subtitle={`#${movingConcept.id}`}
                type="focus"
                className={`!p-2.5 ring-2 ${
                  isBefore
                    ? 'ring-red-300 border-red-300 bg-red-50/50'
                    : 'ring-emerald-400 border-emerald-400 bg-emerald-50/50'
                }`}
                wrap
              >
                <div className={`text-[10px] font-semibold ${
                  isBefore ? 'text-red-500' : 'text-emerald-600'
                }`}>
                  {isBefore ? 'Departing' : 'Arriving'}
                </div>
                {conceptBlurb(movingConcept) && (
                  <div className="mt-1 text-gray-600 font-normal">
                    {conceptBlurb(movingConcept)}
                  </div>
                )}
              </NodeCard>
            </ConceptRefPopover>
          </div>
        </div>

        {/* Children of the moving concept */}
        {movingConceptChildren.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 w-full">
            {movingConceptChildren.slice(0, 4).map(child => (
              <div
                key={child.id}
                ref={el => {
                  if (el) childRefs.current.set(child.id, el);
                  else childRefs.current.delete(child.id);
                }}
                className="max-w-[130px]"
              >
                <ConceptRefPopover as="div" conceptId={child.id} fallbackLabel={child.label}>
                  <NodeCard
                    title={child.label}
                    subtitle={`#${child.id}`}
                    type="sibling"
                    className="!p-1.5 opacity-50"
                    titleClassName="text-[10px] leading-tight"
                    noDivider
                    wrap
                  />
                </ConceptRefPopover>
              </div>
            ))}
            {movingConceptChildren.length > 4 && (
              <div className="self-center text-[10px] text-gray-400">
                +{movingConceptChildren.length - 4} more
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function DAGMoveVisualization(props: DAGMoveVisualizationProps) {
  const { movingConcept, oldParent, newParent, loading, error } = useDAGMoveContext(props);

  if (loading) {
    return (
      <div className="py-8 flex justify-center">
        <LoadingSpinner size="sm" noPadding />
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-red-600 py-4">{error}</div>;
  }

  const movingConceptSummary: ConceptSummary = movingConcept
    ? {
        id: movingConcept.id,
        label: movingConcept.label,
        short_definition: movingConcept.short_definition,
        definition_excerpt: movingConcept.definition_excerpt,
      }
    : { id: props.conceptId, label: props.conceptLabel || `Concept #${props.conceptId}` };

  const movingConceptChildren = movingConcept?.children ?? [];

  // Old parent's children minus the moving concept = old siblings
  const oldSiblings = oldParent?.children ?? [];

  // New parent's children = new siblings (the moving concept isn't there yet)
  const newSiblings = newParent?.children ?? [];

  const oldParentSummary: ConceptSummary | null = oldParent
    ? {
        id: oldParent.id,
        label: oldParent.label,
        short_definition: oldParent.short_definition,
        definition_excerpt: oldParent.definition_excerpt,
      }
    : null;

  const newParentSummary: ConceptSummary | null = newParent
    ? {
        id: newParent.id,
        label: newParent.label,
        short_definition: newParent.short_definition,
        definition_excerpt: newParent.definition_excerpt,
      }
    : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {/* Before */}
        <div className="px-2 py-3 rounded-xl border border-gray-200 bg-gray-50/50">
          <MiniDAGTree
            parent={oldParentSummary}
            parentLabel={props.oldParentLabel}
            siblings={oldSiblings}
            movingConcept={movingConceptSummary}
            movingConceptChildren={movingConceptChildren}
            side="before"
          />
        </div>

        {/* After */}
        <div className="px-2 py-3 rounded-xl border border-emerald-200 bg-emerald-50/30">
          <MiniDAGTree
            parent={newParentSummary}
            parentLabel={props.newParentLabel}
            siblings={newSiblings}
            movingConcept={movingConceptSummary}
            movingConceptChildren={movingConceptChildren}
            side="after"
          />
        </div>
      </div>

      {/* Summary of cascading effects */}
      {movingConceptChildren.length > 0 && (
        <div className="text-xs text-gray-500 mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
          <span className="font-medium text-amber-700">Note:</span>{' '}
          {movingConceptChildren.length} child concept{movingConceptChildren.length !== 1 ? 's' : ''} will
          move with this concept ({movingConceptChildren.slice(0, 3).map(c => c.label).join(', ')}
          {movingConceptChildren.length > 3 ? `, +${movingConceptChildren.length - 3} more` : ''}).
        </div>
      )}
    </div>
  );
}
