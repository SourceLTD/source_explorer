'use client';

import React, { useMemo, useState, useCallback, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { FrameGraphNode, FrameGraphRelation, FrameRelationType, RecipeGraph } from '@/lib/types';
import type { PendingRelationChange } from '@/lib/version-control';
import FrameMainNode, { FRAME_MAIN_NODE_FIXED_HEIGHT, calculateFrameNodeHeights } from './FrameMainNode';
import LoadingSpinner from '@/components/LoadingSpinner';
import FrameRoleMappingModal from './FrameRoleMappingModal';

// Color scheme
const currentNodeColor = '#3b82f6';
const currentNodeStroke = '#1e40af';
const parentFrameColor = '#93c5fd';
const parentFrameStroke = '#60a5fa';
const childFrameColor = '#93c5fd';
const childFrameStroke = '#60a5fa';
const linkColor = '#e5e7eb';
const backgroundColor = '#ffffff';

const pendingDeleteColor = '#fca5a5';
const pendingDeleteStroke = '#ef4444';
const pendingCreateColor = '#86efac';
const pendingCreateStroke = '#22c55e';

interface FrameOption {
  id: string;
  label: string;
  code?: string;
}

interface FrameGraphProps {
  currentFrame: FrameGraphNode;
  onFrameClick: (frameId: string, clickedNode?: { rect: { top: number; left: number; width: number; height: number }; label: string; color: string; direction: 'up' | 'down' }) => void;
  onEditClick?: () => void;
  onReparentComplete?: () => void;
  onVisualizeRecipeGraph?: (recipeGraph: RecipeGraph) => void;
  pendingRelationChanges?: PendingRelationChange[];
}

interface PositionedFrameNode {
  id: string;
  type: 'current' | 'parent' | 'child' | 'verb';
  label: string;
  sublabel?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  descendant_count?: number;
}

const NODE_HEIGHT = 36;
const NODE_HEIGHT_WITH_COUNT = 48;
const LOG_CEIL = Math.log(1 + 150);

/**
 * Returns a fill/stroke color pair that gets darker blue with more descendants.
 * 0 descendants → lightest (#bfdbfe), 150+ → darkest (#1e40af).
 */
function descendantColorIntensity(count: number | undefined): { fill: string; stroke: string } {
  const s = count ? Math.min(1, Math.log(1 + count) / LOG_CEIL) : 0;
  // Interpolate between light blue and dark blue
  const fills = ['#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af'];
  const strokes = ['#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a'];
  const idx = Math.min(fills.length - 1, Math.floor(s * (fills.length - 1)));
  return { fill: fills[idx], stroke: strokes[idx] };
}

// Relation type display labels - only parent_of is supported
const RELATION_LABELS: Record<FrameRelationType, string> = {
  'parent_of': 'Parent Of',
};

function dedupeRelationsByRelatedFrame(relations: FrameGraphRelation[], getRelatedId: (relation: FrameGraphRelation) => string | undefined) {
  const seen = new Set<string>();
  return relations.filter((relation) => {
    const relatedId = getRelatedId(relation);
    if (!relatedId || seen.has(relatedId)) return false;
    seen.add(relatedId);
    return true;
  });
}

function getPositionedNodeKey(node: PositionedFrameNode) {
  return `${node.type}-${node.id}`;
}

export interface FrameGraphHandle {
  openReparentModal: () => void;
  isParentRelationLocked: () => boolean;
}

function FrameGraphInner({ currentFrame, onFrameClick, onEditClick, onReparentComplete, onVisualizeRecipeGraph, pendingRelationChanges }: FrameGraphProps, ref: React.Ref<FrameGraphHandle>) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [rolesExpanded, setRolesExpanded] = useState<boolean>(true);
  const [lexicalUnitsExpanded, setLexicalUnitsExpanded] = useState<boolean>(true);
  const [expandedSenses, setExpandedSenses] = useState<Set<string>>(new Set());
  const [recipeGraphExpanded, setRecipeGraphExpanded] = useState<boolean>(false);
  const [reparentModalOpen, setReparentModalOpen] = useState(false);
  const [reparentQuery, setReparentQuery] = useState('');
  const [reparentFrames, setReparentFrames] = useState<FrameOption[]>([]);
  const [reparentLoading, setReparentLoading] = useState(false);
  const [reparentSubmitting, setReparentSubmitting] = useState(false);
  const [reparentError, setReparentError] = useState<string | null>(null);
  const reparentInputRef = useRef<HTMLInputElement>(null);
  const [roleMappingModalOpen, setRoleMappingModalOpen] = useState(false);

  useEffect(() => {
    if (reparentModalOpen && reparentInputRef.current) {
      reparentInputRef.current.focus();
    }
  }, [reparentModalOpen]);

  useEffect(() => {
    if (!reparentModalOpen) return;
    const timeoutId = setTimeout(async () => {
      setReparentLoading(true);
      try {
        const params = new URLSearchParams();
        if (reparentQuery.trim()) params.set('search', reparentQuery.trim());
        params.set('limit', '30');
        const resp = await fetch(`/api/frames?${params.toString()}`, { cache: 'no-store' });
        if (resp.ok) {
          const data = await resp.json();
          setReparentFrames(Array.isArray(data) ? data : []);
        }
      } catch {
        setReparentFrames([]);
      } finally {
        setReparentLoading(false);
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [reparentModalOpen, reparentQuery]);

  const handleReparent = useCallback(async (newParentId: string) => {
    setReparentSubmitting(true);
    setReparentError(null);
    try {
      const resp = await fetch(`/api/frames/${currentFrame.id}/reparent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newParentId }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setReparentError(data.error || 'Failed to stage reparent');
        return;
      }
      setReparentModalOpen(false);
      setReparentQuery('');
      onReparentComplete?.();
    } catch (err) {
      setReparentError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setReparentSubmitting(false);
    }
  }, [currentFrame.id, onReparentComplete]);

  // Helper function to calculate node width based on text length
  const calculateNodeWidth = useCallback((text: string, minWidth: number = 80): number => {
    const charWidth = 7.5;
    const padding = 24;
    const calculatedWidth = text.length * charWidth + padding;
    return Math.max(minWidth, calculatedWidth);
  }, []);

  // Helper function to arrange nodes in rows
  const arrangeNodesInRows = useCallback((nodes: any[], maxRowWidth: number, nodeSpacing: number) => {
    const rows: { nodes: any[]; totalWidth: number }[] = [];
    let currentRow: any[] = [];
    let currentRowWidth = 0;

    for (const node of nodes) {
      const label = node.direction === 'outgoing' ? node.target?.label : node.source?.label;
      const nodeWidth = calculateNodeWidth(label || '');
      const widthWithSpacing = currentRow.length > 0 ? nodeWidth + nodeSpacing : nodeWidth;
      
      if (currentRow.length > 0 && currentRowWidth + widthWithSpacing > maxRowWidth) {
        rows.push({ nodes: currentRow, totalWidth: currentRowWidth });
        currentRow = [node];
        currentRowWidth = nodeWidth;
      } else {
        currentRow.push(node);
        currentRowWidth += widthWithSpacing;
      }
    }
    
    if (currentRow.length > 0) {
      rows.push({ nodes: currentRow, totalWidth: currentRowWidth });
    }
    
    return rows;
  }, [calculateNodeWidth]);

  // Incoming parent_of = another frame is the source (parent) pointing at this frame
  const parentRels = useMemo(() => dedupeRelationsByRelatedFrame(
    currentFrame.relations.filter(r =>
      r.direction === 'incoming' && r.type === 'parent_of' && r.source && r.source.id !== currentFrame.id
    ),
    r => r.source?.id
  ), [currentFrame.id, currentFrame.relations]);

  const parentRelationLocked = useMemo(
    () => parentRels.some(r => r.locked),
    [parentRels],
  );

  const lockedRelationFrameIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of currentFrame.relations) {
      if (!r.locked) continue;
      if (r.direction === 'incoming' && r.source) ids.add(r.source.id);
      if (r.direction === 'outgoing' && r.target) ids.add(r.target.id);
    }
    return ids;
  }, [currentFrame.relations]);

  useImperativeHandle(ref, () => ({
    openReparentModal: () => {
      if (parentRelationLocked) {
        return;
      }
      setReparentModalOpen(true);
      setReparentError(null);
    },
    isParentRelationLocked: () => parentRelationLocked,
  }), [parentRelationLocked]);

  // Outgoing parent_of = this frame is the source (parent) pointing at children
  const childRels = useMemo(() => {
    const deduped = dedupeRelationsByRelatedFrame(
      currentFrame.relations.filter(r =>
        r.direction === 'outgoing' && r.type === 'parent_of' && r.target && r.target.id !== currentFrame.id
      ),
      r => r.target?.id
    );
    // Sort children by descendant_count descending (most descendants first)
    return deduped.sort((a, b) =>
      (b.target?.descendant_count ?? 0) - (a.target?.descendant_count ?? 0)
    );
  }, [currentFrame.id, currentFrame.relations]);

  // Layout calculation
  const layout = useMemo(() => {
    const width = 1400;
    const centerX = width / 2;
    const maxRowWidth = width - 100;
    const nodeSpacing = 20;
    const rowSpacing = 60;
    const spacingFromCenter = 60;
    const margin = 10;
    const relatedNodeHeight = NODE_HEIGHT_WITH_COUNT;

    const mainNodeWidth = 1000;
    const mainNodeLayoutHeight = FRAME_MAIN_NODE_FIXED_HEIGHT;
    const dynamicHeights = calculateFrameNodeHeights(currentFrame, rolesExpanded, lexicalUnitsExpanded, recipeGraphExpanded, expandedSenses);
    const mainNodeRenderHeight = Math.max(FRAME_MAIN_NODE_FIXED_HEIGHT, dynamicHeights.totalHeight);
    const renderOverflow = mainNodeRenderHeight - mainNodeLayoutHeight;
    
    const nodes: PositionedFrameNode[] = [];

    // Arrange rows
    const parentRows = arrangeNodesInRows(parentRels, maxRowWidth, nodeSpacing);
    const childRows = arrangeNodesInRows(childRels, maxRowWidth, nodeSpacing);

    // Fixed vertical position for main node: enough room for 1 parent row above
    const fixedMainY = margin + relatedNodeHeight + spacingFromCenter + mainNodeLayoutHeight / 2;
    
    // Only shift down if parents need more space than reserved
    let topShift = 0;
    if (parentRows.length > 1) {
      const bottomParentY = fixedMainY - mainNodeLayoutHeight / 2 - spacingFromCenter - relatedNodeHeight / 2;
      const topMostParentY = bottomParentY - (parentRows.length - 1) * (relatedNodeHeight + rowSpacing);
      topShift = Math.max(0, margin - topMostParentY);
    }
    const centerY = fixedMainY + topShift;

    const spaceBelow = childRows.length > 0 ? 
      childRows.length * relatedNodeHeight + (childRows.length - 1) * rowSpacing + spacingFromCenter : 
      spacingFromCenter;

    const totalHeight = centerY + mainNodeLayoutHeight / 2 + renderOverflow + spaceBelow + margin;
    
    // Add current frame at center
    nodes.push({
      id: currentFrame.id,
      type: 'current',
      label: currentFrame.label,
      sublabel: currentFrame.short_definition ?? undefined,
      x: centerX,
      y: centerY,
      width: mainNodeWidth,
      height: mainNodeLayoutHeight,
    });
    
    // Position parents ABOVE (positioned relative to main node, going upward)
    if (parentRows.length > 0) {
      const firstParentRowY = centerY - mainNodeLayoutHeight / 2 - spacingFromCenter - relatedNodeHeight / 2;
      for (let rowIndex = parentRows.length - 1; rowIndex >= 0; rowIndex--) {
        const row = parentRows[rowIndex];
        const rowY = firstParentRowY - (parentRows.length - 1 - rowIndex) * (relatedNodeHeight + rowSpacing);
        let currentX = centerX - row.totalWidth / 2;
        
        row.nodes.forEach((rel) => {
          const source = rel.source!;
          const nodeWidth = calculateNodeWidth(source.label);
          const nodeH = (source.descendant_count ?? 0) > 0 ? NODE_HEIGHT_WITH_COUNT : NODE_HEIGHT;
          nodes.push({
            id: source.id,
            type: 'parent',
            label: source.label,
            x: currentX + nodeWidth / 2,
            y: rowY,
            width: nodeWidth,
            height: nodeH,
            descendant_count: source.descendant_count,
          });
          currentX += nodeWidth + nodeSpacing;
        });
      }
    }

    // Position children BELOW
    if (childRows.length > 0) {
      const childStartY = centerY + mainNodeLayoutHeight / 2 + renderOverflow + spacingFromCenter + relatedNodeHeight / 2;
      childRows.forEach((row, rowIndex) => {
        const rowY = childStartY + (rowIndex * (relatedNodeHeight + rowSpacing));
        let currentX = centerX - row.totalWidth / 2;
        
        row.nodes.forEach((rel) => {
          const target = rel.target!;
          const nodeWidth = calculateNodeWidth(target.label);
          const nodeH = (target.descendant_count ?? 0) > 0 ? NODE_HEIGHT_WITH_COUNT : NODE_HEIGHT;
          nodes.push({
            id: target.id,
            type: 'child',
            label: target.label,
            x: currentX + nodeWidth / 2,
            y: rowY,
            width: nodeWidth,
            height: nodeH,
            descendant_count: target.descendant_count,
          });
          currentX += nodeWidth + nodeSpacing;
        });
      });
    }
    
    return { nodes, width, height: totalHeight, renderOverflow };
  }, [currentFrame, parentRels, childRels, arrangeNodesInRows, calculateNodeWidth, rolesExpanded, lexicalUnitsExpanded, recipeGraphExpanded, expandedSenses]);

  // Identify pending relation changes for visualization
  const pendingDeletes = useMemo(() => {
    if (!pendingRelationChanges) return new Set<string>();
    return new Set(
      pendingRelationChanges
        .filter(c => c.operation === 'delete' && c.type === 'parent_of')
        .map(c => c.source_id === currentFrame.id ? c.target_id : c.source_id)
    );
  }, [pendingRelationChanges, currentFrame.id]);

  const pendingCreates = useMemo(() => {
    if (!pendingRelationChanges) return [];
    return pendingRelationChanges.filter(
      c => c.operation === 'create' && c.type === 'parent_of' && c.source_id === currentFrame.id
    );
  }, [pendingRelationChanges, currentFrame.id]);

  // Render related frame nodes
  const renderRelatedNode = (node: PositionedFrameNode) => {
    const nodeKey = getPositionedNodeKey(node);
    const isHovered = hoveredNodeId === nodeKey;
    const isPendingDelete = pendingDeletes.has(node.id);
    const isLocked = lockedRelationFrameIds.has(node.id);
    const descColors = descendantColorIntensity(node.descendant_count);
    const fillColor = isPendingDelete
      ? pendingDeleteColor
      : descColors.fill;
    const strokeColor = isPendingDelete
      ? pendingDeleteStroke
      : descColors.stroke;
    const hasDescendants = (node.descendant_count ?? 0) > 0;
    const nodeLeft = node.x - node.width / 2;
    const nodeTop = node.y - node.height / 2;
    
    return (
      <g 
        key={nodeKey}
        style={{ cursor: 'pointer' }}
        onMouseEnter={() => setHoveredNodeId(nodeKey)}
        onMouseLeave={() => setHoveredNodeId(null)}
        onClick={(e) => {
          const rect = (e.currentTarget as SVGGElement).getBoundingClientRect();
          onFrameClick(node.id, { rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }, label: node.label, color: fillColor, direction: node.type === 'parent' ? 'up' : 'down' });
        }}
      >
        <rect
          x={nodeLeft}
          y={nodeTop}
          width={node.width}
          height={node.height}
          rx={8}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={isHovered ? 3 : 2}
          style={{ 
            cursor: 'pointer',
            filter: isHovered ? 'brightness(1.1)' : 'none',
            transition: 'all 0.2s ease',
          }}
        />
        {/* Label — vertically centered if no descendants, shifted up if there are */}
        <text
          x={node.x}
          y={hasDescendants ? nodeTop + 16 : node.y}
          fontSize={11}
          fontWeight="bold"
          fill="white"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {node.label}
        </text>
        {/* Descendant count with tree icon in bottom-left */}
        {hasDescendants && (
          <g>
            {/* Same 3-arrow graph icon as the view toggle, scaled down */}
            <g transform={`translate(${nodeLeft + 4}, ${nodeTop + node.height - 9}) scale(0.26)`}>
              <path d="m11.99 16.5-3.75 3.75m0 0L4.49 16.5m3.75 3.75V3.75h11.25" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </g>
            <g transform={`translate(${nodeLeft + 7}, ${nodeTop + node.height - 9}) scale(0.26)`}>
              <path d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </g>
            <g transform={`translate(${nodeLeft + 10}, ${nodeTop + node.height - 9}) scale(0.26)`}>
              <path d="m11.99 16.5 3.75 3.75m0 0 3.75-3.75m-3.75 3.75V3.75H4.49" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </g>
            <text
              x={nodeLeft + 20}
              y={nodeTop + node.height - 6}
              fontSize={10}
              fill="rgba(255,255,255,0.7)"
              textAnchor="start"
              dominantBaseline="central"
            >
              {node.descendant_count}
            </text>
          </g>
        )}
        {/* Lock icon for locked relations */}
        {isLocked && (
          <g transform={`translate(${nodeLeft + node.width - 16}, ${nodeTop + 2})`}>
            <title>Relation locked</title>
            <path
              d="M6 8V6a3 3 0 1 1 6 0v2h1a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h1Zm2-2v2h2V6a1 1 0 1 0-2 0Z"
              fill="rgba(255,255,255,0.85)"
              transform="scale(0.85)"
            />
          </g>
        )}
      </g>
    );
  };

  // Render connection lines from related nodes to the edge of the main node
  const renderConnections = () => {
    const mainNode = layout.nodes.find(n => n.type === 'current');
    if (!mainNode) return null;

    const mainTop = mainNode.y - mainNode.height / 2;
    const mainBottom = mainNode.y + mainNode.height / 2 + (layout.renderOverflow || 0);

    return layout.nodes
      .filter(n => n.type !== 'current')
      .map(node => {
        const isParent = node.type === 'parent';
        const isPendingDelete = pendingDeletes.has(node.id);
        const startX = node.x;
        const startY = isParent ? node.y + node.height / 2 : node.y - node.height / 2;
        const endY = isParent ? mainTop : mainBottom;
        const endX = mainNode.x;

        return (
          <line
            key={`line-${getPositionedNodeKey(node)}`}
            x1={startX}
            y1={startY}
            x2={endX}
            y2={endY}
            stroke={isPendingDelete ? pendingDeleteStroke : linkColor}
            strokeWidth={2}
            strokeOpacity={isPendingDelete ? 0.8 : 0.6}
            strokeDasharray={isPendingDelete ? '6 4' : undefined}
          />
        );
      });
  };

  return (
    <div className="w-full h-full overflow-auto bg-white rounded-xl flex flex-col items-center pt-4 relative">
      <svg 
        width={layout.width} 
        height={layout.height}
        className="block flex-shrink-0"
      >
        <rect width={layout.width} height={layout.height} rx={14} fill={backgroundColor} stroke="none" />
        
        {/* Connections */}
        {renderConnections()}
        
        {/* Pending create connection (dashed green line to new parent) */}
        {pendingCreates.map((pc) => {
          const mainNode = layout.nodes.find(n => n.type === 'current');
          if (!mainNode) return null;
          const mainBottom = mainNode.y + mainNode.height / 2 + (layout.renderOverflow || 0);
          const labelText = pc.target_label || `Frame #${pc.target_id}`;
          const nodeWidth = Math.max(80, labelText.length * 7.5 + 24);
          const pendingNodeX = mainNode.x;
          const pendingNodeY = mainBottom + 30;
          return (
            <g key={`pending-create-${pc.changeset_id}`}>
              <line
                x1={mainNode.x}
                y1={mainBottom}
                x2={pendingNodeX}
                y2={pendingNodeY - 18}
                stroke={pendingCreateStroke}
                strokeWidth={2}
                strokeDasharray="6 4"
                strokeOpacity={0.8}
              />
              <rect
                x={pendingNodeX - nodeWidth / 2}
                y={pendingNodeY - 18}
                width={nodeWidth}
                height={36}
                rx={8}
                fill={pendingCreateColor}
                stroke={pendingCreateStroke}
                strokeWidth={2}
                strokeDasharray="4 2"
              />
              <text
                x={pendingNodeX}
                y={pendingNodeY}
                fontSize={11}
                fontWeight="bold"
                fill="#166534"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {labelText}
              </text>
            </g>
          );
        })}
        
        {/* Related nodes first (behind main node) */}
        {layout.nodes
          .filter(n => n.type !== 'current')
          .map(node => renderRelatedNode(node))}
        
        {/* Main node */}
        {layout.nodes
          .filter(n => n.type === 'current')
          .map(node => (
            <g key={node.id} data-main-node="">
              <FrameMainNode
              node={currentFrame}
              x={node.x}
              y={node.y}
              onNodeClick={onFrameClick}
              onEditClick={onEditClick}
              onVisualizeRecipeGraph={onVisualizeRecipeGraph}
              controlledRolesExpanded={rolesExpanded}
              controlledLexicalUnitsExpanded={lexicalUnitsExpanded}
              controlledRecipeGraphExpanded={recipeGraphExpanded}
              onRolesExpandedChange={setRolesExpanded}
              onLexicalUnitsExpandedChange={setLexicalUnitsExpanded}
              onRecipeGraphExpandedChange={setRecipeGraphExpanded}
              expandedSenses={expandedSenses}
              onToggleSense={(senseId) => {
                const newSet = new Set(expandedSenses);
                if (newSet.has(senseId)) newSet.delete(senseId);
                else newSet.add(senseId);
                setExpandedSenses(newSet);
              }}
              onRoleMappingClick={() => setRoleMappingModalOpen(true)}
              hasParent={parentRels.length > 0}
            />
            </g>
          ))}
      </svg>

      {/* Reparent Modal */}
      {reparentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setReparentModalOpen(false)}
        >
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Reparent Frame</h3>
            <p className="text-sm text-gray-500 mb-4">
              Select a new parent for &ldquo;{currentFrame.label}&rdquo; in the parent_of hierarchy.
            </p>

            <input
              ref={reparentInputRef}
              type="text"
              value={reparentQuery}
              onChange={(e) => setReparentQuery(e.target.value)}
              placeholder="Search frames by label..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 mb-3"
            />

            {reparentError && (
              <div className="mb-3 px-3 py-2 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
                {reparentError}
              </div>
            )}

            <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
              {reparentLoading ? (
                <div className="flex items-center justify-center py-6">
                  <LoadingSpinner size="sm" noPadding />
                </div>
              ) : reparentFrames.length === 0 ? (
                <div className="px-3 py-4 text-sm text-gray-500 text-center">No frames found</div>
              ) : (
                reparentFrames
                  .filter(f => f.id !== currentFrame.id)
                  .map((frame) => (
                    <button
                      key={frame.id}
                      type="button"
                      disabled={reparentSubmitting}
                      onClick={() => handleReparent(frame.id)}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0 disabled:opacity-50"
                    >
                      <div className="text-sm font-medium text-gray-900">{frame.label}</div>
                      <div className="text-xs text-gray-500 font-mono">#{frame.id}</div>
                    </button>
                  ))
              )}
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={() => setReparentModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {roleMappingModalOpen && (
        <FrameRoleMappingModal
          parents={parentRels.map(r => ({
            id: r.source!.id,
            label: r.source!.label
          }))}
          childId={currentFrame.id}
          childLabel={currentFrame.label}
          onClose={() => setRoleMappingModalOpen(false)}
        />
      )}
    </div>
  );
}

const FrameGraph = forwardRef(FrameGraphInner);
export default FrameGraph;
