'use client';

import React, { useMemo, useState, useCallback } from 'react';
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

// function truncateText(text: string, maxLength: number): string {
//   if (text.length <= maxLength) return text;
//   return text.substring(0, maxLength) + '...';
// }

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

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Helper function to check if a node has legacy ID beginning with 'src'
  const hasSourceLegacyId = (node: GraphNode): boolean => {
    return node.legacy_id.startsWith('src');
  };

  // Helper function to estimate text height based on content and width
  const estimateTextHeight = (text: string, width: number, fontSize: number = 13, lineHeight: number = 1.3): number => {
    // Approximate character width based on font size
    const avgCharWidth = fontSize * 0.6;
    const availableWidth = width - 24; // Account for padding
    const charsPerLine = Math.floor(availableWidth / avgCharWidth);
    const lines = Math.ceil(text.length / charsPerLine);
    return Math.max(1, lines) * fontSize * lineHeight;
  };

  // Calculate dynamic height for current node based on content
  const calculateCurrentNodeHeight = useCallback((node: GraphNode): number => {
    const nodeWidth = 340;
    const contentWidth = nodeWidth - 24; // Account for padding
    let height = 20; // Top padding
    height += 25; // Title height
    height += 45; // Definition section height (already has good spacing)
    height += 35; // Lemmas section height (already has good spacing)
    
    if (node.examples && node.examples.length > 0) {
      const exampleText = `Examples: ${node.examples.join('; ')}`;
      const estimatedHeight = estimateTextHeight(exampleText, contentWidth);
      height += Math.max(30, estimatedHeight + 10); // Minimum 30px, or estimated + padding
    }
    
    if (node.causes && node.causes.length > 0) {
      const causesText = `Causes: ${node.causes.map(c => c.id).join('; ')}`;
      const estimatedHeight = estimateTextHeight(causesText, contentWidth);
      height += Math.max(25, estimatedHeight + 8); // Minimum 25px, or estimated + padding
    }
    
    if (node.entails && node.entails.length > 0) {
      const entailsText = `Entails: ${node.entails.map(e => e.id).join('; ')}`;
      const estimatedHeight = estimateTextHeight(entailsText, contentWidth);
      height += Math.max(25, estimatedHeight + 8); // Minimum 25px, or estimated + padding
    }
    
    if (node.alsoSee && node.alsoSee.length > 0) {
      const alsoSeeText = `Similar to: ${node.alsoSee.map(a => a.id).join('; ')}`;
      const estimatedHeight = estimateTextHeight(alsoSeeText, contentWidth);
      height += Math.max(25, estimatedHeight + 8); // Minimum 25px, or estimated + padding
    }
    
    height += 20; // Bottom padding    
    return height;
  }, []);

  // Helper function to calculate node width based on text length
  const calculateNodeWidth = (text: string, minWidth: number = 60, maxWidth: number = 150): number => {
    // Approximate character width in pixels (11px font size)
    const charWidth = 7;
    const padding = 16; // 8px padding on each side
    const calculatedWidth = text.length * charWidth + padding;
    return Math.max(minWidth, Math.min(maxWidth, calculatedWidth));
  };

  // Helper function to arrange nodes in rows with width constraints
  const arrangeNodesInRows = useCallback((nodeList: GraphNode[], maxRowWidth: number, nodeSpacing: number) => {
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
  }, []);

  const positionedNodes = useMemo((): LayoutResult => {
    const nodes: PositionedNode[] = [];
    
    // Fixed width, but calculate height based on content
    const width = 800;
    const centerX = width / 2;
    const maxRowWidth = width - 100; // Leave some margin
    const nodeSpacing = 15; // Constant spacing between nodes
    
    // Calculate required height based on number of nodes
    const closedNodeHeight = 45; // Bigger closed nodes
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
  }, [currentNode, arrangeNodesInRows, calculateCurrentNodeHeight]);

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
        <defs>
          <filter id="nodeHoverShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.45" />
          </filter>
        </defs>
        <rect width={width} height={height} rx={14} fill={backgroundColor} stroke="none" />
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
              
              // Use the pre-calculated node height
              const nodeHeight = calculateCurrentNodeHeight(posNode.node);
              const centerX = -nodeWidth / 2;
              const centerY = -nodeHeight / 2;
              
              // Check if this node has a legacy ID beginning with 'src' for special styling
              const isSourceNode = hasSourceLegacyId(posNode.node);
              
              // Calculate Y positions for each section using the same logic as height calculation
              const contentWidth = nodeWidth - 24; // Account for padding
              let sectionY = centerY + 130; // Start after examples base position
              
              let examplesHeight = 0;
              if (posNode.node.examples && posNode.node.examples.length > 0) {
                const exampleText = `Examples: ${posNode.node.examples.join('; ')}`;
                examplesHeight = Math.max(30, estimateTextHeight(exampleText, contentWidth) + 10);
                sectionY += examplesHeight;
              }
              
              const causesY = sectionY;
              let causesHeight = 0;
              if (posNode.node.causes && posNode.node.causes.length > 0) {
                const causesText = `Causes: ${posNode.node.causes.map(c => c.id).join('; ')}`;
                causesHeight = Math.max(25, estimateTextHeight(causesText, contentWidth) + 8);
                sectionY += causesHeight;
              }
              
              const entailsY = sectionY;
              let entailsHeight = 0;
              if (posNode.node.entails && posNode.node.entails.length > 0) {
                const entailsText = `Entails: ${posNode.node.entails.map(e => e.id).join('; ')}`;
                entailsHeight = Math.max(25, estimateTextHeight(entailsText, contentWidth) + 8);
                sectionY += entailsHeight;
              }
              
              const alsoSeeY = sectionY;
              let alsoSeeHeight = 0;
              if (posNode.node.alsoSee && posNode.node.alsoSee.length > 0) {
                const alsoSeeText = `Similar to: ${posNode.node.alsoSee.map(a => a.id).join('; ')}`;
                alsoSeeHeight = Math.max(25, estimateTextHeight(alsoSeeText, contentWidth) + 8);
              }
              
              return (
                <Group
                  key={`node-${i}`}
                  top={posNode.y}
                  left={posNode.x}
                  onMouseEnter={() => setHoveredNodeId(posNode.node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    width={nodeWidth}
                    height={nodeHeight}
                    y={centerY}
                    x={centerX}
                    fill={currentNodeColor}
                    stroke={isSourceNode ? '#000000' : currentNodeStroke}
                    strokeWidth={isSourceNode ? 3 : 3}
                    rx={8}
                    ry={8}
                    style={{ cursor: 'pointer' }}
                    filter={hoveredNodeId === posNode.node.id ? 'url(#nodeHoverShadow)' : undefined}
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
                    <tspan fontWeight="bold">{posNode.node.id.split('.v.')[0] || posNode.node.id}</tspan>
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
                        overflow: 'hidden',
                        cursor: 'pointer'
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
                        overflow: 'hidden',
                        cursor: 'pointer'
                      }}
                    >
                      <span style={{ fontWeight: 'bold' }}>Lemmas:</span>{' '}
                      {(() => {
                        const regularLemmas = posNode.node.lemmas || [];
                        const srcLemmas = (posNode.node.src_lemmas || []).filter(
                          lemma => !regularLemmas.includes(lemma)
                        );
                        const totalRegular = regularLemmas.length;
                        const totalSrc = srcLemmas.length;
                        
                        return (
                          <>
                            {regularLemmas.map((lemma, idx) => (
                              <span key={`regular-${idx}`}>
                                <span style={{ fontWeight: '500' }}>{lemma}</span>
                                {(idx < totalRegular - 1 || totalSrc > 0) ? '; ' : ''}
                              </span>
                            ))}
                            {srcLemmas.map((lemma, idx) => (
                              <span key={`src-${idx}`}>
                                <span style={{ fontWeight: 'bold' }}>{lemma}</span>
                                {idx < totalSrc - 1 ? '; ' : ''}
                              </span>
                            ))}
                          </>
                        );
                      })()}
                    </div>
                  </foreignObject>
                  {/* Examples - only show if examples exist */}
                  {posNode.node.examples && posNode.node.examples.length > 0 && (
                    <foreignObject
                      x={centerX + 12}
                      y={centerY + 130}
                      width={nodeWidth - 24}
                      height={examplesHeight - 5}
                    >
                      <div
                        style={{
                          fontSize: '13px',
                          fontFamily: 'Arial',
                          color: 'white',
                          lineHeight: '1.3',
                          wordWrap: 'break-word',
                          overflow: 'hidden',
                          cursor: 'pointer'
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
                      height={causesHeight - 3}
                    >
                      <div
                        style={{
                          fontSize: '13px',
                          fontFamily: 'Arial',
                          color: 'white',
                          lineHeight: '1.3',
                          wordWrap: 'break-word',
                          overflow: 'hidden',
                          cursor: 'pointer'
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
                      height={entailsHeight - 3}
                    >
                      <div
                        style={{
                          fontSize: '13px',
                          fontFamily: 'Arial',
                          color: 'white',
                          lineHeight: '1.3',
                          wordWrap: 'break-word',
                          overflow: 'hidden',
                          cursor: 'pointer'
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
                      height={alsoSeeHeight - 3}
                    >
                      <div
                        style={{
                          fontSize: '13px',
                          fontFamily: 'Arial',
                          color: 'white',
                          lineHeight: '1.3',
                          wordWrap: 'break-word',
                          overflow: 'hidden',
                          cursor: 'pointer'
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
              
              // Check if this node has a legacy ID beginning with 'src' for special styling
              const isSourceNode = hasSourceLegacyId(posNode.node);
              
              return (
                <Group
                  key={`node-${i}`}
                  top={posNode.y}
                  left={posNode.x}
                  onMouseEnter={() => setHoveredNodeId(posNode.node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    width={nodeWidth}
                    height={nodeHeight}
                    y={centerY}
                    x={centerX}
                    fill={fillColor}
                    stroke={isSourceNode ? '#000000' : strokeColor}
                    strokeWidth={isSourceNode ? 2 : 1}
                    rx={4}
                    ry={4}
                    style={{ cursor: 'pointer' }}
                    filter={hoveredNodeId === posNode.node.id ? 'url(#nodeHoverShadow)' : undefined}
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
