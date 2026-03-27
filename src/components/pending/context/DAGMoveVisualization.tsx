'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import NodeCard from './NodeCard';
import LoadingSpinner from '@/components/LoadingSpinner';

// ============================================
// Types
// ============================================

interface FrameSummary {
  id: string;
  label: string;
  short_definition?: string | null;
}

interface DAGContext {
  id: string;
  label: string;
  short_definition?: string | null;
  parents: FrameSummary[];
  children: FrameSummary[];
}

export interface DAGMoveVisualizationProps {
  /** The frame being moved (source_id in both changesets) */
  frameId: string;
  frameLabel?: string;
  /** Old parent frame ID (from the DELETE changeset) - null if frame had no parent */
  oldParentId: string | null;
  oldParentLabel?: string | null;
  /** New parent frame ID (from the CREATE changeset) */
  newParentId: string;
  newParentLabel?: string | null;
}

// ============================================
// Data fetching hook
// ============================================

function useDAGMoveContext(props: DAGMoveVisualizationProps) {
  const [movingFrame, setMovingFrame] = useState<DAGContext | null>(null);
  const [oldParent, setOldParent] = useState<DAGContext | null>(null);
  const [newParent, setNewParent] = useState<DAGContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();

    const fetchContext = async (frameId: string): Promise<DAGContext | null> => {
      const res = await fetch(`/api/frames/${frameId}/dag-context`, { signal: ac.signal });
      if (!res.ok) return null;
      return res.json();
    };

    const loadAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const promises: Promise<DAGContext | null>[] = [fetchContext(props.frameId)];
        if (props.oldParentId) promises.push(fetchContext(props.oldParentId));
        else promises.push(Promise.resolve(null));
        promises.push(fetchContext(props.newParentId));

        const [moving, oldP, newP] = await Promise.all(promises);
        setMovingFrame(moving);
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
  }, [props.frameId, props.oldParentId, props.newParentId]);

  return { movingFrame, oldParent, newParent, loading, error };
}

// ============================================
// Mini DAG Tree Component
// ============================================

interface MiniDAGTreeProps {
  parent: FrameSummary | null;
  parentLabel?: string | null;
  siblings: FrameSummary[];
  movingFrame: FrameSummary;
  movingFrameChildren: FrameSummary[];
  side: 'before' | 'after';
}

function MiniDAGTree({
  parent,
  parentLabel,
  siblings,
  movingFrame,
  movingFrameChildren,
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
  const filteredSiblings = siblings.filter(s => s.id !== movingFrame.id).slice(0, 4);

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

      // Lines from parent to moving frame
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

      // Lines from moving frame to its children
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
  }, [displayedParent, filteredSiblings, movingFrame, movingFrameChildren, isBefore]);

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

        {/* Parent */}
        {displayedParent ? (
          <div ref={parentRef} className="w-full max-w-[200px]">
            <NodeCard
              title={displayedParent.label}
              subtitle={displayedParent.id ? `#${displayedParent.id}` : undefined}
              type={isBefore ? 'origin' : 'destination'}
              className="!p-2.5"
            >
              {displayedParent.short_definition && (
                <div className="line-clamp-2">{displayedParent.short_definition}</div>
              )}
            </NodeCard>
          </div>
        ) : (
          <div ref={parentRef} className="w-full max-w-[200px]">
            <div className="px-3 py-2 rounded-lg border border-dashed border-gray-300 text-center text-xs text-gray-400 italic">
              No parent (root)
            </div>
          </div>
        )}

        {/* Siblings + Moving frame row */}
        <div className="flex flex-wrap justify-center gap-2 w-full">
          {filteredSiblings.map(sib => (
            <div
              key={sib.id}
              ref={el => {
                if (el) siblingRefs.current.set(sib.id, el);
                else siblingRefs.current.delete(sib.id);
              }}
              className="max-w-[130px]"
            >
              <NodeCard
                title={sib.label}
                subtitle={`#${sib.id}`}
                type="sibling"
                className="!p-2 !text-[11px] opacity-60"
                noDivider
              />
            </div>
          ))}

          {/* The moving frame */}
          <div
            ref={movingRef}
            className="max-w-[170px]"
          >
            <NodeCard
              title={movingFrame.label}
              subtitle={`#${movingFrame.id}`}
              type="focus"
              className={`!p-2.5 ring-2 ${
                isBefore
                  ? 'ring-red-300 border-red-300 bg-red-50/50'
                  : 'ring-emerald-400 border-emerald-400 bg-emerald-50/50'
              }`}
            >
              <div className={`text-[10px] font-semibold ${
                isBefore ? 'text-red-500' : 'text-emerald-600'
              }`}>
                {isBefore ? 'Departing' : 'Arriving'}
              </div>
            </NodeCard>
          </div>
        </div>

        {/* Children of the moving frame */}
        {movingFrameChildren.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 w-full">
            {movingFrameChildren.slice(0, 4).map(child => (
              <div
                key={child.id}
                ref={el => {
                  if (el) childRefs.current.set(child.id, el);
                  else childRefs.current.delete(child.id);
                }}
                className="max-w-[120px]"
              >
                <NodeCard
                  title={child.label}
                  subtitle={`#${child.id}`}
                  type="sibling"
                  className="!p-2 !text-[11px] opacity-50"
                  noDivider
                />
              </div>
            ))}
            {movingFrameChildren.length > 4 && (
              <div className="self-center text-[10px] text-gray-400">
                +{movingFrameChildren.length - 4} more
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
  const { movingFrame, oldParent, newParent, loading, error } = useDAGMoveContext(props);

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

  const movingFrameSummary: FrameSummary = movingFrame
    ? { id: movingFrame.id, label: movingFrame.label, short_definition: movingFrame.short_definition }
    : { id: props.frameId, label: props.frameLabel || `Frame #${props.frameId}` };

  const movingFrameChildren = movingFrame?.children ?? [];

  // Old parent's children minus the moving frame = old siblings
  const oldSiblings = oldParent?.children ?? [];

  // New parent's children = new siblings (the moving frame isn't there yet)
  const newSiblings = newParent?.children ?? [];

  const oldParentSummary: FrameSummary | null = oldParent
    ? { id: oldParent.id, label: oldParent.label, short_definition: oldParent.short_definition }
    : null;

  const newParentSummary: FrameSummary | null = newParent
    ? { id: newParent.id, label: newParent.label, short_definition: newParent.short_definition }
    : null;

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-gray-700">
        DAG Inheritance Move
      </div>
      <div className="text-xs text-gray-500">
        Moving <span className="font-medium text-gray-700">{movingFrameSummary.label}</span>
        {oldParentSummary && (
          <>
            {' '}from <span className="font-medium text-red-600">{oldParentSummary.label}</span>
          </>
        )}
        {' '}to <span className="font-medium text-emerald-600">{newParentSummary?.label ?? 'unknown'}</span>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4">
        {/* Before */}
        <div className="p-3 rounded-xl border border-gray-200 bg-gray-50/50">
          <MiniDAGTree
            parent={oldParentSummary}
            parentLabel={props.oldParentLabel}
            siblings={oldSiblings}
            movingFrame={movingFrameSummary}
            movingFrameChildren={movingFrameChildren}
            side="before"
          />
        </div>

        {/* After */}
        <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/30">
          <MiniDAGTree
            parent={newParentSummary}
            parentLabel={props.newParentLabel}
            siblings={newSiblings}
            movingFrame={movingFrameSummary}
            movingFrameChildren={movingFrameChildren}
            side="after"
          />
        </div>
      </div>

      {/* Summary of cascading effects */}
      {movingFrameChildren.length > 0 && (
        <div className="text-xs text-gray-500 mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
          <span className="font-medium text-amber-700">Note:</span>{' '}
          {movingFrameChildren.length} child frame{movingFrameChildren.length !== 1 ? 's' : ''} will
          move with this frame ({movingFrameChildren.slice(0, 3).map(c => c.label).join(', ')}
          {movingFrameChildren.length > 3 ? `, +${movingFrameChildren.length - 3} more` : ''}).
        </div>
      )}
    </div>
  );
}
