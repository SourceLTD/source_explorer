'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { Group } from '@visx/group';
import { LinearGradient } from '@visx/gradient';
import { GraphNode, PendingChangeInfo, POS_LABELS } from '@/lib/types';
import { getPendingNodeStroke, getPendingNodeFill } from './PendingChangeIndicator';

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
  onEditClick?: () => void;
  mode?: 'lexical_units' | 'verbs' | 'nouns' | 'adjectives' | 'adverbs';
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

export default function LexicalGraph({ currentNode, onNodeClick, onEditClick, mode = 'lexical_units' }: LexicalGraphProps) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [lemmasExpanded, setLemmasExpanded] = useState<boolean>(true);
  const [examplesExpanded, setExamplesExpanded] = useState<boolean>(true);
  const [causesExpanded, setCausesExpanded] = useState<boolean>(false);
  const [entailsExpanded, setEntailsExpanded] = useState<boolean>(false);
  const [alsoSeeExpanded, setAlsoSeeExpanded] = useState<boolean>(false);

  const cleanLexfile = (lexfile: string): string => {
    return lexfile.replace(/^(verb|noun|adj|adv|satellite)\./i, '');
  };

  const estimateTextHeight = (text: string, width: number, fontSize: number = 13, lineHeight: number = 1.3): number => {
    const avgCharWidth = fontSize * 0.6;
    const availableWidth = width - 24;
    const charsPerLine = Math.floor(availableWidth / avgCharWidth);
    const lines = Math.ceil(text.length / charsPerLine);
    return Math.max(1, lines) * fontSize * lineHeight;
  };

  const getVendlerClassColor = (vendlerClass: 'state' | 'activity' | 'accomplishment' | 'achievement') => {
    const colors = {
      state: { bg: '#10b981', text: '#ffffff' },
      activity: { bg: '#3b82f6', text: '#ffffff' },
      accomplishment: { bg: '#f59e0b', text: '#ffffff' },
      achievement: { bg: '#ef4444', text: '#ffffff' },
    };
    return colors[vendlerClass];
  };

  const calculateNodeHeights = useCallback((node: GraphNode) => {
    const nodeWidth = 600;
    const contentWidth = nodeWidth - 24;
    let height = 20;
    height += 25; // Title
    
    if (node.vendler_class) height += 20;
    height += 22; // Category
    if (node.frame) height += 22; // Frame
    
    const glossText = node.gloss || '';
    const glossHeight = glossText ? Math.max(40, estimateTextHeight(glossText, contentWidth, 14, 1.3) + 10) : 40;
    height += glossHeight;
    
    const lemmasText = (node.lemmas || []).join('; ');
    let lemmasHeight = 20;
    if (lemmasExpanded && lemmasText) {
      lemmasHeight += Math.max(30, estimateTextHeight(`Lemmas: ${lemmasText}`, contentWidth, 13) + 5);
    }
    height += lemmasHeight;
    
    let examplesHeight = 0;
    if (node.examples && node.examples.length > 0) {
      examplesHeight = 20;
      if (examplesExpanded) {
        const exampleText = `Examples: ${node.examples.join('; ')}`;
        examplesHeight += Math.max(30, estimateTextHeight(exampleText, contentWidth) + 10);
      }
      height += examplesHeight;
    }
    
    let causesHeight = 0;
    if (node.causes && node.causes.length > 0) {
      causesHeight = 20;
      if (causesExpanded) {
        const causesText = `Causes: ${node.causes.map(c => c.id).join('; ')}`;
        causesHeight += Math.max(25, estimateTextHeight(causesText, contentWidth) + 8);
      }
      height += causesHeight;
    }
    
    let entailsHeight = 0;
    if (node.entails && node.entails.length > 0) {
      entailsHeight = 20;
      if (entailsExpanded) {
        const entailsText = `Entails: ${node.entails.map(e => e.id).join('; ')}`;
        entailsHeight += Math.max(25, estimateTextHeight(entailsText, contentWidth) + 8);
      }
      height += entailsHeight;
    }
    
    let alsoSeeHeight = 0;
    if (node.alsoSee && node.alsoSee.length > 0) {
      alsoSeeHeight = 20;
      if (alsoSeeExpanded) {
        const alsoSeeText = `Similar to: ${node.alsoSee.map(a => a.id).join('; ')}`;
        alsoSeeHeight += Math.max(25, estimateTextHeight(alsoSeeText, contentWidth) + 8);
      }
      height += alsoSeeHeight;
    }
    
    height += 20; // Bottom padding
    
    return {
      totalHeight: height,
      glossHeight,
      lemmasHeight,
      examplesHeight,
      causesHeight,
      entailsHeight,
      alsoSeeHeight
    };
  }, [lemmasExpanded, examplesExpanded, causesExpanded, entailsExpanded, alsoSeeExpanded]);

  const calculateNodeWidth = (text: string, minWidth: number = 60, maxWidth: number = 150): number => {
    const charWidth = 7;
    const padding = 16;
    const calculatedWidth = text.length * charWidth + padding;
    return Math.max(minWidth, Math.min(maxWidth, calculatedWidth));
  };

  const arrangeNodesInRows = useCallback((nodeList: GraphNode[], maxRowWidth: number, nodeSpacing: number) => {
    const rows: { nodes: GraphNode[]; totalWidth: number }[] = [];
    let currentRow: GraphNode[] = [];
    let currentRowWidth = 0;

    for (const node of nodeList) {
      const nodeWidth = calculateNodeWidth(node.id);
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
    if (currentRow.length > 0) rows.push({ nodes: currentRow, totalWidth: currentRowWidth });
    return rows;
  }, []);

  const positionedNodes = useMemo((): LayoutResult => {
    const nodes: PositionedNode[] = [];
    const width = 800;
    const centerX = width / 2;
    const maxRowWidth = width - 100;
    const nodeSpacing = 15;
    
    const closedNodeHeight = 45;
    const nodeHeights = calculateNodeHeights(currentNode);
    const currentNodeHeight = nodeHeights.totalHeight;
    const rowSpacing = 50;
    const margin = 50;
    const spacingFromCenter = 80;
    
    const hypernymsToShow = currentNode.parents;
    const hyponymsToShow = currentNode.children;
    
    const parentRows = arrangeNodesInRows(hypernymsToShow, maxRowWidth, nodeSpacing);
    const childRows = arrangeNodesInRows(hyponymsToShow, maxRowWidth, nodeSpacing);
    
    const spaceNeededAbove = parentRows.length > 0 ? 
      parentRows.length * closedNodeHeight + (parentRows.length - 1) * rowSpacing + spacingFromCenter : 
      spacingFromCenter;
    
    const spaceNeededBelow = childRows.length > 0 ? 
      childRows.length * closedNodeHeight + (childRows.length - 1) * rowSpacing + spacingFromCenter : 
      spacingFromCenter;
    
    const totalHeight = margin + spaceNeededAbove + currentNodeHeight + spaceNeededBelow + margin;
    const height = Math.max(600, totalHeight);
    const centerY = margin + spaceNeededAbove + currentNodeHeight / 2;
    
    nodes.push({
      node: currentNode,
      nodeType: 'current',
      x: centerX,
      y: centerY
    });
    
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
            nodeType: 'parent',
            x: currentX + nodeWidth / 2,
            y: rowY
          });
          currentX += nodeWidth + nodeSpacing;
        });
      });
    }
    
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
            nodeType: 'child',
            x: currentX + nodeWidth / 2,
            y: rowY
          });
          currentX += nodeWidth + nodeSpacing;
        });
      });
    }
    
    return { nodes, width, height };
  }, [currentNode, arrangeNodesInRows, calculateNodeHeights]);

  const links = useMemo(() => {
    const linkList: { from: PositionedNode; to: PositionedNode }[] = [];
    const currentNodePos = positionedNodes.nodes.find(n => n.nodeType === 'current')!;
    positionedNodes.nodes.filter(n => n.nodeType === 'parent').forEach(hypernym => {
      linkList.push({ from: hypernym, to: currentNodePos });
    });
    positionedNodes.nodes.filter(n => n.nodeType === 'child').forEach(hyponym => {
      linkList.push({ from: currentNodePos, to: hyponym });
    });
    return linkList;
  }, [positionedNodes]);
  
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
          
          {positionedNodes.nodes.map((posNode, i) => {
            if (posNode.nodeType === 'current') {
              const nodeWidth = 600;
              const nodeHeights = calculateNodeHeights(posNode.node);
              const nodeHeight = nodeHeights.totalHeight;
              const centerX = -nodeWidth / 2;
              const centerY = -nodeHeight / 2;
              const contentWidth = nodeWidth - 24;
              const { glossHeight, lemmasHeight, examplesHeight } = nodeHeights;
              
              let sectionY = centerY + 55 + (posNode.node.vendler_class ? 20 : 0) + 22 + (posNode.node.frame ? 22 : 0) + glossHeight + lemmasHeight + examplesHeight;
              
              const causesY = sectionY;
              let causesHeight = 0;
              if (posNode.node.causes && posNode.node.causes.length > 0) {
                causesHeight = 20;
                if (causesExpanded) {
                  causesHeight += Math.max(25, estimateTextHeight(`Causes: ${posNode.node.causes.map(c => c.id).join('; ')}`, contentWidth) + 8);
                }
                sectionY += causesHeight;
              }
              
              const entailsY = sectionY;
              let entailsHeight = 0;
              if (posNode.node.entails && posNode.node.entails.length > 0) {
                entailsHeight = 20;
                if (entailsExpanded) {
                  entailsHeight += Math.max(25, estimateTextHeight(`Entails: ${posNode.node.entails.map(e => e.id).join('; ')}`, contentWidth) + 8);
                }
                sectionY += entailsHeight;
              }
              
              const alsoSeeY = sectionY;
              let alsoSeeHeight = 0;
              if (posNode.node.alsoSee && posNode.node.alsoSee.length > 0) {
                alsoSeeHeight = 20;
                if (alsoSeeExpanded) {
                  alsoSeeHeight += Math.max(25, estimateTextHeight(`Similar to: ${posNode.node.alsoSee.map(a => a.id).join('; ')}`, contentWidth) + 8);
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
                    fill={currentNodeColor}
                    stroke={currentNodeStroke}
                    strokeWidth={3}
                    rx={8}
                    ry={8}
                    filter={hoveredNodeId === posNode.node.id ? 'url(#nodeHoverShadow)' : undefined}
                    onClick={() => onNodeClick(posNode.node.id)}
                  />
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
                  {posNode.node.vendler_class && (
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
                  <foreignObject
                    x={centerX + 12}
                    y={centerY + (posNode.node.vendler_class ? 68 : 48)}
                    width={nodeWidth - 24}
                    height={20}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ backgroundColor: '#059669', padding: '2px 6px', borderRadius: '3px', fontWeight: '600', fontSize: '10px', color: 'white' }}>
                        {POS_LABELS[posNode.node.pos]?.toUpperCase() || posNode.node.pos.toUpperCase()}
                      </span>
                      <span style={{ fontWeight: '500', fontSize: '10px', color: 'white' }}>
                        {cleanLexfile(posNode.node.lexfile).toUpperCase()}
                      </span>
                    </div>
                  </foreignObject>
                  {posNode.node.frame && (
                    <foreignObject
                      x={centerX + 12}
                      y={centerY + (posNode.node.vendler_class ? 90 : 70)}
                      width={nodeWidth - 24}
                      height={20}
                    >
                      <div style={{ fontSize: '11px', fontFamily: 'Arial', color: 'white', lineHeight: '1.3', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ backgroundColor: '#8b5cf6', padding: '2px 6px', borderRadius: '3px', fontWeight: '600', fontSize: '10px' }}>
                          FRAME
                        </span>
                        <span style={{ fontWeight: '500', fontSize: '10px' }}>
                          {posNode.node.frame.label}
                        </span>
                      </div>
                    </foreignObject>
                  )}
                  <foreignObject
                    x={centerX + 12}
                    y={centerY + 55 + (posNode.node.vendler_class ? 20 : 0) + 22 + (posNode.node.frame ? 22 : 0)}
                    width={nodeWidth - 24}
                    height={glossHeight}
                  >
                    <div style={{ fontSize: '14px', fontFamily: 'Arial', color: 'white', fontStyle: 'italic', lineHeight: '1.3', wordWrap: 'break-word', overflow: 'hidden' }}>
                      {posNode.node.gloss || 'No definition available'}
                    </div>
                  </foreignObject>
                  <foreignObject
                    x={centerX + 12}
                    y={centerY + 55 + (posNode.node.vendler_class ? 20 : 0) + 22 + (posNode.node.frame ? 22 : 0) + glossHeight}
                    width={nodeWidth - 24}
                    height={20}
                  >
                    <div 
                      style={{ fontSize: '13px', fontFamily: 'Arial', color: 'white', fontWeight: 'bold', padding: '2px 6px', backgroundColor: 'rgba(79, 70, 229, 0.6)', borderRadius: '3px 3px 0 0', cursor: 'pointer' }}
                      onClick={() => setLemmasExpanded(!lemmasExpanded)}
                    >
                      Lemmas: {lemmasExpanded ? '▼' : '▶'}
                    </div>
                  </foreignObject>
                  {lemmasExpanded && (
                    <foreignObject
                      x={centerX + 12}
                      y={centerY + 55 + (posNode.node.vendler_class ? 20 : 0) + 22 + (posNode.node.frame ? 22 : 0) + glossHeight + 20}
                      width={nodeWidth - 24}
                      height={lemmasHeight - 20}
                    >
                      <div style={{ fontSize: '13px', fontFamily: 'Arial', color: 'white', lineHeight: '1.3', padding: '4px 6px', backgroundColor: 'rgba(79, 70, 229, 0.3)', borderRadius: '0 0 3px 3px' }}>
                        {(posNode.node.lemmas || []).join('; ')}
                      </div>
                    </foreignObject>
                  )}
                  {posNode.node.examples && posNode.node.examples.length > 0 && (
                    <>
                      <foreignObject
                        x={centerX + 12}
                        y={centerY + 55 + (posNode.node.vendler_class ? 20 : 0) + 22 + (posNode.node.frame ? 22 : 0) + glossHeight + lemmasHeight}
                        width={nodeWidth - 24}
                        height={20}
                      >
                        <div 
                          style={{ fontSize: '13px', fontFamily: 'Arial', color: 'white', fontWeight: 'bold', padding: '2px 6px', backgroundColor: 'rgba(79, 70, 229, 0.6)', borderRadius: '3px 3px 0 0', cursor: 'pointer' }}
                          onClick={() => setExamplesExpanded(!examplesExpanded)}
                        >
                          Examples: {examplesExpanded ? '▼' : '▶'}
                        </div>
                      </foreignObject>
                      {examplesExpanded && (
                        <foreignObject
                          x={centerX + 12}
                          y={centerY + 55 + (posNode.node.vendler_class ? 20 : 0) + 22 + (posNode.node.frame ? 22 : 0) + glossHeight + lemmasHeight + 20}
                          width={nodeWidth - 24}
                          height={examplesHeight - 20}
                        >
                          <div style={{ fontSize: '13px', fontFamily: 'Arial', color: 'white', lineHeight: '1.3', padding: '4px 6px', backgroundColor: 'rgba(79, 70, 229, 0.3)', borderRadius: '0 0 3px 3px' }}>
                            {posNode.node.examples.join('; ')}
                          </div>
                        </foreignObject>
                      )}
                    </>
                  )}
                  {onEditClick && (
                    <g onClick={(e) => { e.stopPropagation(); onEditClick(); }}>
                      <rect x={centerX + nodeWidth - 44} y={centerY + 8} width={36} height={36} rx={6} fill="rgba(59, 130, 246, 0.95)" stroke="rgba(255, 255, 255, 0.9)" strokeWidth={2} style={{ cursor: 'pointer' }} />
                      <g style={{ pointerEvents: 'none' }} transform={`translate(${centerX + nodeWidth - 26}, ${centerY + 26}) scale(0.75)`}>
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </g>
                    </g>
                  )}
                </Group>
              );
            } else {
              const nodeWidth = calculateNodeWidth(posNode.node.id);
              const nodeHeight = 45;
              const centerX = -nodeWidth / 2;
              const centerY = -nodeHeight / 2;
              const isParent = posNode.nodeType === 'parent';
              const fillColor = posNode.node.pending ? getPendingNodeFill(posNode.node.pending.operation) : (isParent ? parentNodeColor : childNodeColor);
              const strokeColor = posNode.node.pending ? getPendingNodeStroke(posNode.node.pending.operation) : (isParent ? parentNodeStroke : childNodeStroke);
              
              return (
                <Group key={`node-${i}`} top={posNode.y} left={posNode.x} onMouseEnter={() => setHoveredNodeId(posNode.node.id)} onMouseLeave={() => setHoveredNodeId(null)} style={{ cursor: 'pointer' }}>
                  <rect width={nodeWidth} height={nodeHeight} y={centerY} x={centerX} fill={fillColor} stroke={strokeColor} strokeWidth={posNode.node.pending ? 3 : 1} rx={4} ry={4} filter={hoveredNodeId === posNode.node.id ? 'url(#nodeHoverShadow)' : undefined} onClick={() => onNodeClick(posNode.node.id)} />
                  <text dy=".33em" fontSize={11} fontFamily="Arial" fontWeight="500" textAnchor="middle" style={{ pointerEvents: 'none' }} fill="white">{posNode.node.id}</text>
                </Group>
              );
            }
          })}
        </Group>
      </svg>
    </div>
  );
}
