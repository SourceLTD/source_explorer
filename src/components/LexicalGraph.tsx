'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { Group } from '@visx/group';
import { LinearGradient } from '@visx/gradient';
import { GraphNode, sortRolesByPrecedence, PendingChangeInfo } from '@/lib/types';
import { getPendingNodeStroke, getPendingNodeFill } from './PendingChangeIndicator';

// Color scheme
const currentNodeColor = '#3b82f6';
const currentNodeStroke = '#1e40af';
const parentNodeColor = '#10b981';
const parentNodeStroke = '#059669';
const childNodeColor = '#f59e0b';
const childNodeStroke = '#d97706';
const forbiddenNodeColor = '#fca5a5'; // Pale red for forbidden nodes
const forbiddenNodeStroke = '#dc2626'; // Darker red stroke for forbidden nodes
const linkColor = '#e5e7eb';
const backgroundColor = '#ffffff';

interface LexicalGraphProps {
  currentNode: GraphNode;
  onNodeClick: (nodeId: string) => void;
  onEditClick?: () => void;
  mode?: 'verbs' | 'nouns' | 'adjectives' | 'adverbs';
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

export default function LexicalGraph({ currentNode, onNodeClick, onEditClick, mode = 'verbs' }: LexicalGraphProps) {

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [rolesExpanded, setRolesExpanded] = useState<boolean>(false);
  const [lemmasExpanded, setLemmasExpanded] = useState<boolean>(true);
  const [examplesExpanded, setExamplesExpanded] = useState<boolean>(true);
  const [causesExpanded, setCausesExpanded] = useState<boolean>(false);
  const [entailsExpanded, setEntailsExpanded] = useState<boolean>(false);
  const [alsoSeeExpanded, setAlsoSeeExpanded] = useState<boolean>(false);

  // Helper function to check if a node has legacy ID beginning with 'src'
  const hasSourceLegacyId = (node: GraphNode): boolean => {
    return node.legacy_id.startsWith('src');
  };

  // Helper function to remove POS prefix from lexfile
  const cleanLexfile = (lexfile: string): string => {
    return lexfile.replace(/^(verb|noun|adj|adv|satellite)\./i, '');
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

  // Helper function to get Vendler class colors
  const getVendlerClassColor = (vendlerClass: 'state' | 'activity' | 'accomplishment' | 'achievement') => {
    const colors = {
      state: { bg: '#10b981', text: '#ffffff' },        // Green
      activity: { bg: '#3b82f6', text: '#ffffff' },     // Blue
      accomplishment: { bg: '#f59e0b', text: '#ffffff' },// Amber
      achievement: { bg: '#ef4444', text: '#ffffff' },  // Red
    };
    return colors[vendlerClass];
  };

  // Calculate dynamic heights for current node sections
  const calculateNodeHeights = useCallback((node: GraphNode) => {
    const nodeWidth = 600; // Match the wider node width
    const contentWidth = nodeWidth - 24; // Account for padding
    let height = 20; // Top padding
    height += 25; // Title height
    
    // Add space for vendler class badge if present
    if (node.vendler_class) {
      height += 20; // Vendler class badge height with spacing
    }
    
    height += 22; // Category badge height with spacing
    
    // Add space for frame badge if present
    if (node.frame) {
      height += 22; // Frame badge height with spacing
    }
    
    // Calculate dynamic height for gloss/definition based on content
    const glossText = node.gloss || '';
    const glossHeight = glossText ? Math.max(40, estimateTextHeight(glossText, contentWidth, 14, 1.3) + 10) : 40;
    height += glossHeight;
    
    // Calculate dynamic height for lemmas based on content
    const allLemmas = node.lemmas || [];
    const srcLemmas = node.src_lemmas || [];
    const regularLemmas = allLemmas.filter(lemma => !srcLemmas.includes(lemma));
    const lemmasText = [...regularLemmas, ...srcLemmas].join('; ');
    let lemmasHeight = 20; // Header height (always visible)
    if (lemmasExpanded && lemmasText) {
      lemmasHeight += Math.max(30, estimateTextHeight(`Lemmas: ${lemmasText}`, contentWidth, 13) + 5);
    }
    
    height += lemmasHeight;
    
    // Add space for examples if present - AFTER lemmas, BEFORE roles
    let examplesHeight = 0;
    if (node.examples && node.examples.length > 0) {
      examplesHeight = 20; // Header height (always visible)
      if (examplesExpanded) {
        const exampleText = `Examples: ${node.examples.join('; ')}`;
        const estimatedHeight = estimateTextHeight(exampleText, contentWidth);
        examplesHeight += Math.max(30, estimatedHeight + 10); // Minimum 30px, or estimated + padding
      }
      height += examplesHeight;
    }
    
    // Add space for combined roles header always - AFTER examples
    let rolesHeight = 20; // Always show Roles header
    if (rolesExpanded && node.roles && node.roles.length > 0) {
      node.roles.forEach(role => {
        const roleText = `${role.role_type.label}: ${role.description || 'No description'}`;
        const estimatedLines = Math.ceil(roleText.length / 60);
        const roleHeight = estimatedLines <= 2 ? 45 : 60;
        rolesHeight += roleHeight;
      });
    }
    height += rolesHeight; // Include header even when no roles
    
    let causesHeight = 0;
    if (node.causes && node.causes.length > 0) {
      causesHeight = 20; // Header height (always visible)
      if (causesExpanded) {
        const causesText = `Causes: ${node.causes.map(c => c.id).join('; ')}`;
        const estimatedHeight = estimateTextHeight(causesText, contentWidth);
        causesHeight += Math.max(25, estimatedHeight + 8); // Minimum 25px, or estimated + padding
      }
      height += causesHeight;
    }
    
    let entailsHeight = 0;
    if (node.entails && node.entails.length > 0) {
      entailsHeight = 20; // Header height (always visible)
      if (entailsExpanded) {
        const entailsText = `Entails: ${node.entails.map(e => e.id).join('; ')}`;
        const estimatedHeight = estimateTextHeight(entailsText, contentWidth);
        entailsHeight += Math.max(25, estimatedHeight + 8); // Minimum 25px, or estimated + padding
      }
      height += entailsHeight;
    }
    
    let alsoSeeHeight = 0;
    if (node.alsoSee && node.alsoSee.length > 0) {
      alsoSeeHeight = 20; // Header height (always visible)
      if (alsoSeeExpanded) {
        const alsoSeeText = `Similar to: ${node.alsoSee.map(a => a.id).join('; ')}`;
        const estimatedHeight = estimateTextHeight(alsoSeeText, contentWidth);
        alsoSeeHeight += Math.max(25, estimatedHeight + 8); // Minimum 25px, or estimated + padding
      }
      height += alsoSeeHeight;
    }
    
    height += 20; // Bottom padding    
    
    return {
      totalHeight: height,
      glossHeight,
      lemmasHeight,
      examplesHeight,
      rolesHeight,
      causesHeight,
      entailsHeight,
      alsoSeeHeight
    };
  }, [rolesExpanded, lemmasExpanded, examplesExpanded, causesExpanded, entailsExpanded, alsoSeeExpanded]);

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
    const nodeHeights = calculateNodeHeights(currentNode);
    const currentNodeHeight = nodeHeights.totalHeight;
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
  }, [currentNode, arrangeNodesInRows, calculateNodeHeights]);

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
              const nodeWidth = 600; // Made wider to reduce height
              
              // Use the pre-calculated node heights
              const nodeHeights = calculateNodeHeights(posNode.node);
              const nodeHeight = nodeHeights.totalHeight;
              const centerX = -nodeWidth / 2;
              const centerY = -nodeHeight / 2;
              
              // Check if this node has a legacy ID beginning with 'src' for special styling
              const isSourceNode = hasSourceLegacyId(posNode.node);
              
              // Check if this node is forbidden for special styling
              const isForbiddenNode = posNode.node.forbidden;
              
              // Calculate Y positions for each section using the same logic as height calculation
              const contentWidth = nodeWidth - 24; // Account for padding
              
              // Use pre-calculated heights from nodeHeights
              const { glossHeight, lemmasHeight, examplesHeight, rolesHeight } = nodeHeights;
              
              let sectionY = centerY + 55 + (posNode.node.vendler_class ? 20 : 0) + 22 + (posNode.node.frame ? 22 : 0) + glossHeight + lemmasHeight + examplesHeight + rolesHeight; // Start after gloss, lemmas, examples, and roles
              
              const causesY = sectionY;
              let causesHeight = 0;
              if (posNode.node.causes && posNode.node.causes.length > 0) {
                causesHeight = 20; // Header height (always visible)
                if (causesExpanded) {
                  const causesText = `Causes: ${posNode.node.causes.map(c => c.id).join('; ')}`;
                  causesHeight += Math.max(25, estimateTextHeight(causesText, contentWidth) + 8);
                }
                sectionY += causesHeight;
              }
              
              const entailsY = sectionY;
              let entailsHeight = 0;
              if (posNode.node.entails && posNode.node.entails.length > 0) {
                entailsHeight = 20; // Header height (always visible)
                if (entailsExpanded) {
                  const entailsText = `Entails: ${posNode.node.entails.map(e => e.id).join('; ')}`;
                  entailsHeight += Math.max(25, estimateTextHeight(entailsText, contentWidth) + 8);
                }
                sectionY += entailsHeight;
              }
              
              const alsoSeeY = sectionY;
              let alsoSeeHeight = 0;
              if (posNode.node.alsoSee && posNode.node.alsoSee.length > 0) {
                alsoSeeHeight = 20; // Header height (always visible)
                if (alsoSeeExpanded) {
                  const alsoSeeText = `Similar to: ${posNode.node.alsoSee.map(a => a.id).join('; ')}`;
                  alsoSeeHeight += Math.max(25, estimateTextHeight(alsoSeeText, contentWidth) + 8);
                }
                sectionY += alsoSeeHeight;
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
                    fill={isForbiddenNode ? forbiddenNodeColor : currentNodeColor}
                    stroke={isSourceNode ? '#000000' : (isForbiddenNode ? forbiddenNodeStroke : currentNodeStroke)}
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
                  {/* Vendler Class Badge (verbs only) */}
                  {mode === 'verbs' && posNode.node.vendler_class && (
                    <g>
                      <rect
                        x={centerX + 12}
                        y={centerY + 42}
                        width={100}
                        height={16}
                        rx={3}
                        fill={getVendlerClassColor(posNode.node.vendler_class).bg}
                      />
                      <text
                        x={centerX + 62}
                        y={centerY + 53}
                        fontSize={10}
                        fontFamily="Arial"
                        textAnchor="middle"
                        style={{ pointerEvents: 'none' }}
                        fill={getVendlerClassColor(posNode.node.vendler_class).text}
                        fontWeight="600"
                      >
                        {posNode.node.vendler_class.toUpperCase()}
                      </text>
                    </g>
                  )}
                  {/* Category Badge */}
                  <foreignObject
                    x={centerX + 12}
                    y={centerY + (posNode.node.vendler_class ? 68 : 48)}
                    width={nodeWidth - 24}
                    height={20}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span style={{ 
                        backgroundColor: '#059669', 
                        padding: '2px 6px', 
                        borderRadius: '3px',
                        fontWeight: '600',
                        fontSize: '10px',
                      }}>
                        CATEGORY
                      </span>
                      <span style={{ fontWeight: '500', fontSize: '10px' }}>
                        {cleanLexfile(posNode.node.lexfile).toUpperCase()}
                      </span>
                    </div>
                  </foreignObject>
                  {/* Frame Badge (verbs only) */}
                  {mode === 'verbs' && posNode.node.frame && (
                    <foreignObject
                      x={centerX + 12}
                      y={centerY + (posNode.node.vendler_class ? 90 : 70)}
                      width={nodeWidth - 24}
                      height={20}
                    >
                      <div
                        style={{
                          fontSize: '11px',
                          fontFamily: 'Arial',
                          color: 'white',
                          lineHeight: '1.3',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                        title={posNode.node.frame.short_definition}
                      >
                        <span style={{ 
                          backgroundColor: '#8b5cf6', 
                          padding: '2px 6px', 
                          borderRadius: '3px',
                          fontWeight: '600',
                          fontSize: '10px',
                        }}>
                          FRAME
                        </span>
                        <span style={{ fontWeight: '500', fontSize: '10px' }}>
                          {posNode.node.frame.frame_name}
                        </span>
                      </div>
                    </foreignObject>
                  )}
                  {/* Definition/gloss with text wrapping */}
                  <foreignObject
                    x={centerX + 12}
                    y={centerY + 55 + (posNode.node.vendler_class ? 20 : 0) + 22 + (posNode.node.frame ? 22 : 0)}
                    width={nodeWidth - 24}
                    height={glossHeight}
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
                      {posNode.node.gloss || 'No definition available'}
                    </div>
                  </foreignObject>
                  {/* Lemmas with collapsible dropdown */}
                  {(() => {
                    const allLemmas = posNode.node.lemmas || [];
                    const srcLemmas = posNode.node.src_lemmas || [];
                    const regularLemmas = allLemmas.filter(lemma => !srcLemmas.includes(lemma));
                    const lemmasText = [...regularLemmas, ...srcLemmas].join('; ');
                    
                    if (!lemmasText) return null;
                    
                    return (
                      <>
                        {/* Lemmas Header */}
                        <foreignObject
                          x={centerX + 12}
                          y={centerY + 55 + (posNode.node.vendler_class ? 20 : 0) + 22 + (posNode.node.frame ? 22 : 0) + glossHeight}
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
                              backgroundColor: 'rgba(79, 70, 229, 0.6)',
                              borderRadius: '3px 3px 0 0',
                              cursor: 'pointer',
                              userSelect: 'none',
                            }}
                            onClick={() => setLemmasExpanded(!lemmasExpanded)}
                          >
                            Lemmas: {lemmasExpanded ? '▼' : '▶'}
                          </div>
                        </foreignObject>
                        
                        {/* Lemmas Content */}
                        {lemmasExpanded && (
                          <foreignObject
                            x={centerX + 12}
                            y={centerY + 55 + (posNode.node.vendler_class ? 20 : 0) + 22 + (posNode.node.frame ? 22 : 0) + glossHeight + 20}
                            width={nodeWidth - 24}
                            height={lemmasHeight - 20}
                          >
                            <div
                              style={{
                                fontSize: '13px',
                                fontFamily: 'Arial',
                                color: 'white',
                                lineHeight: '1.3',
                                wordWrap: 'break-word',
                                overflow: 'hidden',
                                cursor: 'pointer',
                                padding: '4px 6px',
                                backgroundColor: 'rgba(79, 70, 229, 0.3)',
                                borderRadius: '0 0 3px 3px',
                              }}
                            >
                              {(() => {
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
                        )}
                      </>
                    );
                  })()}
                  {/* Examples with collapsible dropdown - after lemmas, before roles */}
                  {posNode.node.examples && posNode.node.examples.length > 0 && (
                    <>
                      {/* Examples Header */}
                      <foreignObject
                        x={centerX + 12}
                        y={centerY + 55 + (posNode.node.vendler_class ? 20 : 0) + 22 + (posNode.node.frame ? 22 : 0) + glossHeight + lemmasHeight}
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
                            backgroundColor: 'rgba(79, 70, 229, 0.6)',
                            borderRadius: '3px 3px 0 0',
                            cursor: 'pointer',
                            userSelect: 'none',
                          }}
                          onClick={() => setExamplesExpanded(!examplesExpanded)}
                        >
                          Examples: {examplesExpanded ? '▼' : '▶'}
                        </div>
                      </foreignObject>
                      
                      {/* Examples Content */}
                      {examplesExpanded && (
                        <foreignObject
                          x={centerX + 12}
                          y={centerY + 55 + (posNode.node.vendler_class ? 20 : 0) + 22 + (posNode.node.frame ? 22 : 0) + glossHeight + lemmasHeight + 20}
                          width={nodeWidth - 24}
                          height={examplesHeight - 20}
                        >
                          <div
                            style={{
                              fontSize: '13px',
                              fontFamily: 'Arial',
                              color: 'white',
                              lineHeight: '1.3',
                              wordWrap: 'break-word',
                              overflow: 'hidden',
                              cursor: 'pointer',
                              padding: '4px 6px',
                              backgroundColor: 'rgba(79, 70, 229, 0.3)',
                              borderRadius: '0 0 3px 3px',
                            }}
                          >
                            <span style={{ fontWeight: '400' }}>{posNode.node.examples.join('; ')}</span>
                          </div>
                        </foreignObject>
                      )}
                    </>
                  )}
                  
                  {/* Combined Roles - after examples (verbs only) */}
                  {mode === 'verbs' && (() => {
                    const rolesStartY = centerY + 55 + (posNode.node.vendler_class ? 20 : 0) + 22 + (posNode.node.frame ? 22 : 0) + glossHeight + lemmasHeight + examplesHeight;
                    let currentRoleY = rolesStartY + 20;
                    const roleElements: JSX.Element[] = [];
                    
                    // Add roles (only if expanded and exist) - sorted by precedence
                    if (rolesExpanded && posNode.node.roles && posNode.node.roles.length > 0) {
                      // Custom ordering for speech-related roles
                      const speechRoleOrder: Record<string, number> = {
                        'CONTENT.ENTITY': 1,
                        'CONTENT.CLAUSE': 2,
                        'CONTENT.QUOTE': 3,
                      };
                      
                      // Create a map from role ID to group ID and organize groups
                      const roleToGroup = new Map<string, string>();
                      const roleGroups = posNode.node.role_groups || [];
                      const groupedRoleIds = new Set<string>();
                      
                      roleGroups.forEach(group => {
                        group.role_ids.forEach(roleId => {
                          roleToGroup.set(roleId, group.id);
                          groupedRoleIds.add(roleId);
                        });
                      });
                      
                      const sortedRoles = sortRolesByPrecedence(posNode.node.roles);
                      
                      // Organize roles by group with custom ordering
                      const rolesByGroup = new Map<string, typeof sortedRoles>();
                      roleGroups.forEach(group => {
                        const rolesInGroup = posNode.node.roles!.filter(role => group.role_ids.includes(role.id));
                        // Sort roles within group by custom order if applicable
                        rolesInGroup.sort((a, b) => {
                          const orderA = speechRoleOrder[a.role_type.label] || 999;
                          const orderB = speechRoleOrder[b.role_type.label] || 999;
                          if (orderA !== orderB) return orderA - orderB;
                          return 0;
                        });
                        rolesByGroup.set(group.id, rolesInGroup);
                      });
                      
                      // Track which groups we've already rendered
                      const renderedGroups = new Set<string>();
                      
                      // Iterate through sorted roles and render them
                      sortedRoles.forEach((role, idx) => {
                        const roleGroupId = roleToGroup.get(role.id);
                        
                        // If this role is in a group and we haven't rendered the group yet
                        if (roleGroupId && !renderedGroups.has(roleGroupId)) {
                          renderedGroups.add(roleGroupId);
                          const rolesInGroup = rolesByGroup.get(roleGroupId) || [];
                          
                          const groupStartY = currentRoleY;
                          
                          // Calculate heights for all roles in group
                          const roleHeights = rolesInGroup.map(r => {
                            const roleText = `${r.role_type.label}: ${r.description || 'No description'}`;
                            const estimatedLines = Math.ceil(roleText.length / 60);
                            return estimatedLines <= 2 ? 45 : 60;
                          });
                          
                          const groupHeight = roleHeights.reduce((sum, h) => sum + h, 0);
                          
                          // Draw border around entire group with background fill
                          roleElements.push(
                            <rect
                              key={`group-border-${roleGroupId}`}
                              x={centerX + 12}
                              y={groupStartY}
                              width={nodeWidth - 24}
                              height={groupHeight}
                              fill="#456aef"
                              stroke="rgba(0, 0, 0, 0.7)"
                              strokeWidth={2}
                              rx={5}
                            />
                          );
                          
                          // Add "oneOf" label that interrupts the border at the top
                          roleElements.push(
                            <g key={`group-label-${roleGroupId}`}>
                              <rect
                                x={centerX + 20}
                                y={groupStartY - 6}
                                width={32}
                                height={12}
                                fill="#456aef"
                              />
                              <text
                                x={centerX + 36}
                                y={groupStartY + 3}
                                fontSize="10"
                                fill="rgba(0, 0, 0, 0.7)"
                                fontWeight="bold"
                                textAnchor="middle"
                              >
                                oneOf
                              </text>
                            </g>
                          );
                          
                          // Render roles within the group
                          rolesInGroup.forEach((groupRole, roleIdx) => {
                            const roleHeight = roleHeights[roleIdx];
                            
                            roleElements.push(
                              <foreignObject
                                key={`group-${roleGroupId}-role-${roleIdx}`}
                                x={centerX + 12}
                                y={currentRoleY}
                                width={nodeWidth - 24}
                                height={roleHeight}
                              >
                                <div style={{
                                  fontSize: '13px',
                                  fontFamily: 'Arial',
                                  color: 'white',
                                  lineHeight: '1.3',
                                  wordWrap: 'break-word',
                                  padding: '4px 6px',
                                  height: '100%',
                                  overflow: 'hidden',
                                }}>
                                  <span style={{ fontWeight: 'bold' }}>{groupRole.role_type.label}:</span>{' '}
                                  {groupRole.description || 'No description'}
                                </div>
                              </foreignObject>
                            );
                            currentRoleY += roleHeight;
                          });
                          
                        } 
                        // If this role is not in a group, render it normally
                        else if (!roleGroupId) {
                          const roleText = `${role.role_type.label}: ${role.description || 'No description'}`;
                          const estimatedLines = Math.ceil(roleText.length / 60);
                          const roleHeight = estimatedLines <= 2 ? 45 : 60;
                          
                          roleElements.push(
                            <foreignObject
                              key={`role-${idx}`}
                              x={centerX + 12}
                              y={currentRoleY}
                              width={nodeWidth - 24}
                              height={roleHeight}
                            >
                              <div style={{
                                fontSize: '13px',
                                fontFamily: 'Arial',
                                color: 'white',
                                lineHeight: '1.3',
                                wordWrap: 'break-word',
                                padding: '4px 6px',
                                backgroundColor: role.main ? '#456aef' : '#4075f2',
                                borderRadius: '3px',
                                height: '100%',
                                overflow: 'hidden',
                              }}>
                                <span style={{ fontWeight: 'bold' }}>{role.role_type.label}:</span>{' '}
                                {role.description || 'No description'}
                              </div>
                            </foreignObject>
                          );
                          currentRoleY += roleHeight;
                        }
                        // Skip roles that are in a group we've already rendered
                      });
                    }
                    
                    return (
                      <>
                        <foreignObject
                          x={centerX + 12}
                          y={rolesStartY}
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
                              backgroundColor: 'rgba(79, 70, 229, 0.6)',
                              borderRadius: '3px 3px 0 0',
                              cursor: 'pointer',
                              userSelect: 'none',
                            }}
                            onClick={() => setRolesExpanded(!rolesExpanded)}
                          >
                            Roles: {rolesExpanded ? '▼' : '▶'}
                          </div>
                        </foreignObject>
                        {roleElements}
                      </>
                    );
                  })()}
                  
                  {/* Relationship links - Causes */}
                  {posNode.node.causes && posNode.node.causes.length > 0 && (
                    <>
                      {/* Causes Header */}
                      <foreignObject
                        x={centerX + 12}
                        y={causesY}
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
                            backgroundColor: 'rgba(79, 70, 229, 0.6)',
                            borderRadius: '3px 3px 0 0',
                            cursor: 'pointer',
                            userSelect: 'none',
                          }}
                          onClick={() => setCausesExpanded(!causesExpanded)}
                        >
                          Causes: {causesExpanded ? '▼' : '▶'}
                        </div>
                      </foreignObject>
                      
                      {/* Causes Content */}
                      {causesExpanded && (
                        <foreignObject
                          x={centerX + 12}
                          y={causesY + 20}
                          width={nodeWidth - 24}
                          height={causesHeight - 20}
                        >
                          <div
                            style={{
                              fontSize: '13px',
                              fontFamily: 'Arial',
                              color: 'white',
                              lineHeight: '1.3',
                              wordWrap: 'break-word',
                              overflow: 'hidden',
                              cursor: 'pointer',
                              padding: '4px 6px',
                              backgroundColor: 'rgba(79, 70, 229, 0.3)',
                              borderRadius: '0 0 3px 3px',
                            }}
                          >
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
                    </>
                  )}
                  
                  {/* Relationship links - Entails */}
                  {posNode.node.entails && posNode.node.entails.length > 0 && (
                    <>
                      {/* Entails Header */}
                      <foreignObject
                        x={centerX + 12}
                        y={entailsY}
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
                            backgroundColor: 'rgba(79, 70, 229, 0.6)',
                            borderRadius: '3px 3px 0 0',
                            cursor: 'pointer',
                            userSelect: 'none',
                          }}
                          onClick={() => setEntailsExpanded(!entailsExpanded)}
                        >
                          Entails: {entailsExpanded ? '▼' : '▶'}
                        </div>
                      </foreignObject>
                      
                      {/* Entails Content */}
                      {entailsExpanded && (
                        <foreignObject
                          x={centerX + 12}
                          y={entailsY + 20}
                          width={nodeWidth - 24}
                          height={entailsHeight - 20}
                        >
                          <div
                            style={{
                              fontSize: '13px',
                              fontFamily: 'Arial',
                              color: 'white',
                              lineHeight: '1.3',
                              wordWrap: 'break-word',
                              overflow: 'hidden',
                              cursor: 'pointer',
                              padding: '4px 6px',
                              backgroundColor: 'rgba(79, 70, 229, 0.3)',
                              borderRadius: '0 0 3px 3px',
                            }}
                          >
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
                    </>
                  )}
                  
                  {/* Relationship links - Similar to (Also See) */}
                  {posNode.node.alsoSee && posNode.node.alsoSee.length > 0 && (
                    <>
                      {/* Also See Header */}
                      <foreignObject
                        x={centerX + 12}
                        y={alsoSeeY}
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
                            backgroundColor: 'rgba(79, 70, 229, 0.6)',
                            borderRadius: '3px 3px 0 0',
                            cursor: 'pointer',
                            userSelect: 'none',
                          }}
                          onClick={() => setAlsoSeeExpanded(!alsoSeeExpanded)}
                        >
                          Similar to: {alsoSeeExpanded ? '▼' : '▶'}
                        </div>
                      </foreignObject>
                      
                      {/* Also See Content */}
                      {alsoSeeExpanded && (
                        <foreignObject
                          x={centerX + 12}
                          y={alsoSeeY + 20}
                          width={nodeWidth - 24}
                          height={alsoSeeHeight - 20}
                        >
                          <div
                            style={{
                              fontSize: '13px',
                              fontFamily: 'Arial',
                              color: 'white',
                              lineHeight: '1.3',
                              wordWrap: 'break-word',
                              overflow: 'hidden',
                              cursor: 'pointer',
                              padding: '4px 6px',
                              backgroundColor: 'rgba(79, 70, 229, 0.3)',
                              borderRadius: '0 0 3px 3px',
                            }}
                          >
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
                    </>
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
                        <title>Edit entry details</title>
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
            } else {
              // Closed nodes - show only ID with dynamic width
              const nodeWidth = calculateNodeWidth(posNode.node.id);
              const nodeHeight = 45;
              const centerX = -nodeWidth / 2;
              const centerY = -nodeHeight / 2;
              
              const isParent = posNode.nodeType === 'parent';
              const isForbiddenNode = posNode.node.forbidden;
              const hasPending = !!posNode.node.pending;
              const pendingOp = posNode.node.pending?.operation;
              
              // Determine colors - pending changes take precedence
              const fillColor = hasPending && pendingOp
                ? getPendingNodeFill(pendingOp)
                : isForbiddenNode 
                ? forbiddenNodeColor 
                : (isParent ? parentNodeColor : childNodeColor);
              const strokeColor = hasPending && pendingOp
                ? getPendingNodeStroke(pendingOp)
                : isForbiddenNode 
                ? forbiddenNodeStroke 
                : (isParent ? parentNodeStroke : childNodeStroke);
              
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
                    strokeWidth={hasPending ? 3 : (isSourceNode ? 2 : 1)}
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
                  {/* Small vendler class badge for closed nodes (verbs only) */}
                  {mode === 'verbs' && posNode.node.vendler_class && (
                    <circle
                      cx={centerX + nodeWidth - 8}
                      cy={centerY + 8}
                      r={6}
                      fill={getVendlerClassColor(posNode.node.vendler_class).bg}
                      stroke="white"
                      strokeWidth={1}
                    >
                      <title>{posNode.node.vendler_class}</title>
                    </circle>
                  )}
                </Group>
              );
            }
          })}
        </Group>
      </svg>
    </div>
  );
}
