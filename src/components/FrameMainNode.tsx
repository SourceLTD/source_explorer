'use client';

import React, { useState } from 'react';
import { Group } from '@visx/group';
import { 
  FrameGraphNode, 
  sortRolesByPrecedence, 
} from '@/lib/types';
import { getPendingNodeStroke, getPendingNodeFill } from './PendingChangeIndicator';

interface FrameMainNodeProps {
  node: FrameGraphNode;
  x: number;
  y: number;
  onNodeClick: (nodeId: string) => void;
  onFrameClick: (frameId: string) => void;
  onVerbClick: (verbId: string) => void;
  onEditClick?: () => void;
  controlledRolesExpanded?: boolean;
  controlledLexicalUnitsExpanded?: boolean;
  onRolesExpandedChange?: (expanded: boolean) => void;
  onLexicalUnitsExpandedChange?: (expanded: boolean) => void;
}

export default function FrameMainNode({ 
  node, 
  x, 
  y, 
  onNodeClick,
  onFrameClick,
  onVerbClick,
  onEditClick,
  controlledRolesExpanded,
  controlledLexicalUnitsExpanded,
  onRolesExpandedChange,
  onLexicalUnitsExpandedChange,
}: FrameMainNodeProps) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [internalRolesExpanded, setInternalRolesExpanded] = useState<boolean>(true);
  const [internalLexicalUnitsExpanded, setInternalLexicalUnitsExpanded] = useState<boolean>(true);

  const rolesExpanded = controlledRolesExpanded !== undefined ? controlledRolesExpanded : internalRolesExpanded;
  const lexicalUnitsExpanded = controlledLexicalUnitsExpanded !== undefined ? controlledLexicalUnitsExpanded : internalLexicalUnitsExpanded;

  const setRolesExpanded = (val: boolean) => {
    if (onRolesExpandedChange) onRolesExpandedChange(val);
    else setInternalRolesExpanded(val);
  };
  const setLexicalUnitsExpanded = (val: boolean) => {
    if (onLexicalUnitsExpandedChange) onLexicalUnitsExpandedChange(val);
    else setInternalLexicalUnitsExpanded(val);
  };

  const nodeWidth = 1000;
  const nodeHeights = calculateFrameNodeHeights(node, rolesExpanded, lexicalUnitsExpanded);
  const nodeHeight = nodeHeights.totalHeight;
  const centerX = -nodeWidth / 2;
  const centerY = -nodeHeight / 2;
  
  const hasPendingChanges = !!node.pending;
  const pendingOperation = node.pending?.operation;
  
  const { 
    shortDefHeight, 
    glossHeight, 
    rolesHeight, 
    lexicalUnitsHeight, 
  } = nodeHeights;
  
  let currentY = centerY + 50 + shortDefHeight + glossHeight + 8;

  return (
    <Group
      top={y}
      left={x}
      onMouseEnter={() => setHoveredNodeId(node.id)}
      onMouseLeave={() => setHoveredNodeId(null)}
      style={{ cursor: 'pointer' }}
    >
      <defs>
        <filter id="frameNodeHoverShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.45" />
        </filter>
      </defs>
      
      <rect
        width={nodeWidth}
        height={nodeHeight}
        y={centerY}
        x={centerX}
        fill={
          hasPendingChanges && pendingOperation
            ? getPendingNodeFill(pendingOperation)
            : '#3b82f6'
        }
        stroke={
          hasPendingChanges && pendingOperation
            ? getPendingNodeStroke(pendingOperation)
            : '#1e40af'
        }
        strokeWidth={hasPendingChanges ? 4 : 3}
        rx={8}
        ry={8}
        style={{ cursor: 'pointer' }}
        filter={hoveredNodeId === node.id ? 'url(#frameNodeHoverShadow)' : undefined}
        onClick={() => onNodeClick(node.id)}
      />
      
      {/* Pending changes indicator badge */}
      {hasPendingChanges && pendingOperation && (
        <g>
          <rect
            x={centerX + nodeWidth - 80}
            y={centerY + 5}
            width={75}
            height={20}
            rx={10}
            fill={getPendingNodeStroke(pendingOperation)}
          />
          <text
            x={centerX + nodeWidth - 42}
            y={centerY + 18}
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
        y={centerY + 35}
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
          y={centerY + 50}
          width={nodeWidth - 24}
          height={shortDefHeight}
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
            }}
          >
            {node.short_definition}
          </div>
        </foreignObject>
      )}

      {/* Definition/gloss */}
      <foreignObject
        x={centerX + 12}
        y={centerY + 50 + shortDefHeight}
        width={nodeWidth - 24}
        height={glossHeight}
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
          }}
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
                      }}>
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
                        }}>
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

      {/* Lexical Units Section */}
      {node.lexical_units && node.lexical_units.length > 0 && (
        <g>
          <foreignObject
            x={centerX + 12}
            y={currentY}
            width={nodeWidth - 24}
            height={28}
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
              {lexicalUnitsExpanded ? '▼' : '▶'} Lexical Units ({node.lexical_units.length})
            </div>
          </foreignObject>
          
          {lexicalUnitsExpanded && (
            <Group top={currentY + 28} left={centerX + 12}>
              {(() => {
                const luRowGap = 4;
                let luOffset = 0;
                return node.lexical_units.slice(0, 15).map((lu) => {
                  const hasGloss = !!lu.gloss;
                  const luRowHeight = estimateLuRowHeight(lu, nodeWidth - 24);
                  const currentLuOffset = luOffset;
                  luOffset += luRowHeight + luRowGap;
                  return (
                    <foreignObject
                      key={lu.id}
                      x={0}
                      y={currentLuOffset}
                      width={nodeWidth - 24}
                      height={luRowHeight}
                    >
                      <div
                        xmlns="http://www.w3.org/1999/xhtml"
                        style={{
                          fontSize: '14px',
                          fontFamily: 'Arial, sans-serif',
                          color: 'white',
                          padding: '5px 8px',
                          background: 'rgba(255, 255, 255, 0.1)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          overflow: 'hidden',
                          width: nodeWidth - 24 - 16,
                          boxSizing: 'content-box',
                        }}
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          onVerbClick(lu.id);
                        }}
                      >
                        <span style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: '#bfdbfe',
                          backgroundColor: 'rgba(59, 130, 246, 0.4)',
                          padding: '1px 5px',
                          borderRadius: '3px',
                          textTransform: 'uppercase' as const,
                          marginRight: '6px',
                        }}>
                          {lu.pos}
                        </span>
                        <span style={{ color: '#e0eaff', fontWeight: 700 }}>
                          {lu.lemmas?.slice(0, 4).join(', ')}
                        </span>
                        {hasGloss && (
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
                });
              })()}
              {node.lexical_units.length > 15 && (
                <text
                  x={8}
                  y={lexicalUnitsHeight - 40}
                  fontSize={11}
                  fill="white"
                  style={{ opacity: 0.7 }}
                >
                  + {node.lexical_units.length - 15} more lexical units
                </text>
              )}
            </Group>
          )}
        </g>
      )}

      {/* Edit Button - Top Right */}
      {onEditClick && (
        <g>
          <rect
            x={centerX + nodeWidth - 44}
            y={centerY + 8}
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
            transform={`translate(${centerX + nodeWidth - 26}, ${centerY + 26}) scale(0.75)`}
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
  lexicalUnitsExpanded: boolean = true
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

  // Lexical units section
  let lexicalUnitsHeight = 0;
  const lexicalUnits = node.lexical_units || [];
  if (lexicalUnits.length > 0) {
    lexicalUnitsHeight = 28;
    if (lexicalUnitsExpanded) {
      const visibleLUs = lexicalUnits.slice(0, 15);
      const luRowGap = 4;
      visibleLUs.forEach(lu => {
        lexicalUnitsHeight += estimateLuRowHeight(lu, contentWidth) + luRowGap;
      });
      lexicalUnitsHeight += 8;
      if (lexicalUnits.length > 15) lexicalUnitsHeight += 25;
    }
    height += lexicalUnitsHeight + 4;
  }

  height += 20;
  
  return {
    totalHeight: height,
    shortDefHeight,
    glossHeight,
    rolesHeight,
    lexicalUnitsHeight,
  };
}

export function calculateFrameMainNodeHeight(
  node: FrameGraphNode,
  rolesExpanded: boolean = true,
  lexicalUnitsExpanded: boolean = true
): number {
  return calculateFrameNodeHeights(node, rolesExpanded, lexicalUnitsExpanded).totalHeight;
}

