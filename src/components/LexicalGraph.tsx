'use client';

import React, { useMemo } from 'react';
import { Group } from '@visx/group';
import { LinearGradient } from '@visx/gradient';
import { GraphNode } from '@/lib/types';

// Color scheme
const currentNodeColor = '#3b82f6';
const currentNodeStroke = '#1e40af';
const parentNodeColor = '#10b981';
const parentNodeStroke = '#059669';
const childNodeColor = '#f59e0b';
const childNodeStroke = '#d97706';
const linkColor = '#e5e7eb';
const backgroundColor = '#ffffff';

interface LexicalGraphProps {
  currentNode: GraphNode;
  onNodeClick: (nodeId: string) => void;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

interface PositionedNode {
  node: GraphNode;
  nodeType: 'current' | 'parent' | 'child';
  x: number;
  y: number;
}

interface LayoutResult {
  nodes: PositionedNode[];
  width: number;
  height: number;
}

export default function LexicalGraph({ currentNode, onNodeClick }: LexicalGraphProps) {

  const positionedNodes = useMemo((): LayoutResult => {
    const nodes: PositionedNode[] = [];
    
    // Fixed width, but calculate height based on content
    const width = 800;
    const centerX = width / 2;
    
    // Calculate required height based on number of nodes
    const closedNodeHeight = 30; // Much smaller for closed nodes
    const currentNodeHeight = 120; // Taller for full information display
    const rowSpacing = 50; // Reduced spacing for closed nodes
    const margin = 50;
    const spacingFromCenter = 80;
    
    const parentRows = Math.ceil(currentNode.parents.length / 5); // More nodes per row
    const childRows = Math.ceil(currentNode.children.length / 5);
    
    const spaceNeededAbove = parentRows > 0 ? 
      parentRows * closedNodeHeight + (parentRows - 1) * rowSpacing + spacingFromCenter : 
      spacingFromCenter;
    
    const spaceNeededBelow = childRows > 0 ? 
      childRows * closedNodeHeight + (childRows - 1) * rowSpacing + spacingFromCenter : 
      spacingFromCenter;
    
    const totalHeight = margin + spaceNeededAbove + currentNodeHeight + spaceNeededBelow + margin;
    const height = Math.max(600, totalHeight); // Minimum 600px, but expand as needed
    const centerY = margin + spaceNeededAbove + currentNodeHeight / 2;
    
    // Add current node at center
    nodes.push({
      node: currentNode,
      nodeType: 'current',
      x: centerX,
      y: centerY
    });
    
    const closedNodeSpacing = 90; // Closer spacing for smaller closed nodes
    
    // Use data directly - parents should be hypernyms (above), children should be hyponyms (below)
    const hypernymsToShow = currentNode.parents; // Should be broader concepts - GREEN ABOVE
    const hyponymsToShow = currentNode.children;  // Should be specific concepts - ORANGE BELOW
    
    // Position hypernyms ABOVE (green) - no compression needed since height is dynamic
    if (hypernymsToShow.length > 0) {
      const hypernymStartY = margin + closedNodeHeight / 2;
      
      hypernymsToShow.forEach((hypernym, index) => {
        const row = Math.floor(index / 5); // 5 nodes per row
        const col = index % 5;
        const rowWidth = Math.min(hypernymsToShow.length - row * 5, 5) * closedNodeSpacing;
        const startX = centerX - (rowWidth - closedNodeSpacing) / 2;
        
        const nodeY = hypernymStartY + (row * (closedNodeHeight + rowSpacing));
        
        nodes.push({
          node: hypernym,
          nodeType: 'parent', // GREEN - broader concepts ABOVE
          x: startX + col * closedNodeSpacing,
          y: nodeY
        });
      });
    }
    
    // Position hyponyms BELOW (orange) - no compression needed since height is dynamic
    if (hyponymsToShow.length > 0) {
      const hyponymStartY = centerY + currentNodeHeight / 2 + spacingFromCenter + closedNodeHeight / 2;
      
      hyponymsToShow.forEach((hyponym, index) => {
        const row = Math.floor(index / 5); // 5 nodes per row
        const col = index % 5;
        const rowWidth = Math.min(hyponymsToShow.length - row * 5, 5) * closedNodeSpacing;
        const startX = centerX - (rowWidth - closedNodeSpacing) / 2;
        
        const nodeY = hyponymStartY + (row * (closedNodeHeight + rowSpacing));
        
        nodes.push({
          node: hyponym,
          nodeType: 'child', // ORANGE - specific concepts BELOW
          x: startX + col * closedNodeSpacing,
          y: nodeY
        });
      });
    }
    
    return { nodes, width, height };
  }, [currentNode]);

  // Create links between nodes
  const links = useMemo(() => {
    const linkList: { from: PositionedNode; to: PositionedNode }[] = [];
    const currentNodePos = positionedNodes.nodes.find(n => n.nodeType === 'current')!;

    // Links from hypernyms (displayed as green "parent" nodes above) to current node
    // These connect downward from broader concepts to the selected node
    positionedNodes.nodes.filter(n => n.nodeType === 'parent').forEach(hypernym => {
      linkList.push({ from: hypernym, to: currentNodePos });
    });

    // Links from current node to hyponyms (displayed as orange "child" nodes below)
    // These connect downward from selected node to more specific concepts
    positionedNodes.nodes.filter(n => n.nodeType === 'child').forEach(hyponym => {
      linkList.push({ from: currentNodePos, to: hyponym });
    });

    return linkList;
  }, [positionedNodes]);
  
  // Get dynamic dimensions
  const { width, height } = positionedNodes;

  return (
    <div className="w-full h-full flex items-start justify-center pt-4 bg-white rounded-lg shadow-sm border">
      <svg width={width} height={height}>
        <LinearGradient id="link-gradient" from={linkColor} to={linkColor} />
        <rect width={width} height={height} rx={14} fill={backgroundColor} />
        <Group>
          {/* Render links */}
          {links.map((link, i) => (
            <line
              key={`link-${i}`}
              x1={link.from.x}
              y1={link.from.y}
              x2={link.to.x}
              y2={link.to.y}
              stroke={linkColor}
              strokeWidth="2"
              strokeOpacity={0.6}
            />
          ))}
          
          {/* Render nodes */}
          {positionedNodes.nodes.map((posNode, i) => {
            if (posNode.nodeType === 'current') {
              // Current node - show full information like the first image
              const nodeWidth = 280;
              const nodeHeight = 120;
              const centerX = -nodeWidth / 2;
              const centerY = -nodeHeight / 2;
              
              return (
                <Group key={`node-${i}`} top={posNode.y} left={posNode.x}>
                  <rect
                    width={nodeWidth}
                    height={nodeHeight}
                    y={centerY}
                    x={centerX}
                    fill={currentNodeColor}
                    stroke={currentNodeStroke}
                    strokeWidth={3}
                    rx={8}
                    ry={8}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onNodeClick(posNode.node.id)}
                  />
                  {/* Node title/lemma */}
                  <text
                    dy=".33em"
                    fontSize={16}
                    fontFamily="Arial"
                    fontWeight="bold"
                    textAnchor="middle"
                    style={{ pointerEvents: 'none' }}
                    fill="white"
                  >
                    <tspan x={0} dy="-2.2em">{posNode.node.lemmas[0] || posNode.node.id}</tspan>
                    <tspan x={0} dy="0.2em" fontSize={12} fontWeight="normal">
                      ({posNode.node.id})
                    </tspan>
                  </text>
                  {/* Definition/gloss */}
                  <text
                    dy=".33em"
                    fontSize={10}
                    fontFamily="Arial"
                    fontWeight="normal"
                    textAnchor="middle"
                    style={{ pointerEvents: 'none' }}
                    fill="white"
                    fontStyle="italic"
                  >
                    <tspan x={0} dy="1.2em">{truncateText(posNode.node.gloss, 50)}</tspan>
                  </text>
                  {/* Part of Speech */}
                  <text
                    dy=".33em"
                    fontSize={11}
                    fontFamily="Arial"
                    fontWeight="600"
                    textAnchor="middle"
                    style={{ pointerEvents: 'none' }}
                    fill="white"
                  >
                    <tspan x={0} dy="2.2em">Part of Speech: {posNode.node.pos}</tspan>
                  </text>
                  {/* Lemmas */}
                  <text
                    dy=".33em"
                    fontSize={10}
                    fontFamily="Arial"
                    fontWeight="500"
                    textAnchor="middle"
                    style={{ pointerEvents: 'none' }}
                    fill="white"
                  >
                    <tspan x={0} dy="3.0em">
                      Lemmas: {posNode.node.lemmas.slice(0, 3).join('; ')}
                      {posNode.node.lemmas.length > 3 ? '...' : ''}
                    </tspan>
                  </text>
                </Group>
              );
            } else {
              // Closed nodes - show only ID like the second image
              const nodeWidth = 60;
              const nodeHeight = 30;
              const centerX = -nodeWidth / 2;
              const centerY = -nodeHeight / 2;
              
              const isParent = posNode.nodeType === 'parent';
              const fillColor = isParent ? parentNodeColor : childNodeColor;
              const strokeColor = isParent ? parentNodeStroke : childNodeStroke;
              
              return (
                <Group key={`node-${i}`} top={posNode.y} left={posNode.x}>
                  <rect
                    width={nodeWidth}
                    height={nodeHeight}
                    y={centerY}
                    x={centerX}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={1}
                    rx={4}
                    ry={4}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onNodeClick(posNode.node.id)}
                  />
                  <text
                    dy=".33em"
                    fontSize={9}
                    fontFamily="Arial"
                    fontWeight="500"
                    textAnchor="middle"
                    style={{ pointerEvents: 'none' }}
                    fill="white"
                  >
                    {posNode.node.id}
                  </text>
                </Group>
              );
            }
          })}
        </Group>
      </svg>
    </div>
  );
}
