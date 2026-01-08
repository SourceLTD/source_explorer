'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { FrameGraphNode, FrameRelationType } from '@/lib/types';

// Color scheme
const currentFrameColor = '#8b5cf6';
const currentFrameStroke = '#6d28d9';
const parentFrameColor = '#10b981';
const parentFrameStroke = '#059669';
const childFrameColor = '#f59e0b';
const childFrameStroke = '#d97706';
const linkColor = '#e5e7eb';

interface FrameGraphProps {
  currentFrame: FrameGraphNode;
  onFrameClick: (frameId: string) => void;
  onEditClick?: () => void;
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
}

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

export default function FrameGraph({ currentFrame, onFrameClick, onEditClick }: FrameGraphProps) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [rolesExpanded, setRolesExpanded] = useState<boolean>(true);
  const [verbsExpanded, setVerbsExpanded] = useState<boolean>(false);
  const [relationsExpanded, setRelationsExpanded] = useState<boolean>(true);

  // Helper function to estimate text height
  const estimateTextHeight = useCallback((text: string, width: number, fontSize: number = 13, lineHeight: number = 1.3): number => {
    const avgCharWidth = fontSize * 0.6;
    const availableWidth = width - 24;
    const charsPerLine = Math.floor(availableWidth / avgCharWidth);
    const lines = Math.ceil(text.length / charsPerLine);
    return Math.max(1, lines) * fontSize * lineHeight;
  }, []);

  // Calculate the main frame node height
  const calculateMainNodeHeight = useCallback(() => {
    const nodeWidth = 600;
    const contentWidth = nodeWidth - 24;
    let height = 20; // Top padding
    height += 30; // Title height (frame name)
    
    // Short definition
    if (currentFrame.short_definition) {
      height += Math.max(25, estimateTextHeight(currentFrame.short_definition, contentWidth, 14) + 5);
    }
    
    // Definition/gloss
    if (currentFrame.gloss) {
      height += Math.max(40, estimateTextHeight(currentFrame.gloss, contentWidth, 13) + 10);
    }
    
    // Prototypical synset badge
    if (currentFrame.prototypical_synset) {
      height += 24;
    }
    
    // Roles section
    height += 24; // Roles header
    if (rolesExpanded && currentFrame.roles && currentFrame.roles.length > 0) {
      currentFrame.roles.forEach(role => {
        const roleText = `${role.role_type_label}: ${role.description || 'No description'}`;
        const estimatedLines = Math.ceil(roleText.length / 60);
        height += estimatedLines <= 2 ? 40 : 55;
      });
    }
    
    // Verbs section
    if (currentFrame.verbs && currentFrame.verbs.length > 0) {
      height += 24; // Verbs header
      if (verbsExpanded) {
        height += Math.min(currentFrame.verbs.length * 28, 150); // Cap at 150px
      }
    }
    
    // Relations section
    if (currentFrame.relations && currentFrame.relations.length > 0) {
      height += 24; // Relations header
      if (relationsExpanded) {
        height += Math.min(currentFrame.relations.length * 28, 150);
      }
    }
    
    height += 20; // Bottom padding
    return height;
  }, [currentFrame, rolesExpanded, verbsExpanded, relationsExpanded, estimateTextHeight]);

  // Layout calculation
  const layout = useMemo(() => {
    const mainNodeWidth = 600;
    const mainNodeHeight = calculateMainNodeHeight();
    const horizontalSpacing = 200;
    const verticalSpacing = 80;
    const relatedNodeWidth = 180;
    const relatedNodeHeight = 60;
    
    const nodes: PositionedFrameNode[] = [];
    
    // Current frame (center)
    const currentX = 400;
    const currentY = 50;
    nodes.push({
      id: currentFrame.id,
      type: 'current',
      label: currentFrame.frame_name,
      sublabel: currentFrame.short_definition,
      x: currentX,
      y: currentY,
      width: mainNodeWidth,
      height: mainNodeHeight,
    });
    
    // Related frames on the right
    let rightY = currentY;
    
    // Parent frames (inherits_from)
    const parentFrames = currentFrame.relations.filter(r => 
      r.direction === 'outgoing' && r.type === 'inherits_from' && r.target
    );
    parentFrames.forEach((rel, index) => {
      if (rel.target) {
        nodes.push({
          id: rel.target.id,
          type: 'parent',
          label: rel.target.frame_name,
          sublabel: rel.target.short_definition,
          x: currentX + mainNodeWidth / 2 + horizontalSpacing,
          y: rightY + index * (relatedNodeHeight + 20),
          width: relatedNodeWidth,
          height: relatedNodeHeight,
        });
      }
    });
    rightY += Math.max(parentFrames.length * (relatedNodeHeight + 20), 0);
    
    // Child frames (inherited_by - incoming inherits_from)
    const childFrames = currentFrame.relations.filter(r => 
      r.direction === 'incoming' && r.type === 'inherits_from' && r.source
    );
    if (childFrames.length > 0) {
      rightY += verticalSpacing;
    }
    childFrames.forEach((rel, index) => {
      if (rel.source) {
        nodes.push({
          id: rel.source.id,
          type: 'child',
          label: rel.source.frame_name,
          sublabel: rel.source.short_definition,
          x: currentX + mainNodeWidth / 2 + horizontalSpacing,
          y: rightY + index * (relatedNodeHeight + 20),
          width: relatedNodeWidth,
          height: relatedNodeHeight,
        });
      }
    });
    
    // Calculate total dimensions
    const allX = nodes.map(n => n.x + n.width);
    const allY = nodes.map(n => n.y + n.height);
    const width = Math.max(...allX) + 50;
    const height = Math.max(...allY) + 50;
    
    return { nodes, width, height };
  }, [currentFrame, calculateMainNodeHeight]);

  // Render the main frame node
  const renderMainNode = (node: PositionedFrameNode) => {
    const x = node.x - node.width / 2;
    let yOffset = 20;
    
    return (
      <g key={node.id}>
        {/* Background */}
        <rect
          x={x}
          y={node.y}
          width={node.width}
          height={node.height}
          rx={12}
          fill={currentFrameColor}
          stroke={currentFrameStroke}
          strokeWidth={2}
        />
        
        {/* Frame name */}
        <text
          x={x + 12}
          y={node.y + yOffset + 14}
          fontSize={18}
          fontWeight="bold"
          fill="white"
        >
          {currentFrame.frame_name}
        </text>
        {onEditClick && (
          <g
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onEditClick();
            }}
          >
            <rect
              x={x + node.width - 40}
              y={node.y + yOffset - 2}
              width={28}
              height={20}
              rx={4}
              fill="rgba(255,255,255,0.2)"
            />
            <text
              x={x + node.width - 26}
              y={node.y + yOffset + 11}
              fontSize={12}
              fill="white"
              textAnchor="middle"
            >
              ✏️
            </text>
          </g>
        )}
        yOffset += 30;
        
        {/* Short definition */}
        {currentFrame.short_definition && (
          <>
            <text
              x={x + 12}
              y={node.y + yOffset + 12}
              fontSize={14}
              fill="rgba(255,255,255,0.9)"
            >
              {currentFrame.short_definition.length > 70 
                ? currentFrame.short_definition.substring(0, 70) + '...'
                : currentFrame.short_definition}
            </text>
            {(() => { yOffset += 25; return null; })()}
          </>
        )}
        
        {/* Prototypical synset badge */}
        {currentFrame.prototypical_synset && (
          <>
            <rect
              x={x + 12}
              y={node.y + yOffset}
              width={Math.min(currentFrame.prototypical_synset.length * 7 + 16, node.width - 24)}
              height={20}
              rx={4}
              fill="rgba(255,255,255,0.2)"
            />
            <text
              x={x + 20}
              y={node.y + yOffset + 14}
              fontSize={11}
              fill="white"
            >
              📌 {currentFrame.prototypical_synset}
            </text>
            {(() => { yOffset += 28; return null; })()}
          </>
        )}
        
        {/* Definition */}
        {currentFrame.gloss && (
          <>
            <foreignObject
              x={x + 12}
              y={node.y + yOffset}
              width={node.width - 24}
              height={80}
            >
              <div 
                style={{
                  fontSize: '13px',
                  color: 'rgba(255,255,255,0.85)',
                  lineHeight: '1.4',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: 'vertical' as const,
                }}
              >
                {currentFrame.gloss}
              </div>
            </foreignObject>
            {(() => { yOffset += 85; return null; })()}
          </>
        )}
        
        {/* Roles section */}
        <g
          className="cursor-pointer"
          onClick={() => setRolesExpanded(!rolesExpanded)}
        >
          <rect
            x={x + 12}
            y={node.y + yOffset}
            width={node.width - 24}
            height={20}
            rx={4}
            fill="rgba(255,255,255,0.15)"
          />
          <text
            x={x + 20}
            y={node.y + yOffset + 14}
            fontSize={12}
            fontWeight="600"
            fill="white"
          >
            {rolesExpanded ? '▼' : '▶'} Roles ({currentFrame.roles?.length || 0})
          </text>
        </g>
        {(() => { yOffset += 24; return null; })()}
        
        {rolesExpanded && currentFrame.roles && currentFrame.roles.length > 0 && (
          <foreignObject
            x={x + 12}
            y={node.y + yOffset}
            width={node.width - 24}
            height={Math.min(currentFrame.roles.length * 45, 200)}
          >
            <div style={{ fontSize: '12px', color: 'white' }}>
              {currentFrame.roles.slice(0, 5).map((role, idx) => (
                <div 
                  key={role.id} 
                  style={{ 
                    padding: '4px 8px', 
                    background: role.main ? 'rgba(59, 130, 246, 0.4)' : 'rgba(255,255,255,0.1)',
                    borderRadius: '4px',
                    marginBottom: '4px',
                  }}
                >
                  <strong>{role.role_type_label}</strong>
                  {role.description && (
                    <span style={{ opacity: 0.8 }}>: {role.description.substring(0, 50)}{role.description.length > 50 ? '...' : ''}</span>
                  )}
                </div>
              ))}
              {currentFrame.roles.length > 5 && (
                <div style={{ opacity: 0.7, padding: '4px' }}>
                  +{currentFrame.roles.length - 5} more roles
                </div>
              )}
            </div>
          </foreignObject>
        )}
        {(() => { 
          if (rolesExpanded && currentFrame.roles) {
            yOffset += Math.min(currentFrame.roles.slice(0, 5).length * 36 + 10, 190);
          }
          return null; 
        })()}
        
        {/* Verbs section */}
        {currentFrame.verbs && currentFrame.verbs.length > 0 && (
          <>
            <g
              className="cursor-pointer"
              onClick={() => setVerbsExpanded(!verbsExpanded)}
            >
              <rect
                x={x + 12}
                y={node.y + yOffset}
                width={node.width - 24}
                height={20}
                rx={4}
                fill="rgba(255,255,255,0.15)"
              />
              <text
                x={x + 20}
                y={node.y + yOffset + 14}
                fontSize={12}
                fontWeight="600"
                fill="white"
              >
                {verbsExpanded ? '▼' : '▶'} Verbs ({currentFrame.verbs.length})
              </text>
            </g>
            {(() => { yOffset += 24; return null; })()}
            
            {verbsExpanded && (
              <foreignObject
                x={x + 12}
                y={node.y + yOffset}
                width={node.width - 24}
                height={Math.min(currentFrame.verbs.length * 28, 150)}
              >
                <div style={{ fontSize: '12px', color: 'white' }}>
                  {currentFrame.verbs.slice(0, 5).map((verb) => (
                    <div 
                      key={verb.id} 
                      style={{ 
                        padding: '4px 8px', 
                        background: 'rgba(59, 130, 246, 0.3)',
                        borderRadius: '4px',
                        marginBottom: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      <strong>{verb.code || verb.id}</strong>
                      <span style={{ opacity: 0.8, marginLeft: '8px' }}>
                        {verb.lemmas?.slice(0, 3).join(', ')}
                      </span>
                    </div>
                  ))}
                  {currentFrame.verbs.length > 5 && (
                    <div style={{ opacity: 0.7, padding: '4px' }}>
                      +{currentFrame.verbs.length - 5} more verbs
                    </div>
                  )}
                </div>
              </foreignObject>
            )}
          </>
        )}
        
        {/* Relations section */}
        {currentFrame.relations && currentFrame.relations.length > 0 && (
          <>
            {(() => { 
              if (verbsExpanded && currentFrame.verbs) {
                yOffset += Math.min(currentFrame.verbs.slice(0, 5).length * 28 + 10, 140);
              }
              return null; 
            })()}
            <g
              className="cursor-pointer"
              onClick={() => setRelationsExpanded(!relationsExpanded)}
            >
              <rect
                x={x + 12}
                y={node.y + yOffset}
                width={node.width - 24}
                height={20}
                rx={4}
                fill="rgba(255,255,255,0.15)"
              />
              <text
                x={x + 20}
                y={node.y + yOffset + 14}
                fontSize={12}
                fontWeight="600"
                fill="white"
              >
                {relationsExpanded ? '▼' : '▶'} Relations ({currentFrame.relations.length})
              </text>
            </g>
            {(() => { yOffset += 24; return null; })()}
            
            {relationsExpanded && (
              <foreignObject
                x={x + 12}
                y={node.y + yOffset}
                width={node.width - 24}
                height={Math.min(currentFrame.relations.length * 28, 150)}
              >
                <div style={{ fontSize: '12px', color: 'white' }}>
                  {currentFrame.relations.slice(0, 5).map((rel, relIdx) => {
                    const targetFrame = rel.direction === 'outgoing' ? rel.target : rel.source;
                    if (!targetFrame) return null;
                    return (
                      <div 
                        key={relIdx} 
                        style={{ 
                          padding: '4px 8px', 
                          background: 'rgba(255,255,255,0.1)',
                          borderRadius: '4px',
                          marginBottom: '4px',
                          cursor: 'pointer',
                        }}
                        onClick={() => onFrameClick(targetFrame.id)}
                      >
                        <span style={{ opacity: 0.7 }}>
                          {rel.direction === 'outgoing' ? '→' : '←'} {RELATION_LABELS[rel.type] || rel.type}:
                        </span>
                        <strong style={{ marginLeft: '4px' }}>{targetFrame.frame_name}</strong>
                      </div>
                    );
                  })}
                  {currentFrame.relations.length > 5 && (
                    <div style={{ opacity: 0.7, padding: '4px' }}>
                      +{currentFrame.relations.length - 5} more relations
                    </div>
                  )}
                </div>
              </foreignObject>
            )}
          </>
        )}
      </g>
    );
  };

  // Render related frame nodes
  const renderRelatedNode = (node: PositionedFrameNode) => {
    const isHovered = hoveredNodeId === node.id;
    const fillColor = node.type === 'parent' ? parentFrameColor : childFrameColor;
    const strokeColor = node.type === 'parent' ? parentFrameStroke : childFrameStroke;
    
    return (
      <g 
        key={node.id}
        className="cursor-pointer"
        onMouseEnter={() => setHoveredNodeId(node.id)}
        onMouseLeave={() => setHoveredNodeId(null)}
        onClick={() => onFrameClick(node.id)}
      >
        <rect
          x={node.x}
          y={node.y}
          width={node.width}
          height={node.height}
          rx={8}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={isHovered ? 3 : 2}
          style={{ 
            filter: isHovered ? 'brightness(1.1)' : 'none',
            transition: 'all 0.2s ease',
          }}
        />
        <text
          x={node.x + node.width / 2}
          y={node.y + 22}
          fontSize={12}
          fontWeight="bold"
          fill="white"
          textAnchor="middle"
        >
          {node.label.length > 20 ? node.label.substring(0, 18) + '...' : node.label}
        </text>
        {node.sublabel && (
          <text
            x={node.x + node.width / 2}
            y={node.y + 40}
            fontSize={10}
            fill="rgba(255,255,255,0.8)"
            textAnchor="middle"
          >
            {node.sublabel.length > 25 ? node.sublabel.substring(0, 23) + '...' : node.sublabel}
          </text>
        )}
      </g>
    );
  };

  // Render connection lines
  const renderConnections = () => {
    const mainNode = layout.nodes.find(n => n.type === 'current');
    if (!mainNode) return null;
    
    return layout.nodes
      .filter(n => n.type !== 'current')
      .map(node => {
        const startX = mainNode.x + mainNode.width / 2;
        const startY = mainNode.y + mainNode.height / 2;
        const endX = node.x;
        const endY = node.y + node.height / 2;
        
        // Create a curved path
        const midX = (startX + endX) / 2;
        const path = `M ${startX} ${startY} Q ${midX} ${startY} ${midX} ${(startY + endY) / 2} T ${endX} ${endY}`;
        
        return (
          <path
            key={`line-${node.id}`}
            d={path}
            stroke={linkColor}
            strokeWidth={2}
            fill="none"
            opacity={0.6}
          />
        );
      });
  };

  return (
    <div className="w-full h-full overflow-auto bg-white rounded-xl shadow-lg">
      <svg 
        width={Math.max(layout.width, 800)} 
        height={Math.max(layout.height, 600)}
        className="block"
      >
        {/* Connections */}
        {renderConnections()}
        
        {/* Related nodes first (behind main node) */}
        {layout.nodes
          .filter(n => n.type !== 'current')
          .map(node => renderRelatedNode(node))}
        
        {/* Main node */}
        {layout.nodes
          .filter(n => n.type === 'current')
          .map(node => renderMainNode(node))}
      </svg>
    </div>
  );
}

