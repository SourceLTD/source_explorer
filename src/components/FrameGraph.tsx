'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { FrameGraphNode, FrameRelationType } from '@/lib/types';
import FrameMainNode, { calculateFrameMainNodeHeight } from './FrameMainNode';

// Color scheme
const currentNodeColor = '#3b82f6';
const currentNodeStroke = '#1e40af';
const parentFrameColor = '#10b981';
const parentFrameStroke = '#059669';
const childFrameColor = '#f59e0b';
const childFrameStroke = '#d97706';
const linkColor = '#e5e7eb';
const backgroundColor = '#ffffff';

interface FrameGraphProps {
  currentFrame: FrameGraphNode;
  onFrameClick: (frameId: string) => void;
  onVerbClick?: (verbId: string) => void;
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

export default function FrameGraph({ currentFrame, onFrameClick, onVerbClick, onEditClick }: FrameGraphProps) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [rolesExpanded, setRolesExpanded] = useState<boolean>(true);
  const [verbsExpanded, setVerbsExpanded] = useState<boolean>(false);
  const [relationsExpanded, setRelationsExpanded] = useState<boolean>(true);

  // Helper function to calculate node width based on text length
  const calculateNodeWidth = useCallback((text: string, minWidth: number = 80, maxWidth: number = 200): number => {
    const charWidth = 7.5;
    const padding = 24;
    const calculatedWidth = text.length * charWidth + padding;
    return Math.max(minWidth, Math.min(maxWidth, calculatedWidth));
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

  // Layout calculation
  const layout = useMemo(() => {
    const width = 1000;
    const centerX = width / 2;
    const maxRowWidth = width - 100;
    const nodeSpacing = 20;
    const rowSpacing = 60;
    const spacingFromCenter = 100;
    const margin = 60;
    const relatedNodeHeight = 50;

    const mainNodeWidth = 600;
    const mainNodeHeight = calculateFrameMainNodeHeight(currentFrame, rolesExpanded, verbsExpanded, relationsExpanded);
    
    const nodes: PositionedFrameNode[] = [];
    
    // Filter hierarchical relations
    const parentRels = currentFrame.relations.filter(r => 
      r.direction === 'outgoing' && r.type === 'inherits_from' && r.target
    );
    const childRels = currentFrame.relations.filter(r => 
      r.direction === 'incoming' && r.type === 'inherits_from' && r.source
    );

    // Arrange rows
    const parentRows = arrangeNodesInRows(parentRels, maxRowWidth, nodeSpacing);
    const childRows = arrangeNodesInRows(childRels, maxRowWidth, nodeSpacing);

    // Calculate vertical space
    const spaceAbove = parentRows.length > 0 ? 
      parentRows.length * relatedNodeHeight + (parentRows.length - 1) * rowSpacing + spacingFromCenter : 
      spacingFromCenter;
    
    const spaceBelow = childRows.length > 0 ? 
      childRows.length * relatedNodeHeight + (childRows.length - 1) * rowSpacing + spacingFromCenter : 
      spacingFromCenter;

    const totalHeight = margin + spaceAbove + mainNodeHeight + spaceBelow + margin;
    const centerY = margin + spaceAbove + mainNodeHeight / 2;
    
    // Add current frame at center
    nodes.push({
      id: currentFrame.id,
      type: 'current',
      label: currentFrame.label,
      sublabel: currentFrame.short_definition,
      x: centerX,
      y: centerY,
      width: mainNodeWidth,
      height: mainNodeHeight,
    });
    
    // Position parents ABOVE
    if (parentRows.length > 0) {
      const parentStartY = margin + relatedNodeHeight / 2;
      parentRows.forEach((row, rowIndex) => {
        const rowY = parentStartY + (rowIndex * (relatedNodeHeight + rowSpacing));
        let currentX = centerX - row.totalWidth / 2;
        
        row.nodes.forEach((rel) => {
          const target = rel.target!;
          const nodeWidth = calculateNodeWidth(target.label);
          nodes.push({
            id: target.id,
            type: 'parent',
            label: target.label,
            sublabel: target.short_definition,
            x: currentX + nodeWidth / 2,
            y: rowY,
            width: nodeWidth,
            height: relatedNodeHeight,
          });
          currentX += nodeWidth + nodeSpacing;
        });
      });
    }

    // Position children BELOW
    if (childRows.length > 0) {
      const childStartY = centerY + mainNodeHeight / 2 + spacingFromCenter + relatedNodeHeight / 2;
      childRows.forEach((row, rowIndex) => {
        const rowY = childStartY + (rowIndex * (relatedNodeHeight + rowSpacing));
        let currentX = centerX - row.totalWidth / 2;
        
        row.nodes.forEach((rel) => {
          const source = rel.source!;
          const nodeWidth = calculateNodeWidth(source.label);
          nodes.push({
            id: source.id,
            type: 'child',
            label: source.label,
            sublabel: source.short_definition,
            x: currentX + nodeWidth / 2,
            y: rowY,
            width: nodeWidth,
            height: relatedNodeHeight,
          });
          currentX += nodeWidth + nodeSpacing;
        });
      });
    }
    
    return { nodes, width, height: totalHeight };
  }, [currentFrame, rolesExpanded, verbsExpanded, relationsExpanded, arrangeNodesInRows, calculateNodeWidth]);

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
          x={node.x - node.width / 2}
          y={node.y - node.height / 2}
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
          x={node.x}
          y={node.y - 4}
          fontSize={11}
          fontWeight="bold"
          fill="white"
          textAnchor="middle"
        >
          {node.label.length > 25 ? node.label.substring(0, 23) + '...' : node.label}
        </text>
        {node.sublabel && (
          <text
            x={node.x}
            y={node.y + 12}
            fontSize={9}
            fill="rgba(255,255,255,0.8)"
            textAnchor="middle"
          >
            {node.sublabel.length > 30 ? node.sublabel.substring(0, 28) + '...' : node.sublabel}
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
        const isParent = node.type === 'parent';
        const startX = node.x;
        const startY = node.y;
        const endX = mainNode.x;
        const endY = mainNode.y;
        
        return (
          <line
            key={`line-${node.id}`}
            x1={startX}
            y1={startY}
            x2={endX}
            y2={endY}
            stroke={linkColor}
            strokeWidth={2}
            strokeOpacity={0.6}
          />
        );
      });
  };

  return (
    <div className="w-full h-full overflow-auto bg-white rounded-xl flex items-start justify-center pt-4">
      <svg 
        width={layout.width} 
        height={layout.height}
        className="block flex-shrink-0"
      >
        <rect width={layout.width} height={layout.height} rx={14} fill={backgroundColor} stroke="none" />
        
        {/* Connections */}
        {renderConnections()}
        
        {/* Related nodes first (behind main node) */}
        {layout.nodes
          .filter(n => n.type !== 'current')
          .map(node => renderRelatedNode(node))}
        
        {/* Main node */}
        {layout.nodes
          .filter(n => n.type === 'current')
          .map(node => (
            <FrameMainNode
              key={node.id}
              node={currentFrame}
              x={node.x}
              y={node.y}
              onNodeClick={onFrameClick}
              onFrameClick={onFrameClick}
              onVerbClick={onVerbClick || (() => {})}
              onEditClick={onEditClick}
              controlledRolesExpanded={rolesExpanded}
              controlledVerbsExpanded={verbsExpanded}
              controlledRelationsExpanded={relationsExpanded}
              onRolesExpandedChange={setRolesExpanded}
              onVerbsExpandedChange={setVerbsExpanded}
              onRelationsExpandedChange={setRelationsExpanded}
            />
          ))}
      </svg>
    </div>
  );
}

