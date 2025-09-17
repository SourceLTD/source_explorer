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

  // Helper function to calculate node width based on text length
  const calculateNodeWidth = (text: string, minWidth: number = 60, maxWidth: number = 150): number => {
    // Approximate character width in pixels (11px font size)
    const charWidth = 7;
    const padding = 16; // 8px padding on each side
    const calculatedWidth = text.length * charWidth + padding;
    return Math.max(minWidth, Math.min(maxWidth, calculatedWidth));
  };

  // Helper function to arrange nodes in rows with width constraints
  const arrangeNodesInRows = (nodeList: GraphNode[], maxRowWidth: number, nodeSpacing: number) => {
    const rows: { nodes: GraphNode[]; totalWidth: number }[] = [];
    let currentRow: GraphNode[] = [];
    let currentRowWidth = 0;

    for (const node of nodeList) {
      const nodeWidth = calculateNodeWidth(node.id);
      const widthWithSpacing = currentRow.length > 0 ? nodeWidth + nodeSpacing : nodeWidth;
      
      if (currentRow.length > 0 && currentRowWidth + widthWithSpacing > maxRowWidth) {
        // Start a new row
        rows.push({ nodes: currentRow, totalWidth: currentRowWidth });
        currentRow = [node];
        currentRowWidth = nodeWidth;
      } else {
        // Add to current row
        currentRow.push(node);
        currentRowWidth += widthWithSpacing;
      }
    }
    
    if (currentRow.length > 0) {
      rows.push({ nodes: currentRow, totalWidth: currentRowWidth });
    }
    
    return rows;
  };

  const positionedNodes = useMemo((): LayoutResult => {
    const nodes: PositionedNode[] = [];
    
    // Fixed width, but calculate height based on content
    const width = 800;
    const centerX = width / 2;
    const maxRowWidth = width - 100; // Leave some margin
    const nodeSpacing = 15; // Constant spacing between nodes
    
    // Calculate required height based on number of nodes
    const closedNodeHeight = 45; // Bigger closed nodes
    
    // Calculate dynamic height for current node based on content
    const calculateCurrentNodeHeight = (node: GraphNode): number => {
      let height = 20; // Top padding
      height += 25; // Title height
      height += 45; // Definition section height
      height += 35; // Lemmas section height
      
      if (node.examples && node.examples.length > 0) {
        height += 35; // Examples section height
      }
      
      if (node.causes && node.causes.length > 0) {
        height += 30; // Causes section height
      }
      
      if (node.entails && node.entails.length > 0) {
        height += 30; // Entails section height
      }
      
      if (node.alsoSee && node.alsoSee.length > 0) {
        height += 30; // AlsoSee section height
      }
      
      height += 20; // Bottom padding
      return height;
    };
    
    const currentNodeHeight = calculateCurrentNodeHeight(currentNode);
    const rowSpacing = 50; // Reduced spacing for closed nodes
    const margin = 50;
    const spacingFromCenter = 80;
    
    // Use data directly - parents should be hypernyms (above), children should be hyponyms (below)
    const hypernymsToShow = currentNode.parents; // Should be broader concepts - GREEN ABOVE
    const hyponymsToShow = currentNode.children;  // Should be specific concepts - ORANGE BELOW
    
    // Arrange nodes in rows with width constraints
    const parentRows = arrangeNodesInRows(hypernymsToShow, maxRowWidth, nodeSpacing);
    const childRows = arrangeNodesInRows(hyponymsToShow, maxRowWidth, nodeSpacing);
    
    const spaceNeededAbove = parentRows.length > 0 ? 
      parentRows.length * closedNodeHeight + (parentRows.length - 1) * rowSpacing + spacingFromCenter : 
      spacingFromCenter;
    
    const spaceNeededBelow = childRows.length > 0 ? 
      childRows.length * closedNodeHeight + (childRows.length - 1) * rowSpacing + spacingFromCenter : 
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
    
    // Position hypernyms ABOVE (green) - using dynamic row layout
    if (parentRows.length > 0) {
      const hypernymStartY = margin + closedNodeHeight / 2;
      
      parentRows.forEach((row, rowIndex) => {
        const rowY = hypernymStartY + (rowIndex * (closedNodeHeight + rowSpacing));
        const startX = centerX - row.totalWidth / 2;
        
        let currentX = startX;
        row.nodes.forEach((hypernym) => {
          const nodeWidth = calculateNodeWidth(hypernym.id);
          
          nodes.push({
            node: hypernym,
            nodeType: 'parent', // GREEN - broader concepts ABOVE
            x: currentX + nodeWidth / 2,
            y: rowY
          });
          
          currentX += nodeWidth + nodeSpacing;
        });
      });
    }
    
    // Position hyponyms BELOW (orange) - using dynamic row layout
    if (childRows.length > 0) {
      const hyponymStartY = centerY + currentNodeHeight / 2 + spacingFromCenter + closedNodeHeight / 2;
      
      childRows.forEach((row, rowIndex) => {
        const rowY = hyponymStartY + (rowIndex * (closedNodeHeight + rowSpacing));
        const startX = centerX - row.totalWidth / 2;
        
        let currentX = startX;
        row.nodes.forEach((hyponym) => {
          const nodeWidth = calculateNodeWidth(hyponym.id);
          
          nodes.push({
            node: hyponym,
            nodeType: 'child', // ORANGE - specific concepts BELOW
            x: currentX + nodeWidth / 2,
            y: rowY
          });
          
          currentX += nodeWidth + nodeSpacing;
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
    <div className="w-full h-full flex items-start justify-center pt-4">
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
              // Current node - show full information with dynamic height
              const nodeWidth = 340;
              
              // Calculate dynamic height based on content
              let currentY = 20; // Top padding
              
              // Title section (lemma + ID)
              currentY += 25; // Title height
              
              // Definition/gloss section
              currentY += 45; // Definition section height (increased for larger font)
              
              // Lemmas section
              currentY += 35; // Lemmas section height
              
              // Examples section (only if examples exist)
              let examplesHeight = 0;
              if (posNode.node.examples && posNode.node.examples.length > 0) {
                examplesHeight = 35;
                currentY += examplesHeight;
              }
              
              // Relationship sections (only if they exist)
              let causesHeight = 0;
              if (posNode.node.causes && posNode.node.causes.length > 0) {
                causesHeight = 30;
                currentY += causesHeight;
              }
              
              let entailsHeight = 0;
              if (posNode.node.entails && posNode.node.entails.length > 0) {
                entailsHeight = 30;
                currentY += entailsHeight;
              }
              
              let alsoSeeHeight = 0;
              if (posNode.node.alsoSee && posNode.node.alsoSee.length > 0) {
                alsoSeeHeight = 30;
                currentY += alsoSeeHeight;
              }
              
              currentY += 20; // Bottom padding
              
              const nodeHeight = currentY;
              const centerX = -nodeWidth / 2;
              const centerY = -nodeHeight / 2;
              
              // Calculate Y positions for each section
              let sectionY = centerY + 130; // Start after examples base position
              if (posNode.node.examples && posNode.node.examples.length > 0) {
                sectionY += 35; // Add examples height if they exist
              }
              
              const causesY = sectionY;
              if (posNode.node.causes && posNode.node.causes.length > 0) {
                sectionY += 30;
              }
              
              const entailsY = sectionY;
              if (posNode.node.entails && posNode.node.entails.length > 0) {
                sectionY += 30;
              }
              
              const alsoSeeY = sectionY;
              
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
                  {/* Node title/lemma with ID */}
                  <text
                    x={centerX + 12}
                    y={centerY + 35}
                    fontSize={20}
                    fontFamily="Arial"
                    textAnchor="start"
                    style={{ pointerEvents: 'none' }}
                    fill="white"
                  >
                    <tspan fontWeight="bold">{posNode.node.lemmas[0] || posNode.node.id}</tspan>
                    <tspan fontWeight="normal" fontSize={14}> ({posNode.node.id})</tspan>
                  </text>
                  {/* Definition/gloss with text wrapping */}
                  <foreignObject
                    x={centerX + 12}
                    y={centerY + 50}
                    width={nodeWidth - 24}
                    height={40}
                  >
                    <div
                      style={{
                        fontSize: '14px',
                        fontFamily: 'Arial',
                        fontWeight: 'normal',
                        color: 'white',
                        fontStyle: 'italic',
                        lineHeight: '1.3',
                        wordWrap: 'break-word',
                        overflow: 'hidden'
                      }}
                    >
                      {posNode.node.gloss}
                    </div>
                  </foreignObject>
                  {/* Lemmas with text wrapping */}
                  <foreignObject
                    x={centerX + 12}
                    y={centerY + 95}
                    width={nodeWidth - 24}
                    height={30}
                  >
                      <div
                      style={{
                        fontSize: '13px',
                        fontFamily: 'Arial',
                        color: 'white',
                        lineHeight: '1.3',
                        wordWrap: 'break-word',
                        overflow: 'hidden'
                      }}
                    >
                      <span style={{ fontWeight: 'bold' }}>Lemmas:</span> <span style={{ fontWeight: '500' }}>{posNode.node.lemmas.join('; ')}</span>
                    </div>
                  </foreignObject>
                  {/* Examples - only show if examples exist */}
                  {posNode.node.examples && posNode.node.examples.length > 0 && (
                    <foreignObject
                      x={centerX + 12}
                      y={centerY + 130}
                      width={nodeWidth - 24}
                      height={30}
                    >
                      <div
                        style={{
                          fontSize: '13px',
                          fontFamily: 'Arial',
                          color: 'white',
                          lineHeight: '1.3',
                          wordWrap: 'break-word',
                          overflow: 'hidden'
                        }}
                      >
                        <span style={{ fontWeight: 'bold' }}>Examples:</span> <span style={{ fontWeight: '400' }}>{posNode.node.examples.join('; ')}</span>
                      </div>
                    </foreignObject>
                  )}
                  
                  {/* Relationship links - Causes */}
                  {posNode.node.causes && posNode.node.causes.length > 0 && (
                    <foreignObject
                      x={centerX + 12}
                      y={causesY}
                      width={nodeWidth - 24}
                      height={25}
                    >
                      <div
                        style={{
                          fontSize: '13px',
                          fontFamily: 'Arial',
                          color: 'white',
                          lineHeight: '1.3',
                          wordWrap: 'break-word',
                          overflow: 'hidden'
                        }}
                      >
                        <span style={{ fontWeight: 'bold' }}>Causes:</span>{' '}
                        {posNode.node.causes.map((causeNode, idx) => (
                          <span key={causeNode.id}>
                            <span 
                              style={{ 
                                fontWeight: '400', 
                                textDecoration: 'underline', 
                                cursor: 'pointer' 
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onNodeClick(causeNode.id);
                              }}
                            >
                              {causeNode.id}
                            </span>
                            {idx < posNode.node.causes.length - 1 ? '; ' : ''}
                          </span>
                        ))}
                      </div>
                    </foreignObject>
                  )}
                  
                  {/* Relationship links - Entails */}
                  {posNode.node.entails && posNode.node.entails.length > 0 && (
                    <foreignObject
                      x={centerX + 12}
                      y={entailsY}
                      width={nodeWidth - 24}
                      height={25}
                    >
                      <div
                        style={{
                          fontSize: '13px',
                          fontFamily: 'Arial',
                          color: 'white',
                          lineHeight: '1.3',
                          wordWrap: 'break-word',
                          overflow: 'hidden'
                        }}
                      >
                        <span style={{ fontWeight: 'bold' }}>Entails:</span>{' '}
                        {posNode.node.entails.map((entailsNode, idx) => (
                          <span key={entailsNode.id}>
                            <span 
                              style={{ 
                                fontWeight: '400', 
                                textDecoration: 'underline', 
                                cursor: 'pointer' 
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onNodeClick(entailsNode.id);
                              }}
                            >
                              {entailsNode.id}
                            </span>
                            {idx < posNode.node.entails.length - 1 ? '; ' : ''}
                          </span>
                        ))}
                      </div>
                    </foreignObject>
                  )}
                  
                  {/* Relationship links - Similar to (Also See) */}
                  {posNode.node.alsoSee && posNode.node.alsoSee.length > 0 && (
                    <foreignObject
                      x={centerX + 12}
                      y={alsoSeeY}
                      width={nodeWidth - 24}
                      height={25}
                    >
                      <div
                        style={{
                          fontSize: '13px',
                          fontFamily: 'Arial',
                          color: 'white',
                          lineHeight: '1.3',
                          wordWrap: 'break-word',
                          overflow: 'hidden'
                        }}
                      >
                        <span style={{ fontWeight: 'bold' }}>Similar to:</span>{' '}
                        {posNode.node.alsoSee.map((alsoSeeNode, idx) => (
                          <span key={alsoSeeNode.id}>
                            <span 
                              style={{ 
                                fontWeight: '400', 
                                textDecoration: 'underline', 
                                cursor: 'pointer' 
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                onNodeClick(alsoSeeNode.id);
                              }}
                            >
                              {alsoSeeNode.id}
                            </span>
                            {idx < posNode.node.alsoSee.length - 1 ? '; ' : ''}
                          </span>
                        ))}
                      </div>
                    </foreignObject>
                  )}
                </Group>
              );
            } else {
              // Closed nodes - show only ID with dynamic width
              const nodeWidth = calculateNodeWidth(posNode.node.id);
              const nodeHeight = 45;
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
                    fontSize={11}
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
