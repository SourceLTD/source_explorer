'use client';

import React, { useState, useCallback } from 'react';
import { Group } from '@visx/group';
import { 
  FrameGraphNode, 
  FrameRelationType, 
  sortRolesByPrecedence, 
  PendingChangeInfo 
} from '@/lib/types';
import { getPendingNodeStroke, getPendingNodeFill } from './PendingChangeIndicator';

// Relation type display labels
const RELATION_LABELS: Record<FrameRelationType, string> = {
  'causes': 'Causes',
  'inherits_from': 'Inherits From',
  'inherited_by': 'Inherited By',
  'uses': 'Uses',
  'used_by': 'Used By',
  'subframe_of': 'Subframe Of',
  'has_subframe': 'Has Subframe',
  'precedes': 'Precedes',
  'preceded_by': 'Preceded By',
  'perspective_on': 'Perspective On',
  'perspectivized_in': 'Perspectivized In',
  'see_also': 'See Also',
  'reframing_mapping': 'Reframing',
  'metaphor': 'Metaphor',
};

interface FrameMainNodeProps {
  node: FrameGraphNode;
  x: number;
  y: number;
  onNodeClick: (nodeId: string) => void;
  onFrameClick: (frameId: string) => void;
  onVerbClick: (verbId: string) => void;
  onEditClick?: () => void;
  // Optional controlled expansion states
  controlledRolesExpanded?: boolean;
  controlledVerbsExpanded?: boolean;
  controlledRelationsExpanded?: boolean;
  onRolesExpandedChange?: (expanded: boolean) => void;
  onVerbsExpandedChange?: (expanded: boolean) => void;
  onRelationsExpandedChange?: (expanded: boolean) => void;
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
  controlledVerbsExpanded,
  controlledRelationsExpanded,
  onRolesExpandedChange,
  onVerbsExpandedChange,
  onRelationsExpandedChange,
}: FrameMainNodeProps) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [internalRolesExpanded, setInternalRolesExpanded] = useState<boolean>(true);
  const [internalVerbsExpanded, setInternalVerbsExpanded] = useState<boolean>(false);
  const [internalRelationsExpanded, setInternalRelationsExpanded] = useState<boolean>(true);

  // Use controlled values if provided, otherwise use internal state
  const rolesExpanded = controlledRolesExpanded !== undefined ? controlledRolesExpanded : internalRolesExpanded;
  const verbsExpanded = controlledVerbsExpanded !== undefined ? controlledVerbsExpanded : internalVerbsExpanded;
  const relationsExpanded = controlledRelationsExpanded !== undefined ? controlledRelationsExpanded : internalRelationsExpanded;

  const setRolesExpanded = (val: boolean) => {
    if (onRolesExpandedChange) onRolesExpandedChange(val);
    else setInternalRolesExpanded(val);
  };
  const setVerbsExpanded = (val: boolean) => {
    if (onVerbsExpandedChange) onVerbsExpandedChange(val);
    else setInternalVerbsExpanded(val);
  };
  const setRelationsExpanded = (val: boolean) => {
    if (onRelationsExpandedChange) onRelationsExpandedChange(val);
    else setInternalRelationsExpanded(val);
  };

  // Helper function to estimate text height based on content and width
  const estimateTextHeight = (text: string, width: number, fontSize: number = 13, lineHeight: number = 1.3): number => {
    const avgCharWidth = fontSize * 0.6;
    const availableWidth = width - 24;
    const charsPerLine = Math.floor(availableWidth / avgCharWidth);
    const lines = Math.ceil(text.length / charsPerLine);
    return Math.max(1, lines) * fontSize * lineHeight;
  };

  const nodeWidth = 600;
  const nodeHeights = calculateFrameNodeHeights(node, rolesExpanded, verbsExpanded, relationsExpanded);
  const nodeHeight = nodeHeights.totalHeight;
  const centerX = -nodeWidth / 2;
  const centerY = -nodeHeight / 2;
  
  const hasPendingChanges = !!node.pending;
  const pendingOperation = node.pending?.operation;
  
  const { 
    shortDefHeight, 
    glossHeight, 
    rolesHeight, 
    verbsHeight, 
    relationsHeight 
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
        fontSize={20}
        fontFamily="Arial"
        textAnchor="start"
        style={{ pointerEvents: 'none' }}
        fill="white"
      >
        <tspan fontWeight="bold">{node.label}</tspan>
        <tspan fontWeight="normal" fontSize={14}> ({node.id})</tspan>
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
              fontSize: '15px',
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
            fontSize: '14px',
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
          height={20}
        >
          <div 
            style={{
              fontSize: '13px',
              fontFamily: 'Arial',
              color: 'white',
              fontWeight: 'bold',
              padding: '2px 6px',
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
          <Group top={currentY + 20} left={centerX + 12}>
            {(() => {
              // Map FrameGraphRole to a structure sortRolesByPrecedence understands
              const sortableRoles = node.roles.map(r => ({
                ...r,
                role_type: { label: r.role_type_label }
              }));
              const sortedRoles = sortRolesByPrecedence(sortableRoles);
              let roleOffset = 0;
              
              return sortedRoles.slice(0, 10).map((role, idx) => {
                const roleText = `${role.role_type_label}: ${role.description || 'No description'}`;
                const estimatedLines = Math.ceil(roleText.length / 60);
                const roleHeight = estimatedLines <= 2 ? 40 : 55;
                const currentRoleOffset = roleOffset;
                roleOffset += roleHeight + 4;

                return (
                  <foreignObject
                    key={`role-${role.id}`}
                    x={0}
                    y={currentRoleOffset}
                    width={nodeWidth - 24}
                    height={roleHeight}
                  >
                    <div style={{
                      fontSize: '12px',
                      fontFamily: 'Arial',
                      color: 'white',
                      lineHeight: '1.3',
                      wordWrap: 'break-word',
                      padding: '4px 8px',
                      backgroundColor: role.main ? 'rgba(59, 130, 246, 0.4)' : 'rgba(255, 255, 255, 0.1)',
                      borderRadius: '4px',
                      height: '100%',
                      overflow: 'hidden',
                    }}>
                      <span style={{ fontWeight: 'bold' }}>{role.role_type_label}:</span>{' '}
                      {role.description || 'No description'}
                    </div>
                  </foreignObject>
                );
              });
            })()}
            {node.roles.length > 10 && (
              <text
                x={8}
                y={rolesHeight - 25}
                fontSize={11}
                fill="white"
                style={{ opacity: 0.7 }}
              >
                + {node.roles.length - 10} more roles
              </text>
            )}
          </Group>
        )}
        {(() => { currentY += rolesHeight + 4; return null; })()}
      </g>

      {/* Verbs Section */}
      {(() => {
        const verbs = node.lexical_units?.filter(lu => lu.pos === 'verb') || [];
        if (verbs.length === 0) return null;

        return (
          <g>
            <foreignObject
              x={centerX + 12}
              y={currentY}
              width={nodeWidth - 24}
              height={20}
            >
              <div 
                style={{
                  fontSize: '13px',
                  fontFamily: 'Arial',
                  color: 'white',
                  fontWeight: 'bold',
                  padding: '2px 6px',
                  backgroundColor: 'rgba(0, 0, 0, 0.2)',
                  borderRadius: '3px 3px 0 0',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
                onClick={() => setVerbsExpanded(!verbsExpanded)}
              >
                {verbsExpanded ? '▼' : '▶'} Verbs ({verbs.length})
              </div>
            </foreignObject>
            
            {verbsExpanded && (
              <foreignObject
                x={centerX + 12}
                y={currentY + 20}
                width={nodeWidth - 24}
                height={verbsHeight - 20}
              >
                <div style={{ 
                  fontSize: '12px', 
                  color: 'white',
                  padding: '4px 0',
                }}>
                  {verbs.slice(0, 10).map((verb) => (
                    <div 
                      key={verb.id} 
                      style={{ 
                        padding: '4px 8px', 
                        background: 'rgba(59, 130, 246, 0.3)',
                        borderRadius: '4px',
                        marginBottom: '4px',
                        cursor: 'pointer',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onVerbClick(verb.id);
                      }}
                    >
                      <strong style={{ color: '#bfdbfe' }}>{verb.code || verb.id}</strong>
                      <span style={{ opacity: 0.8, marginLeft: '8px' }}>
                        {verb.lemmas?.slice(0, 3).join(', ')}
                      </span>
                    </div>
                  ))}
                  {verbs.length > 10 && (
                    <div style={{ opacity: 0.7, padding: '4px 8px', fontSize: '11px' }}>
                      + {verbs.length - 10} more verbs
                    </div>
                  )}
                </div>
              </foreignObject>
            )}
            {(() => { currentY += verbsHeight + 4; return null; })()}
          </g>
        );
      })()}

      {/* Relations Section */}
      {node.relations && node.relations.length > 0 && (
        <g>
          <foreignObject
            x={centerX + 12}
            y={currentY}
            width={nodeWidth - 24}
            height={20}
          >
            <div 
              style={{
                fontSize: '13px',
                fontFamily: 'Arial',
                color: 'white',
                fontWeight: 'bold',
                padding: '2px 6px',
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                borderRadius: '3px 3px 0 0',
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onClick={() => setRelationsExpanded(!relationsExpanded)}
            >
              {relationsExpanded ? '▼' : '▶'} Relations ({node.relations.length})
            </div>
          </foreignObject>
          
          {relationsExpanded && (
            <foreignObject
              x={centerX + 12}
              y={currentY + 20}
              width={nodeWidth - 24}
              height={relationsHeight - 20}
            >
              <div style={{ 
                fontSize: '12px', 
                color: 'white',
                padding: '4px 0',
              }}>
                {node.relations.slice(0, 10).map((rel, relIdx) => {
                  const targetFrame = rel.direction === 'outgoing' ? rel.target : rel.source;
                  if (!targetFrame) return null;
                  return (
                    <div 
                      key={relIdx} 
                      style={{ 
                        padding: '4px 8px', 
                        background: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '4px',
                        marginBottom: '4px',
                        cursor: 'pointer',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onFrameClick(targetFrame.id);
                      }}
                    >
                      <span style={{ opacity: 0.7 }}>
                        {rel.direction === 'outgoing' ? '→' : '←'} {RELATION_LABELS[rel.type] || rel.type}:
                      </span>
                      <strong style={{ marginLeft: '4px', color: '#fbbf24' }}>{targetFrame.label}</strong>
                    </div>
                  );
                })}
                {node.relations.length > 10 && (
                  <div style={{ opacity: 0.7, padding: '4px 8px', fontSize: '11px' }}>
                    + {node.relations.length - 10} more relations
                  </div>
                )}
              </div>
            </foreignObject>
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
 * Calculate dynamic heights for frame node sections
 */
export function calculateFrameNodeHeights(
  node: FrameGraphNode,
  rolesExpanded: boolean = true,
  verbsExpanded: boolean = false,
  relationsExpanded: boolean = true
) {
  const nodeWidth = 600;
  const contentWidth = nodeWidth - 24;
  
  const estimateTextHeight = (text: string, width: number, fontSize: number = 13, lineHeight: number = 1.3): number => {
    const avgCharWidth = fontSize * 0.6;
    const availableWidth = width - 24;
    const charsPerLine = Math.floor(availableWidth / avgCharWidth);
    const lines = Math.ceil(text.length / charsPerLine);
    return Math.max(1, lines) * fontSize * lineHeight;
  };

  let height = 20; // Top padding
  height += 35; // Title height
  
  const shortDefText = node.short_definition || '';
  const shortDefHeight = shortDefText ? Math.max(15, estimateTextHeight(shortDefText, contentWidth, 15, 1.3) + 4) : 0;
  height += shortDefHeight;

  const glossText = node.gloss || '';
  const glossHeight = glossText ? Math.max(30, estimateTextHeight(glossText, contentWidth, 14, 1.3) + 10) : 0;
  height += glossHeight + 8; // Margin for gloss

  // Roles section
  let rolesHeight = 20; // Header
  if (rolesExpanded && node.roles && node.roles.length > 0) {
    const visibleRoles = node.roles.slice(0, 10);
    visibleRoles.forEach(role => {
      const roleText = `${role.role_type_label}: ${role.description || 'No description'}`;
      const estimatedLines = Math.ceil(roleText.length / 60);
      rolesHeight += (estimatedLines <= 2 ? 40 : 55) + 4;
    });
    if (node.roles.length > 10) rolesHeight += 25; // "+ more" text
  }
  height += rolesHeight + 4;

  // Verbs section
  let verbsHeight = 0;
  const verbs = node.lexical_units?.filter(lu => lu.pos === 'verb') || [];
  if (verbs.length > 0) {
    verbsHeight = 20; // Header
    if (verbsExpanded) {
      const visibleVerbs = verbs.slice(0, 10);
      verbsHeight += visibleVerbs.length * 32 + 8;
      if (verbs.length > 10) verbsHeight += 25;
    }
    height += verbsHeight + 4;
  }

  // Relations section
  let relationsHeight = 0;
  if (node.relations && node.relations.length > 0) {
    relationsHeight = 20; // Header
    if (relationsExpanded) {
      const visibleRels = node.relations.slice(0, 10);
      relationsHeight += visibleRels.length * 32 + 8;
      if (node.relations.length > 10) relationsHeight += 25;
    }
    height += relationsHeight + 4;
  }

  height += 20; // Bottom padding
  
  return {
    totalHeight: height,
    shortDefHeight,
    glossHeight,
    rolesHeight,
    verbsHeight,
    relationsHeight
  };
}

export function calculateFrameMainNodeHeight(
  node: FrameGraphNode,
  rolesExpanded: boolean = true,
  verbsExpanded: boolean = false,
  relationsExpanded: boolean = true
): number {
  return calculateFrameNodeHeights(node, rolesExpanded, verbsExpanded, relationsExpanded).totalHeight;
}

