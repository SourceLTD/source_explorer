'use client';

import React, { useState } from 'react';
import { Group } from '@visx/group';
import { 
  FrameGraphNode, 
  RecipeGraph,
  sortRolesByPrecedence,
  posShortLabel,
} from '@/lib/types';
import FrameSenseTypeBadges from './FrameSenseTypeBadges';
import { getPendingNodeStroke, getPendingNodeFill } from './PendingChangeIndicator';

export const FRAME_MAIN_NODE_FIXED_HEIGHT = 600;
export const FRAME_MAIN_NODE_WIDTH = 1000;

type RecipeGraphDisplayItem = { label: string; value: string };

const RECIPE_GRAPH_ROW_GAP = 2;
const RECIPE_GRAPH_ROW_MIN_HEIGHT = 28;
const RECIPE_GRAPH_ROW_FONT_SIZE = 12;
const RECIPE_GRAPH_ROW_LINE_HEIGHT = 1.4;

function buildRecipeGraphItems(recipeGraph: RecipeGraph): RecipeGraphDisplayItem[] {
  const items: RecipeGraphDisplayItem[] = [];

  if (recipeGraph.confidence) {
    items.push({
      label: 'Confidence',
      value: `${recipeGraph.confidence}${recipeGraph.confidence_reasoning ? ' — ' + recipeGraph.confidence_reasoning : ''}`,
    });
  }

  (recipeGraph.nodes || []).forEach((recipeNode) => {
    items.push({
      label: `[${recipeNode.node_type}] ${recipeNode.id}`,
      value: `${recipeNode.description}  (${recipeNode.keywords.join(', ')})`,
    });
  });

  (recipeGraph.edges || []).forEach((edge) => {
    items.push({
      label: `${edge.source} → ${edge.target}`,
      value: edge.label,
    });
  });

  return items;
}

function estimateRecipeGraphRowHeight(item: RecipeGraphDisplayItem, containerWidth: number): number {
  const text = `${item.label}: ${item.value}`;
  const avgCharWidth = RECIPE_GRAPH_ROW_FONT_SIZE * 0.58;
  const usableWidth = containerWidth - 16;
  const charsPerLine = Math.max(1, Math.floor(usableWidth / avgCharWidth));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  const textHeight = lines * RECIPE_GRAPH_ROW_FONT_SIZE * RECIPE_GRAPH_ROW_LINE_HEIGHT;
  return Math.max(RECIPE_GRAPH_ROW_MIN_HEIGHT, Math.ceil(textHeight + 6));
}

interface FrameMainNodeProps {
  node: FrameGraphNode;
  x: number;
  y: number;
  onNodeClick: (nodeId: string) => void;
  onEditClick?: () => void;
  onVisualizeRecipeGraph?: (recipeGraph: RecipeGraph) => void;
  controlledRolesExpanded?: boolean;
  controlledLexicalUnitsExpanded?: boolean;
  controlledRecipeGraphExpanded?: boolean;
  expandedSenses?: Set<string>;
  onRolesExpandedChange?: (expanded: boolean) => void;
  onLexicalUnitsExpandedChange?: (expanded: boolean) => void;
  onRecipeGraphExpandedChange?: (expanded: boolean) => void;
  onToggleSense?: (senseId: string) => void;
  onRoleMappingClick?: () => void;
  hasParent?: boolean;
}

export default function FrameMainNode({ 
  node, 
  x, 
  y, 
  onNodeClick,
  onEditClick,
  onVisualizeRecipeGraph,
  controlledRolesExpanded,
  controlledLexicalUnitsExpanded,
  controlledRecipeGraphExpanded,
  expandedSenses: controlledExpandedSenses,
  onRolesExpandedChange,
  onLexicalUnitsExpandedChange,
  onRecipeGraphExpandedChange,
  onToggleSense,
  onRoleMappingClick,
  hasParent,
}: FrameMainNodeProps) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [internalRolesExpanded, setInternalRolesExpanded] = useState<boolean>(true);
  const [internalLexicalUnitsExpanded, setInternalLexicalUnitsExpanded] = useState<boolean>(true);
  const [internalRecipeGraphExpanded, setInternalRecipeGraphExpanded] = useState<boolean>(false);
  const [internalExpandedSenses, setInternalExpandedSenses] = useState<Set<string>>(new Set());

  const rolesExpanded = controlledRolesExpanded !== undefined ? controlledRolesExpanded : internalRolesExpanded;
  const lexicalUnitsExpanded = controlledLexicalUnitsExpanded !== undefined ? controlledLexicalUnitsExpanded : internalLexicalUnitsExpanded;
  const recipeGraphExpanded = controlledRecipeGraphExpanded !== undefined ? controlledRecipeGraphExpanded : internalRecipeGraphExpanded;
  const expandedSenses = controlledExpandedSenses !== undefined ? controlledExpandedSenses : internalExpandedSenses;

  const setRolesExpanded = (val: boolean) => {
    if (onRolesExpandedChange) onRolesExpandedChange(val);
    else setInternalRolesExpanded(val);
  };
  const setLexicalUnitsExpanded = (val: boolean) => {
    if (onLexicalUnitsExpandedChange) onLexicalUnitsExpandedChange(val);
    else setInternalLexicalUnitsExpanded(val);
  };
  const setRecipeGraphExpanded = (val: boolean) => {
    if (onRecipeGraphExpandedChange) onRecipeGraphExpandedChange(val);
    else setInternalRecipeGraphExpanded(val);
  };
  const toggleSense = (senseId: string) => {
    if (onToggleSense) {
      onToggleSense(senseId);
    } else {
      const newSet = new Set(internalExpandedSenses);
      if (newSet.has(senseId)) newSet.delete(senseId);
      else newSet.add(senseId);
      setInternalExpandedSenses(newSet);
    }
  };

  const nodeWidth = FRAME_MAIN_NODE_WIDTH;
  const nodeHeights = calculateFrameNodeHeights(node, rolesExpanded, lexicalUnitsExpanded, recipeGraphExpanded, expandedSenses);
  const nodeHeight = Math.max(FRAME_MAIN_NODE_FIXED_HEIGHT, nodeHeights.totalHeight);
  const centerX = -nodeWidth / 2;
  // Anchor from a fixed top so expansion only extends downward
  const topY = -FRAME_MAIN_NODE_FIXED_HEIGHT / 2;
  
  const hasPendingChanges = !!node.pending;
  const pendingOperation = node.pending?.operation;
  
  const { 
    shortDefHeight, 
    glossHeight, 
    rolesHeight, 
    lexicalUnitsHeight,
    recipeGraphHeight,
  } = nodeHeights;
  
  let currentY = topY + 50 + shortDefHeight + glossHeight + 8;

  return (
    <Group
      top={y}
      left={x}
      onMouseEnter={() => setHoveredNodeId(node.id)}
      onMouseLeave={() => setHoveredNodeId(null)}
      style={{ cursor: 'pointer' }}
    >
      <rect
        width={nodeWidth}
        height={nodeHeight}
        y={topY}
        x={centerX}
        fill={
          hasPendingChanges && pendingOperation
            ? getPendingNodeFill(pendingOperation)
            : '#3b82f6'
        }
        stroke={
          hasPendingChanges && pendingOperation
            ? getPendingNodeStroke(pendingOperation)
            : hoveredNodeId === node.id ? '#93c5fd' : '#1e40af'
        }
        strokeWidth={hoveredNodeId === node.id ? 4 : (hasPendingChanges ? 4 : 3)}
        rx={8}
        ry={8}
        style={{ cursor: 'pointer', transition: 'stroke 0.15s ease, stroke-width 0.15s ease' }}
        onClick={() => onNodeClick(node.id)}
      />
      
      <g>
      {/* Pending changes indicator badge */}
      {hasPendingChanges && pendingOperation && (
        <g>
          <rect
            x={centerX + nodeWidth - 80}
            y={topY + 5}
            width={75}
            height={20}
            rx={10}
            fill={getPendingNodeStroke(pendingOperation)}
          />
          <text
            x={centerX + nodeWidth - 42}
            y={topY + 18}
            fontSize={10}
            fontFamily="Arial"
            textAnchor="middle"
            fill="white"
            fontWeight="600"
          >
            {pendingOperation === 'create' ? 'NEW' : pendingOperation === 'delete' ? 'DELETED' : 'MODIFIED'}
          </text>
        </g>
      )}
      
      {/* Title */}
      <text
        x={centerX + 12}
        y={topY + 35}
        fontSize={24}
        fontFamily="Arial"
        textAnchor="start"
        style={{ pointerEvents: 'none' }}
        fill="white"
      >
        <tspan fontWeight="bold">{node.label}</tspan>
        <tspan fontWeight="normal" fontSize={16}> ({node.id})</tspan>
      </text>
      
      {/* Category Badge - Not in screenshot, removing */}
      
      {/* Short Definition */}
      {node.short_definition && (
        <foreignObject
          x={centerX + 12}
          y={topY + 50}
          width={nodeWidth - 24}
          height={shortDefHeight}
          style={{ overflow: 'hidden' }}
        >
          <div
            style={{
              fontSize: '14px',
              fontFamily: 'Arial',
              fontWeight: 'normal',
              color: 'rgba(255, 255, 255, 0.9)',
              lineHeight: '1.3',
              wordWrap: 'break-word',
              overflow: 'hidden',
              cursor: 'pointer',
            }}
            onClick={() => onNodeClick(node.id)}
          >
            {node.short_definition}
          </div>
        </foreignObject>
      )}

      {/* Definition/gloss */}
      <foreignObject
        x={centerX + 12}
        y={topY + 50 + shortDefHeight}
        width={nodeWidth - 24}
        height={glossHeight}
        style={{ overflow: 'hidden' }}
      >
        <div
          style={{
            fontSize: '16px',
            fontFamily: 'Arial',
            fontWeight: 'normal',
            color: 'white',
            lineHeight: '1.3',
            wordWrap: 'break-word',
            overflow: 'hidden',
            marginTop: '8px',
            cursor: 'pointer',
          }}
          onClick={() => onNodeClick(node.id)}
        >
          {node.gloss || 'No definition available'}
        </div>
      </foreignObject>

      {/* Roles Section */}
      <g>
        <foreignObject
          x={centerX + 12}
          y={currentY}
          width={nodeWidth - 24}
          height={28}
          style={{ overflow: 'hidden' }}
        >
          <div 
            style={{
              fontSize: '14px',
              fontFamily: 'Arial',
              color: 'white',
              fontWeight: 'bold',
              padding: '4px 6px 8px 6px',
              backgroundColor: 'rgba(0, 0, 0, 0.2)',
              borderRadius: '3px 3px 0 0',
              cursor: 'pointer',
              userSelect: 'none',
            }}
            onClick={() => setRolesExpanded(!rolesExpanded)}
          >
            {rolesExpanded ? '▼' : '▶'} Roles ({node.roles?.length || 0})
          </div>
        </foreignObject>
        
        {rolesExpanded && node.roles && node.roles.length > 0 && (
          <Group top={currentY + 28} left={centerX + 12}>
            {(() => {
              const sortedRoles = sortRolesByPrecedence(node.roles);
              const colGap = 8;
              const colWidth = (nodeWidth - 24 - colGap) / 2;
              let rowY = 0;

              const rows: { left: typeof sortedRoles[0]; right?: typeof sortedRoles[0] }[] = [];
              for (let i = 0; i < sortedRoles.length; i += 2) {
                rows.push({ left: sortedRoles[i], right: sortedRoles[i + 1] });
              }

              return rows.map((row, rowIdx) => {
                const leftText = `${row.left.label}: ${row.left.description || 'No description'}`;
                const rightText = row.right ? `${row.right.label}: ${row.right.description || 'No description'}` : '';
                const leftLines = Math.ceil(leftText.length / 50);
                const rightLines = row.right ? Math.ceil(rightText.length / 50) : 0;
                const rowHeight = Math.max(
                  leftLines <= 2 ? 44 : 60,
                  row.right ? (rightLines <= 2 ? 44 : 60) : 0
                );
                const currentRowY = rowY;
                rowY += rowHeight + 4;

                return (
                  <g key={`role-row-${rowIdx}`}>
                    <foreignObject
                      x={0}
                      y={currentRowY}
                      width={colWidth}
                      height={rowHeight}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{
                        fontSize: '14px',
                        fontFamily: 'Arial',
                        color: 'white',
                        lineHeight: '1.3',
                        wordWrap: 'break-word',
                        padding: '4px 8px',
                        backgroundColor: row.left.main ? 'rgba(59, 130, 246, 0.4)' : 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '4px',
                        height: '100%',
                        overflow: 'hidden',
                        boxSizing: 'border-box',
                        cursor: 'pointer',
                      }}
                      onClick={() => onNodeClick(node.id)}
                      >
                        <span style={{ fontWeight: 'bold' }}>{row.left.label}:</span>{' '}
                        {row.left.description || 'No description'}
                      </div>
                    </foreignObject>
                    {row.right && (
                      <foreignObject
                        x={colWidth + colGap}
                        y={currentRowY}
                        width={colWidth}
                        height={rowHeight}
                        style={{ overflow: 'hidden' }}
                      >
                        <div style={{
                          fontSize: '14px',
                          fontFamily: 'Arial',
                          color: 'white',
                          lineHeight: '1.3',
                          wordWrap: 'break-word',
                          padding: '4px 8px',
                          backgroundColor: row.right.main ? 'rgba(59, 130, 246, 0.4)' : 'rgba(255, 255, 255, 0.1)',
                          borderRadius: '4px',
                          height: '100%',
                          overflow: 'hidden',
                          boxSizing: 'border-box',
                          cursor: 'pointer',
                        }}
                        onClick={() => onNodeClick(node.id)}
                        >
                          <span style={{ fontWeight: 'bold' }}>{row.right.label}:</span>{' '}
                          {row.right.description || 'No description'}
                        </div>
                      </foreignObject>
                    )}
                  </g>
                );
              });
            })()}
            </Group>
        )}
        {(() => { currentY += rolesHeight + 4; return null; })()}
      </g>

      {/* Senses Section — grouped view: each sense → its frame link + its LUs */}
      {node.senses && node.senses.length > 0 && (
        <g>
          <foreignObject
            x={centerX + 12}
            y={currentY}
            width={nodeWidth - 24}
            height={28}
            style={{ overflow: 'hidden' }}
          >
            <div
              style={{
                fontSize: '14px',
                fontFamily: 'Arial',
                color: 'white',
                fontWeight: 'bold',
                padding: '4px 6px 8px 6px',
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '3px 3px 0 0',
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onClick={() => setLexicalUnitsExpanded(!lexicalUnitsExpanded)}
            >
              {lexicalUnitsExpanded ? '▼' : '▶'} Senses ({node.senses.length})
            </div>
          </foreignObject>

          {lexicalUnitsExpanded && (
            <Group top={currentY + 28} left={centerX + 12}>
              {(() => {
                const innerWidth = nodeWidth - 24;
                const colGap = 8;
                const colWidth = (innerWidth - colGap) / 2;
                const luRowGap = 4;
                  const senseHeaderHeight = 46;
                const senseGap = 0;
                const visibleSenses = node.senses.slice(0, 15);

                let senseY = 0;
                return visibleSenses.map((sense, senseIdx) => {
                  const lus = sense.lexical_units ?? [];
                  const rows: { left: typeof lus[0]; right?: typeof lus[0] }[] = [];
                  for (let i = 0; i < lus.length; i += 2) {
                    rows.push({ left: lus[i], right: lus[i + 1] });
                  }
                  const startY = senseY;
                  const warning = sense.frameWarning;
                  const headerBg =
                    warning === null ? 'rgba(255, 255, 255, 0.12)' : 'rgba(251, 191, 36, 0.25)';
                  const headerBorder =
                    warning === null ? 'rgba(255, 255, 255, 0.2)' : 'rgba(251, 191, 36, 0.6)';

                  const senseElements: React.ReactNode[] = [];
                  senseElements.push(
                    <foreignObject
                      key={`sense-header-${sense.id}`}
                      x={0}
                      y={startY}
                      width={innerWidth}
                      height={senseHeaderHeight}
                      style={{ overflow: 'hidden' }}
                    >
                      <div
                        style={{
                          fontSize: '12px',
                          fontFamily: 'Arial, sans-serif',
                          color: 'white',
                          padding: '5px 8px',
                          background: headerBg,
                          border: `1px solid ${headerBorder}`,
                          borderRadius: visibleSenses.length === 1 ? '4px' : (senseIdx === 0 ? (expandedSenses.has(sense.id) ? '4px' : '4px 4px 0 0') : (senseIdx === visibleSenses.length - 1 && !expandedSenses.has(sense.id) ? '0 0 4px 4px' : (expandedSenses.has(sense.id) ? '4px' : '0'))),
                          height: '100%',
                          boxSizing: 'border-box',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              color: '#bfdbfe',
                              backgroundColor: 'rgba(59, 130, 246, 0.4)',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              textTransform: 'uppercase' as const,
                              marginRight: 6,
                              marginTop: 1,
                              flexShrink: 0,
                            }}
                          >
                            {posShortLabel(sense.pos)}
                          </span>
                          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: 1 }}>
                            {sense.lemmas && sense.lemmas.length > 0 ? (
                              <span style={{ fontSize: 11, color: '#bfdbfe', fontStyle: 'italic', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.2' }}>
                                {sense.lemmas.join(', ')}
                              </span>
                            ) : null}
                            <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.2' }}>
                              {sense.definition || 'No definition'}
                            </span>
                          </div>
                        </div>

                        <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, marginLeft: 8, gap: 4 }}>
                          <FrameSenseTypeBadges sense={sense} />
                          {lus.length > 0 && (
                            <span
                              style={{ 
                                cursor: 'pointer', 
                                padding: '2px 6px', 
                                borderRadius: '4px',
                                background: 'rgba(255,255,255,0.15)',
                                fontWeight: 600,
                                fontSize: 11,
                                color: '#bfdbfe'
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSense(sense.id);
                              }}
                            >
                              {expandedSenses.has(sense.id) ? 'Hide LUs' : `Show LUs (${lus.length})`}
                            </span>
                          )}
                          {warning === 'none' && <span style={{ color: '#fde68a', fontWeight: 600, marginLeft: 4, fontSize: 11 }}>⚠ no frame</span>}
                          {warning === 'multiple' && <span style={{ color: '#fde68a', fontWeight: 600, marginLeft: 4, fontSize: 11 }}>⚠ {sense.frames.length} frames</span>}
                        </span>
                      </div>
                    </foreignObject>
                  );
                  senseY += senseHeaderHeight;
                  if (!expandedSenses.has(sense.id) && senseIdx < visibleSenses.length - 1) {
                    senseY -= 1;
                  }

                  const renderLuCell = (lu: typeof lus[0], xPos: number, rowTop: number, rowH: number) => (
                    <foreignObject
                      key={lu.id}
                      x={xPos}
                      y={rowTop}
                      width={colWidth}
                      height={rowH}
                      style={{ overflow: 'hidden' }}
                    >
                      <div
                        style={{
                          fontSize: '14px',
                          fontFamily: 'Arial, sans-serif',
                          color: 'white',
                          padding: '5px 8px',
                          background: 'rgba(255, 255, 255, 0.1)',
                          borderRadius: '4px',
                          overflow: 'hidden',
                          height: '100%',
                          boxSizing: 'border-box',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#bfdbfe',
                            backgroundColor: 'rgba(59, 130, 246, 0.4)',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            textTransform: 'uppercase' as const,
                            marginRight: '6px',
                          }}
                        >
                          {lu.pos}
                        </span>
                        {lu.legacy_id && (
                          <span
                            style={{
                              fontSize: '12px',
                              fontWeight: 600,
                              color: '#bfdbfe',
                              marginRight: '6px',
                            }}
                          >
                            {lu.legacy_id}
                          </span>
                        )}
                        <span style={{ color: '#e0eaff' }}>
                          {(() => {
                            const all = [
                              ...(lu.src_lemmas || []).map(l => ({ text: l, src: true })),
                              ...(lu.lemmas || []).map(l => ({ text: l, src: false }))
                            ];
                            return (
                              <>
                                {all.slice(0, 4).map((item, i) => (
                                  <React.Fragment key={i}>
                                    {i > 0 && ', '}
                                    <span style={{ fontWeight: item.src ? 700 : 400 }}>{item.text}</span>
                                  </React.Fragment>
                                ))}
                                {all.length > 4 ? ', ...' : ''}
                              </>
                            );
                          })()}
                        </span>
                        {lu.gloss && (
                          <>
                            <br />
                            <span style={{ color: '#e0eaff', fontSize: '14px', lineHeight: '1.4' }}>
                              {lu.gloss}
                            </span>
                          </>
                        )}
                      </div>
                    </foreignObject>
                  );

                  if (expandedSenses.has(sense.id)) {
                    senseY += 4;
                    rows.forEach((row, rowIdx) => {
                      const leftHeight = estimateLuRowHeight(row.left, colWidth);
                      const rightHeight = row.right ? estimateLuRowHeight(row.right, colWidth) : 0;
                      const rowHeight = Math.max(leftHeight, rightHeight);
                      const rowTop = senseY;
                      senseElements.push(
                        <g key={`sense-${sense.id}-row-${rowIdx}`}>
                          {renderLuCell(row.left, 0, rowTop, rowHeight)}
                          {row.right && renderLuCell(row.right, colWidth + colGap, rowTop, rowHeight)}
                        </g>
                      );
                      senseY += rowHeight + luRowGap;
                    });
                  }

                  senseY += senseGap;
                  return <g key={`sense-${sense.id}-${senseIdx}`}>{senseElements}</g>;
                });
              })()}
              {node.senses.length > 15 && (
                <text
                  x={8}
                  y={lexicalUnitsHeight - 40}
                  fontSize={11}
                  fill="white"
                  style={{ opacity: 0.7 }}
                >
                  + {node.senses.length - 15} more senses
                </text>
              )}
            </Group>
          )}
        </g>
      )}
      {(() => { currentY += lexicalUnitsHeight > 0 ? lexicalUnitsHeight + 4 : 0; return null; })()}

      {/* Recipe Graph Section */}
      {node.recipe_graph && (
        <g>
          <foreignObject
            x={centerX + 12}
            y={currentY}
            width={nodeWidth - 24}
            height={28}
            style={{ overflow: 'hidden' }}
          >
            <div 
              style={{
                fontSize: '14px',
                fontFamily: 'Arial',
                color: 'white',
                fontWeight: 'bold',
                padding: '4px 6px 8px 6px',
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '3px 3px 0 0',
                cursor: 'pointer',
                userSelect: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              onClick={() => setRecipeGraphExpanded(!recipeGraphExpanded)}
            >
              <span>
                {recipeGraphExpanded ? '▼' : '▶'} Recipe Graph ({node.recipe_graph.nodes?.length || 0} nodes, {node.recipe_graph.edges?.length || 0} edges)
              </span>
              {onVisualizeRecipeGraph && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.25)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    onVisualizeRecipeGraph(node.recipe_graph!);
                  }}
                >
                  Visualize
                </span>
              )}
            </div>
          </foreignObject>
          
          {recipeGraphExpanded && (
            <Group top={currentY + 28} left={centerX + 12}>
              {(() => {
                const rg = node.recipe_graph!;
                const items = buildRecipeGraphItems(rg);

                let rowY = 0;
                return items.map((item, idx) => {
                  const rowHeight = estimateRecipeGraphRowHeight(item, nodeWidth - 24);
                  const y = rowY;
                  rowY += rowHeight + RECIPE_GRAPH_ROW_GAP;
                  return (
                    <foreignObject
                      key={`rg-item-${idx}`}
                      x={0}
                      y={y}
                      width={nodeWidth - 24}
                      height={rowHeight}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{
                        fontSize: '12px',
                        fontFamily: 'Arial, monospace',
                        color: 'white',
                        lineHeight: '1.4',
                        padding: '3px 8px',
                        backgroundColor: idx === 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                        borderRadius: '3px',
                        overflow: 'hidden',
                        height: '100%',
                        boxSizing: 'border-box',
                      }}>
                        <span style={{ fontWeight: 'bold', color: '#bfdbfe' }}>{item.label}:</span>{' '}
                        <span style={{ color: '#e0eaff' }}>{item.value}</span>
                      </div>
                    </foreignObject>
                  );
                });
              })()}
            </Group>
          )}
          {(() => { currentY += recipeGraphHeight + 4; return null; })()}
        </g>
      )}

      {/* Role Mapping Button - Next to Edit Button */}
      {onRoleMappingClick && (
        <g>
          <rect
            x={centerX + nodeWidth - 88}
            y={topY + 8}
            width={36}
            height={36}
            rx={6}
            fill={hasParent ? "rgba(59, 130, 246, 0.95)" : "rgba(156, 163, 175, 0.95)"}
            stroke="rgba(255, 255, 255, 0.9)"
            strokeWidth={2}
            style={{ cursor: hasParent ? 'pointer' : 'not-allowed' }}
            onClick={(e) => {
              e.stopPropagation();
              if (hasParent) onRoleMappingClick();
            }}
            onMouseEnter={(e) => {
              if (hasParent) e.currentTarget.setAttribute('fill', 'rgba(29, 78, 216, 1)');
            }}
            onMouseLeave={(e) => {
              if (hasParent) e.currentTarget.setAttribute('fill', 'rgba(59, 130, 246, 0.95)');
            }}
          >
            <title>{hasParent ? "View role mappings from parent frames" : "No parent frames to map roles from"}</title>
          </rect>
          <g
            style={{ pointerEvents: 'none' }}
            transform={`translate(${centerX + nodeWidth - 70}, ${topY + 26}) scale(0.75)`}
          >
            <g transform="translate(-12, -12)">
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2.5}
                stroke="white"
                fill="none"
                d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" 
              />
            </g>
          </g>
        </g>
      )}

      {/* Edit Button - Top Right */}
      {onEditClick && (
        <g>
          <rect
            x={centerX + nodeWidth - 44}
            y={topY + 8}
            width={36}
            height={36}
            rx={6}
            fill="rgba(59, 130, 246, 0.95)"
            stroke="rgba(255, 255, 255, 0.9)"
            strokeWidth={2}
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              onEditClick();
            }}
            onMouseEnter={(e) => {
              e.currentTarget.setAttribute('fill', 'rgba(29, 78, 216, 1)');
            }}
            onMouseLeave={(e) => {
              e.currentTarget.setAttribute('fill', 'rgba(59, 130, 246, 0.95)');
            }}
          >
            <title>Edit frame details</title>
          </rect>
          <g
            style={{ pointerEvents: 'none' }}
            transform={`translate(${centerX + nodeWidth - 26}, ${topY + 26}) scale(0.75)`}
          >
            <g transform="translate(-12, -12)">
              <path
                d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          </g>
        </g>
      )}
      </g>
    </Group>
  );
}

/**
 * Estimate the height of a single lexical unit row based on gloss length.
 */
function estimateLuRowHeight(lu: { gloss?: string | null }, containerWidth: number): number {
  const headerLine = 24;
  const padding = 10;
  if (!lu.gloss) return headerLine + padding;
  const glossFontSize = 14;
  const glossLineHeight = glossFontSize * 1.4;
  const avgCharWidth = glossFontSize * 0.55;
  const usableWidth = containerWidth - 16;
  const charsPerLine = Math.max(1, Math.floor(usableWidth / avgCharWidth));
  const glossLines = Math.max(1, Math.ceil(lu.gloss.length / charsPerLine));
  return headerLine + glossLines * glossLineHeight + padding;
}

/**
 * Calculate dynamic heights for frame node sections
 */
export function calculateFrameNodeHeights(
  node: FrameGraphNode,
  rolesExpanded: boolean = true,
  lexicalUnitsExpanded: boolean = true,
  recipeGraphExpanded: boolean = false,
  expandedSenses: Set<string> = new Set()
) {
  const nodeWidth = 1000;
  const contentWidth = nodeWidth - 24;
  
  const estimateTextHeight = (text: string, width: number, fontSize: number = 14, lineHeight: number = 1.3): number => {
    const avgCharWidth = fontSize * 0.6;
    const availableWidth = width - 24;
    const charsPerLine = Math.floor(availableWidth / avgCharWidth);
    const lines = Math.ceil(text.length / charsPerLine);
    return Math.max(1, lines) * fontSize * lineHeight;
  };

  let height = 20; // Top padding
  height += 35; // Title height
  
  const shortDefText = node.short_definition || '';
  const shortDefHeight = shortDefText ? Math.max(15, estimateTextHeight(shortDefText, contentWidth, 14, 1.3) + 4) : 0;
  height += shortDefHeight;

  const glossText = node.gloss || 'No definition available';
  const glossHeight = Math.max(30, estimateTextHeight(glossText, contentWidth, 16, 1.3) + 10);
  height += glossHeight + 8;

  // Roles section (two columns)
  let rolesHeight = 28;
  if (rolesExpanded && node.roles && node.roles.length > 0) {
    const visibleRoles = node.roles;
    for (let i = 0; i < visibleRoles.length; i += 2) {
      const leftText = `${visibleRoles[i].label}: ${visibleRoles[i].description || 'No description'}`;
      const leftLines = Math.ceil(leftText.length / 50);
      const leftHeight = leftLines <= 2 ? 44 : 60;
      let rightHeight = 0;
      if (visibleRoles[i + 1]) {
        const rightText = `${visibleRoles[i + 1].label}: ${visibleRoles[i + 1].description || 'No description'}`;
        const rightLines = Math.ceil(rightText.length / 50);
        rightHeight = rightLines <= 2 ? 44 : 60;
      }
      rolesHeight += Math.max(leftHeight, rightHeight) + 4;
    }
  }
  height += rolesHeight + 4;

  // Senses section (each sense renders a header + its LUs as a 2-col grid)
  let lexicalUnitsHeight = 0;
  const senses = node.senses || [];
  if (senses.length > 0) {
    lexicalUnitsHeight = 28;
    if (lexicalUnitsExpanded) {
      const luRowGap = 4;
      const colGap = 8;
      const colWidth = (contentWidth - colGap) / 2;
                  const senseHeaderHeight = 46;
      const senseGap = 0;
      const visibleSenses = senses.slice(0, 15);
      for (let senseIdx = 0; senseIdx < visibleSenses.length; senseIdx++) {
        const sense = visibleSenses[senseIdx];
        lexicalUnitsHeight += senseHeaderHeight;
        if (!expandedSenses.has(sense.id) && senseIdx < visibleSenses.length - 1) {
          lexicalUnitsHeight -= 1;
        }
        
        const lus = sense.lexical_units ?? [];
        if (expandedSenses.has(sense.id)) {
          lexicalUnitsHeight += 4;
          if (lus.length === 0) {
            lexicalUnitsHeight += 22 + luRowGap;
          } else {
            for (let i = 0; i < lus.length; i += 2) {
              const leftHeight = estimateLuRowHeight(lus[i], colWidth);
              const rightHeight = lus[i + 1] ? estimateLuRowHeight(lus[i + 1], colWidth) : 0;
              lexicalUnitsHeight += Math.max(leftHeight, rightHeight) + luRowGap;
            }
          }
        }
        lexicalUnitsHeight += senseGap;
      }
      lexicalUnitsHeight += 8;
      if (senses.length > 15) lexicalUnitsHeight += 25;
    }
    height += lexicalUnitsHeight + 4;
  }

  // Recipe graph section
  let recipeGraphHeight = 0;
  if (node.recipe_graph) {
    recipeGraphHeight = 28;
    if (recipeGraphExpanded) {
      const items = buildRecipeGraphItems(node.recipe_graph);
      for (const item of items) {
        recipeGraphHeight += estimateRecipeGraphRowHeight(item, contentWidth) + RECIPE_GRAPH_ROW_GAP;
      }
      recipeGraphHeight += 8;
    }
    height += recipeGraphHeight + 4;
  }

  height += 20;
  
  return {
    totalHeight: height,
    shortDefHeight,
    glossHeight,
    rolesHeight,
    lexicalUnitsHeight,
    recipeGraphHeight,
  };
}

export function calculateFrameMainNodeHeight(
  node: FrameGraphNode,
  rolesExpanded: boolean = true,
  lexicalUnitsExpanded: boolean = true,
  recipeGraphExpanded: boolean = false,
  expandedSenses: Set<string> = new Set()
): number {
  return calculateFrameNodeHeights(node, rolesExpanded, lexicalUnitsExpanded, recipeGraphExpanded, expandedSenses).totalHeight;
}

