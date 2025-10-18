'use client';

import React, { useState, useCallback } from 'react';
import { Group } from '@visx/group';
import { GraphNode, sortRolesByPrecedence } from '@/lib/types';

interface GraphMainNodeProps {
  node: GraphNode;
  x: number;
  y: number;
  onNodeClick: (nodeId: string) => void;
  // Optional controlled expansion states
  controlledRolesExpanded?: boolean;
  controlledLemmasExpanded?: boolean;
  controlledExamplesExpanded?: boolean;
  controlledLegalConstraintsExpanded?: boolean;
  controlledCausesExpanded?: boolean;
  controlledEntailsExpanded?: boolean;
  controlledAlsoSeeExpanded?: boolean;
  onRolesExpandedChange?: (expanded: boolean) => void;
  onLemmasExpandedChange?: (expanded: boolean) => void;
  onExamplesExpandedChange?: (expanded: boolean) => void;
  onLegalConstraintsExpandedChange?: (expanded: boolean) => void;
  onCausesExpandedChange?: (expanded: boolean) => void;
  onEntailsExpandedChange?: (expanded: boolean) => void;
  onAlsoSeeExpandedChange?: (expanded: boolean) => void;
}

export default function GraphMainNode({ 
  node, 
  x, 
  y, 
  onNodeClick,
  controlledRolesExpanded,
  controlledLemmasExpanded,
  controlledExamplesExpanded,
  controlledLegalConstraintsExpanded,
  controlledCausesExpanded,
  controlledEntailsExpanded,
  controlledAlsoSeeExpanded,
  onRolesExpandedChange,
  onLemmasExpandedChange,
  onExamplesExpandedChange,
  onLegalConstraintsExpandedChange,
  onCausesExpandedChange,
  onEntailsExpandedChange,
  onAlsoSeeExpandedChange,
}: GraphMainNodeProps) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [internalRolesExpanded, setInternalRolesExpanded] = useState<boolean>(false);
  const [internalLemmasExpanded, setInternalLemmasExpanded] = useState<boolean>(true);
  const [internalExamplesExpanded, setInternalExamplesExpanded] = useState<boolean>(true);
  const [internalLegalConstraintsExpanded, setInternalLegalConstraintsExpanded] = useState<boolean>(false);
  const [internalCausesExpanded, setInternalCausesExpanded] = useState<boolean>(false);
  const [internalEntailsExpanded, setInternalEntailsExpanded] = useState<boolean>(false);
  const [internalAlsoSeeExpanded, setInternalAlsoSeeExpanded] = useState<boolean>(false);

  // Use controlled values if provided, otherwise use internal state
  const rolesExpanded = controlledRolesExpanded !== undefined ? controlledRolesExpanded : internalRolesExpanded;
  const lemmasExpanded = controlledLemmasExpanded !== undefined ? controlledLemmasExpanded : internalLemmasExpanded;
  const examplesExpanded = controlledExamplesExpanded !== undefined ? controlledExamplesExpanded : internalExamplesExpanded;
  const legalConstraintsExpanded = controlledLegalConstraintsExpanded !== undefined ? controlledLegalConstraintsExpanded : internalLegalConstraintsExpanded;
  const causesExpanded = controlledCausesExpanded !== undefined ? controlledCausesExpanded : internalCausesExpanded;
  const entailsExpanded = controlledEntailsExpanded !== undefined ? controlledEntailsExpanded : internalEntailsExpanded;
  const alsoSeeExpanded = controlledAlsoSeeExpanded !== undefined ? controlledAlsoSeeExpanded : internalAlsoSeeExpanded;

  const setRolesExpanded = (val: boolean) => {
    if (onRolesExpandedChange) onRolesExpandedChange(val);
    else setInternalRolesExpanded(val);
  };
  const setLemmasExpanded = (val: boolean) => {
    if (onLemmasExpandedChange) onLemmasExpandedChange(val);
    else setInternalLemmasExpanded(val);
  };
  const setExamplesExpanded = (val: boolean) => {
    if (onExamplesExpandedChange) onExamplesExpandedChange(val);
    else setInternalExamplesExpanded(val);
  };
  const setLegalConstraintsExpanded = (val: boolean) => {
    if (onLegalConstraintsExpandedChange) onLegalConstraintsExpandedChange(val);
    else setInternalLegalConstraintsExpanded(val);
  };
  const setCausesExpanded = (val: boolean) => {
    if (onCausesExpandedChange) onCausesExpandedChange(val);
    else setInternalCausesExpanded(val);
  };
  const setEntailsExpanded = (val: boolean) => {
    if (onEntailsExpandedChange) onEntailsExpandedChange(val);
    else setInternalEntailsExpanded(val);
  };
  const setAlsoSeeExpanded = (val: boolean) => {
    if (onAlsoSeeExpandedChange) onAlsoSeeExpandedChange(val);
    else setInternalAlsoSeeExpanded(val);
  };

  // Helper function to remove POS prefix from lexfile
  const cleanLexfile = (lexfile: string): string => {
    return lexfile.replace(/^(verb|noun|adj|adv|satellite)\./i, '');
  };

  // Helper function to estimate text height based on content and width
  const estimateTextHeight = (text: string, width: number, fontSize: number = 13, lineHeight: number = 1.3): number => {
    const avgCharWidth = fontSize * 0.6;
    const availableWidth = width - 24;
    const charsPerLine = Math.floor(availableWidth / avgCharWidth);
    const lines = Math.ceil(text.length / charsPerLine);
    return Math.max(1, lines) * fontSize * lineHeight;
  };

  // Helper function to get Vendler class colors
  const getVendlerClassColor = (vendlerClass: 'state' | 'activity' | 'accomplishment' | 'achievement') => {
    const colors = {
      state: { bg: '#10b981', text: '#ffffff' },
      activity: { bg: '#3b82f6', text: '#ffffff' },
      accomplishment: { bg: '#f59e0b', text: '#ffffff' },
      achievement: { bg: '#ef4444', text: '#ffffff' },
    };
    return colors[vendlerClass];
  };

  // Calculate dynamic heights for current node sections
  const calculateNodeHeights = useCallback(() => {
    const nodeWidth = 600;
    const contentWidth = nodeWidth - 24;
    let height = 20; // Top padding
    height += 25; // Title height
    
    if (node.vendler_class) {
      height += 20;
    }
    
    height += 22; // Category badge
    
    if (node.frame) {
      height += 22;
    }
    
    const glossText = node.gloss || '';
    const glossHeight = glossText ? Math.max(40, estimateTextHeight(glossText, contentWidth, 14, 1.3) + 10) : 40;
    height += glossHeight;
    
    const allLemmas = node.lemmas || [];
    const srcLemmas = node.src_lemmas || [];
    const regularLemmas = allLemmas.filter(lemma => !srcLemmas.includes(lemma));
    const lemmasText = [...regularLemmas, ...srcLemmas].join('; ');
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
        const estimatedHeight = estimateTextHeight(exampleText, contentWidth);
        examplesHeight += Math.max(30, estimatedHeight + 10);
      }
      height += examplesHeight;
    }
    
    let rolesHeight = 20; // Always show Roles header
    if (rolesExpanded && node.roles && node.roles.length > 0) {
      node.roles.forEach(role => {
        const roleText = `${role.role_type.label}: ${role.description || 'No description'}`;
        const estimatedLines = Math.ceil(roleText.length / 60);
        const roleHeight = estimatedLines <= 2 ? 45 : 60;
        rolesHeight += roleHeight;
      });
    }
    height += rolesHeight;
    
    let legalConstraintsHeight = 0;
    if (node.legal_constraints && node.legal_constraints.length > 0) {
      legalConstraintsHeight = 20;
      if (legalConstraintsExpanded) {
        const constraintsText = `Legal Constraints: ${node.legal_constraints.join('; ')}`;
        const estimatedHeight = estimateTextHeight(constraintsText, contentWidth);
        legalConstraintsHeight += Math.max(25, estimatedHeight + 8);
      }
      height += legalConstraintsHeight;
    }
    
    let causesHeight = 0;
    if (node.causes && node.causes.length > 0) {
      causesHeight = 20;
      if (causesExpanded) {
        const causesText = `Causes: ${node.causes.map(c => c.id).join('; ')}`;
        const estimatedHeight = estimateTextHeight(causesText, contentWidth);
        causesHeight += Math.max(25, estimatedHeight + 8);
      }
      height += causesHeight;
    }
    
    let entailsHeight = 0;
    if (node.entails && node.entails.length > 0) {
      entailsHeight = 20;
      if (entailsExpanded) {
        const entailsText = `Entails: ${node.entails.map(e => e.id).join('; ')}`;
        const estimatedHeight = estimateTextHeight(entailsText, contentWidth);
        entailsHeight += Math.max(25, estimatedHeight + 8);
      }
      height += entailsHeight;
    }
    
    let alsoSeeHeight = 0;
    if (node.alsoSee && node.alsoSee.length > 0) {
      alsoSeeHeight = 20;
      if (alsoSeeExpanded) {
        const alsoSeeText = `Similar to: ${node.alsoSee.map(a => a.id).join('; ')}`;
        const estimatedHeight = estimateTextHeight(alsoSeeText, contentWidth);
        alsoSeeHeight += Math.max(25, estimatedHeight + 8);
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
      legalConstraintsHeight,
      causesHeight,
      entailsHeight,
      alsoSeeHeight
    };
  }, [node, rolesExpanded, lemmasExpanded, examplesExpanded, legalConstraintsExpanded, causesExpanded, entailsExpanded, alsoSeeExpanded]);

  const nodeWidth = 600;
  const nodeHeights = calculateNodeHeights();
  const nodeHeight = nodeHeights.totalHeight;
  const centerX = -nodeWidth / 2;
  const centerY = -nodeHeight / 2;
  
  const isForbiddenNode = node.forbidden;
  const isSourceNode = node.legacy_id.startsWith('src');
  
  const { glossHeight, lemmasHeight, examplesHeight, rolesHeight, legalConstraintsHeight } = nodeHeights;
  
  let sectionY = centerY + 55 + (node.vendler_class ? 20 : 0) + 22 + (node.frame ? 22 : 0) + glossHeight + lemmasHeight + examplesHeight + rolesHeight + legalConstraintsHeight;
  
  const causesY = sectionY;
  let causesHeight = 0;
  if (node.causes && node.causes.length > 0) {
    causesHeight = 20;
    if (causesExpanded) {
      const causesText = `Causes: ${node.causes.map(c => c.id).join('; ')}`;
      causesHeight += Math.max(25, estimateTextHeight(causesText, nodeWidth - 24) + 8);
    }
    sectionY += causesHeight;
  }
  
  const entailsY = sectionY;
  let entailsHeight = 0;
  if (node.entails && node.entails.length > 0) {
    entailsHeight = 20;
    if (entailsExpanded) {
      const entailsText = `Entails: ${node.entails.map(e => e.id).join('; ')}`;
      entailsHeight += Math.max(25, estimateTextHeight(entailsText, nodeWidth - 24) + 8);
    }
    sectionY += entailsHeight;
  }
  
  const alsoSeeY = sectionY;
  let alsoSeeHeight = 0;
  if (node.alsoSee && node.alsoSee.length > 0) {
    alsoSeeHeight = 20;
    if (alsoSeeExpanded) {
      const alsoSeeText = `Similar to: ${node.alsoSee.map(a => a.id).join('; ')}`;
      alsoSeeHeight += Math.max(25, estimateTextHeight(alsoSeeText, nodeWidth - 24) + 8);
    }
  }

  return (
    <Group
      top={y}
      left={x}
      onMouseEnter={() => setHoveredNodeId(node.id)}
      onMouseLeave={() => setHoveredNodeId(null)}
      style={{ cursor: 'pointer' }}
    >
      <defs>
        <filter id="nodeHoverShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.45" />
        </filter>
      </defs>
      
      <rect
        width={nodeWidth}
        height={nodeHeight}
        y={centerY}
        x={centerX}
        fill={isForbiddenNode ? '#fca5a5' : '#3b82f6'}
        stroke={isSourceNode ? '#000000' : (isForbiddenNode ? '#dc2626' : '#1e40af')}
        strokeWidth={3}
        rx={8}
        ry={8}
        style={{ cursor: 'pointer' }}
        filter={hoveredNodeId === node.id ? 'url(#nodeHoverShadow)' : undefined}
        onClick={() => onNodeClick(node.id)}
      />
      
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
        <tspan fontWeight="bold">{node.id.split('.v.')[0] || node.id}</tspan>
        <tspan fontWeight="normal" fontSize={14}> ({node.id})</tspan>
      </text>
      
      {/* Vendler Class Badge */}
      {node.vendler_class && (
        <g>
          <rect
            x={centerX + 12}
            y={centerY + 42}
            width={100}
            height={16}
            rx={3}
            fill={getVendlerClassColor(node.vendler_class).bg}
          />
          <text
            x={centerX + 62}
            y={centerY + 53}
            fontSize={10}
            fontFamily="Arial"
            textAnchor="middle"
            style={{ pointerEvents: 'none' }}
            fill={getVendlerClassColor(node.vendler_class).text}
            fontWeight="600"
          >
            {node.vendler_class.toUpperCase()}
          </text>
        </g>
      )}
      
      {/* Category Badge */}
      <foreignObject
        x={centerX + 12}
        y={centerY + (node.vendler_class ? 68 : 48)}
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
            color: 'white'
          }}>
            CATEGORY
          </span>
          <span style={{ fontWeight: '500', fontSize: '10px', color: 'white' }}>
            {cleanLexfile(node.lexfile).toUpperCase()}
          </span>
        </div>
      </foreignObject>
      
      {/* Frame Badge */}
      {node.frame && (
        <foreignObject
          x={centerX + 12}
          y={centerY + (node.vendler_class ? 90 : 70)}
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
            title={node.frame.short_definition}
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
              {node.frame.frame_name}
            </span>
            {node.frame.is_supporting_frame && (
              <span style={{ 
                fontSize: '9px',
                opacity: 0.8,
                fontStyle: 'italic'
              }}>
                (sup)
              </span>
            )}
          </div>
        </foreignObject>
      )}
      
      {/* Definition/gloss */}
      <foreignObject
        x={centerX + 12}
        y={centerY + 55 + (node.vendler_class ? 20 : 0) + 22 + (node.frame ? 22 : 0)}
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
          {node.gloss || 'No definition available'}
        </div>
      </foreignObject>
      
      {/* Lemmas */}
      {(() => {
        const allLemmas = node.lemmas || [];
        const srcLemmas = node.src_lemmas || [];
        const regularLemmas = allLemmas.filter(lemma => !srcLemmas.includes(lemma));
        const lemmasText = [...regularLemmas, ...srcLemmas].join('; ');
        
        if (!lemmasText) return null;
        
        return (
          <>
            <foreignObject
              x={centerX + 12}
              y={centerY + 55 + (node.vendler_class ? 20 : 0) + 22 + (node.frame ? 22 : 0) + glossHeight}
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
            
            {lemmasExpanded && (
              <foreignObject
                x={centerX + 12}
                y={centerY + 55 + (node.vendler_class ? 20 : 0) + 22 + (node.frame ? 22 : 0) + glossHeight + 20}
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
      
      {/* Examples */}
      {node.examples && node.examples.length > 0 && (
        <>
          <foreignObject
            x={centerX + 12}
            y={centerY + 55 + (node.vendler_class ? 20 : 0) + 22 + (node.frame ? 22 : 0) + glossHeight + lemmasHeight}
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
          
          {examplesExpanded && (
            <foreignObject
              x={centerX + 12}
              y={centerY + 55 + (node.vendler_class ? 20 : 0) + 22 + (node.frame ? 22 : 0) + glossHeight + lemmasHeight + 20}
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
                <span style={{ fontWeight: '400' }}>{node.examples.join('; ')}</span>
              </div>
            </foreignObject>
          )}
        </>
      )}
      
      {/* Roles */}
      {(() => {
        const rolesStartY = centerY + 55 + (node.vendler_class ? 20 : 0) + 22 + (node.frame ? 22 : 0) + glossHeight + lemmasHeight + examplesHeight;
        let currentRoleY = rolesStartY + 20;
        const roleElements: JSX.Element[] = [];
        
        if (rolesExpanded && node.roles && node.roles.length > 0) {
          sortRolesByPrecedence(node.roles).forEach((role, idx) => {
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
                  backgroundColor: role.main ? 'rgba(79, 70, 229, 0.4)' : 'rgba(79, 70, 229, 0.2)',
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
      
      {/* Legal Constraints */}
      {node.legal_constraints && node.legal_constraints.length > 0 && (() => {
        const legalConstraintsStartY = centerY + 55 + (node.vendler_class ? 20 : 0) + 22 + (node.frame ? 22 : 0) + glossHeight + lemmasHeight + examplesHeight + rolesHeight;
        
        return (
          <>
            <foreignObject
              x={centerX + 12}
              y={legalConstraintsStartY}
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
                onClick={() => setLegalConstraintsExpanded(!legalConstraintsExpanded)}
              >
                Legal Constraints: {legalConstraintsExpanded ? '▼' : '▶'}
              </div>
            </foreignObject>
            
            {legalConstraintsExpanded && (
              <foreignObject
                x={centerX + 12}
                y={legalConstraintsStartY + 20}
                width={nodeWidth - 24}
                height={legalConstraintsHeight - 20}
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
                  {node.legal_constraints.map((constraint, idx) => (
                    <span key={idx}>
                      <span style={{ fontWeight: '400' }}>{constraint}</span>
                      {idx < node.legal_constraints.length - 1 ? '; ' : ''}
                    </span>
                  ))}
                </div>
              </foreignObject>
            )}
          </>
        );
      })()}
      
      {/* Causes */}
      {node.causes && node.causes.length > 0 && (
        <>
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
                {node.causes.map((causeNode, idx) => (
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
                    {idx < node.causes.length - 1 ? '; ' : ''}
                  </span>
                ))}
              </div>
            </foreignObject>
          )}
        </>
      )}
      
      {/* Entails */}
      {node.entails && node.entails.length > 0 && (
        <>
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
                {node.entails.map((entailsNode, idx) => (
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
                    {idx < node.entails.length - 1 ? '; ' : ''}
                  </span>
                ))}
              </div>
            </foreignObject>
          )}
        </>
      )}
      
      {/* Similar to (Also See) */}
      {node.alsoSee && node.alsoSee.length > 0 && (
        <>
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
                {node.alsoSee.map((alsoSeeNode, idx) => (
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
                    {idx < node.alsoSee.length - 1 ? '; ' : ''}
                  </span>
                ))}
              </div>
            </foreignObject>
          )}
        </>
      )}
    </Group>
  );
}

// Export the height calculation function for use in layout calculations
export function calculateMainNodeHeight(
  node: GraphNode,
  lemmasExpanded: boolean = true,
  examplesExpanded: boolean = true,
  rolesExpanded: boolean = false,
  legalConstraintsExpanded: boolean = false,
  causesExpanded: boolean = false,
  entailsExpanded: boolean = false,
  alsoSeeExpanded: boolean = false
): number {
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
  height += 25; // Title
  if (node.vendler_class) height += 20;
  height += 22; // Category
  if (node.frame) height += 22;
  
  const glossText = node.gloss || '';
  const glossHeight = glossText ? Math.max(40, estimateTextHeight(glossText, contentWidth, 14, 1.3) + 10) : 40;
  height += glossHeight;
  
  const allLemmas = node.lemmas || [];
  const srcLemmas = node.src_lemmas || [];
  const regularLemmas = allLemmas.filter(lemma => !srcLemmas.includes(lemma));
  const lemmasText = [...regularLemmas, ...srcLemmas].join('; ');
  let lemmasHeight = 20;
  if (lemmasExpanded && lemmasText) {
    lemmasHeight += Math.max(30, estimateTextHeight(`Lemmas: ${lemmasText}`, contentWidth, 13) + 5);
  }
  height += lemmasHeight;
  
  if (node.examples && node.examples.length > 0) {
    let examplesHeight = 20;
    if (examplesExpanded) {
      const exampleText = `Examples: ${node.examples.join('; ')}`;
      examplesHeight += Math.max(30, estimateTextHeight(exampleText, contentWidth) + 10);
    }
    height += examplesHeight;
  }
  
  // Always include Roles header height; expand if roles exist and are expanded
  {
    let rolesHeight = 20;
    if (rolesExpanded && node.roles && node.roles.length > 0) {
      node.roles.forEach(role => {
        const roleText = `${role.role_type.label}: ${role.description || 'No description'}`;
        const estimatedLines = Math.ceil(roleText.length / 60);
        const roleHeight = estimatedLines <= 2 ? 45 : 60;
        rolesHeight += roleHeight;
      });
    }
    height += rolesHeight;
  }
  
  if (node.legal_constraints && node.legal_constraints.length > 0) {
    let legalConstraintsHeight = 20;
    if (legalConstraintsExpanded) {
      const constraintsText = `Legal Constraints: ${node.legal_constraints.join('; ')}`;
      legalConstraintsHeight += Math.max(25, estimateTextHeight(constraintsText, contentWidth) + 8);
    }
    height += legalConstraintsHeight;
  }
  
  if (node.causes && node.causes.length > 0) {
    let causesHeight = 20;
    if (causesExpanded) {
      const causesText = `Causes: ${node.causes.map(c => c.id).join('; ')}`;
      causesHeight += Math.max(25, estimateTextHeight(causesText, contentWidth) + 8);
    }
    height += causesHeight;
  }
  
  if (node.entails && node.entails.length > 0) {
    let entailsHeight = 20;
    if (entailsExpanded) {
      const entailsText = `Entails: ${node.entails.map(e => e.id).join('; ')}`;
      entailsHeight += Math.max(25, estimateTextHeight(entailsText, contentWidth) + 8);
    }
    height += entailsHeight;
  }
  
  if (node.alsoSee && node.alsoSee.length > 0) {
    let alsoSeeHeight = 20;
    if (alsoSeeExpanded) {
      const alsoSeeText = `Similar to: ${node.alsoSee.map(a => a.id).join('; ')}`;
      alsoSeeHeight += Math.max(25, estimateTextHeight(alsoSeeText, contentWidth) + 8);
    }
    height += alsoSeeHeight;
  }
  
  height += 20; // Bottom padding
  return height;
}

