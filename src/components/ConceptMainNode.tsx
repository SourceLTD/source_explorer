'use client';

import React, { useState } from 'react';
import { Group } from '@visx/group';
import { 
  ConceptGraphNode, 
  RecipeGraph,
  StateKind,
  sortRolesByPrecedence,
  posShortLabel,
  compareSensesByPos,
} from '@/lib/types';
import SenseArchetypeBadges from './SenseArchetypeBadges';
import { getPendingNodeStroke, getPendingNodeFill } from './PendingChangeIndicator';

export const CONCEPT_MAIN_NODE_FIXED_HEIGHT = 600;
export const CONCEPT_MAIN_NODE_WIDTH = 1000;

type RecipeGraphDisplayItem = { label: string; value: string };

const RECIPE_GRAPH_ROW_GAP = 2;
const RECIPE_GRAPH_ROW_MIN_HEIGHT = 28;
const RECIPE_GRAPH_ROW_FONT_SIZE = 12;
const RECIPE_GRAPH_ROW_LINE_HEIGHT = 1.4;

function buildRecipeGraphItems(recipeGraph: RecipeGraph): RecipeGraphDisplayItem[] {
  const items: RecipeGraphDisplayItem[] = [];

  if (recipeGraph.confidence) {
    items.push({
      label: 'Confidence',
      value: `${recipeGraph.confidence}${recipeGraph.confidence_reasoning ? ' — ' + recipeGraph.confidence_reasoning : ''}`,
    });
  }

  (recipeGraph.nodes || []).forEach((recipeNode) => {
    items.push({
      label: `[${recipeNode.node_type}] ${recipeNode.id}`,
      value: `${recipeNode.description}  (${recipeNode.keywords.join(', ')})`,
    });
  });

  (recipeGraph.edges || []).forEach((edge) => {
    items.push({
      label: `${edge.source} → ${edge.target}`,
      value: edge.label,
    });
  });

  return items;
}

function estimateRecipeGraphRowHeight(item: RecipeGraphDisplayItem, containerWidth: number): number {
  const text = `${item.label}: ${item.value}`;
  const avgCharWidth = RECIPE_GRAPH_ROW_FONT_SIZE * 0.58;
  const usableWidth = containerWidth - 16;
  const charsPerLine = Math.max(1, Math.floor(usableWidth / avgCharWidth));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  const textHeight = lines * RECIPE_GRAPH_ROW_FONT_SIZE * RECIPE_GRAPH_ROW_LINE_HEIGHT;
  return Math.max(RECIPE_GRAPH_ROW_MIN_HEIGHT, Math.ceil(textHeight + 6));
}

interface ConceptMainNodeProps {
  node: ConceptGraphNode;
  x: number;
  y: number;
  onNodeClick: (nodeId: string) => void;
  onEditClick?: () => void;
  onVisualizeRecipeGraph?: (recipeGraph: RecipeGraph) => void;
  controlledPropertiesExpanded?: boolean;
  controlledLexicalUnitsExpanded?: boolean;
  controlledRecipeGraphExpanded?: boolean;
  expandedSenses?: Set<string>;
  onPropertiesExpandedChange?: (expanded: boolean) => void;
  onLexicalUnitsExpandedChange?: (expanded: boolean) => void;
  onRecipeGraphExpandedChange?: (expanded: boolean) => void;
  onToggleSense?: (senseId: string) => void;
  onRoleMappingClick?: () => void;
  onClassifierGuidanceClick?: () => void;
  hasParent?: boolean;
  onStateKindChange?: (kind: StateKind | null) => Promise<void>;
}

// Layout constants for filler chips rendered under each property.
const FILLER_CHIP_HEIGHT = 18;
const FILLER_ROW_GAP = 4;
const FILLER_CONTAINER_TOP_GAP = 4;
const FILLER_CHIP_FONT_SIZE = 11;
const FILLER_CHIP_HORIZONTAL_PADDING = 12; // 6px each side
const FILLER_CHIP_GAP = 4;
const FILLER_AVG_CHAR_WIDTH = FILLER_CHIP_FONT_SIZE * 0.62;

function fillerChipLabel(c: { filler_type_label: string; concept_label: string | null }): string {
  return c.concept_label ?? c.filler_type_label;
}

function estimateFillerChipWidth(c: { filler_type_label: string; concept_label: string | null }): number {
  const label = fillerChipLabel(c);
  return Math.ceil(label.length * FILLER_AVG_CHAR_WIDTH) + FILLER_CHIP_HORIZONTAL_PADDING;
}

interface FillerChipProps {
  filler: {
    filler_type_id: number;
    filler_type_label: string;
    concept_id: string | null;
    concept_label: string | null;
  };
  onConceptClick?: (conceptId: string) => void;
}

function FillerChip({ filler, onConceptClick }: FillerChipProps) {
  const isConcept = !!filler.concept_id;
  const label = fillerChipLabel(filler);
  const interactive = isConcept && !!onConceptClick;

  const className = `filler-chip ${isConcept ? 'filler-chip--concept' : 'filler-chip--primitive'}${interactive ? ' filler-chip--interactive' : ''}`;

  return (
    <span
      className={className}
      title={
        isConcept
          ? `Filler concept: ${label} (${filler.concept_id})`
          : `Primitive filler type: ${label}`
      }
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              onConceptClick!(filler.concept_id!);
            }
          : undefined
      }
    >
      {label}
    </span>
  );
}

const FILLER_CHIP_STYLES = `
.filler-chip {
  display: inline-block;
  font-size: ${FILLER_CHIP_FONT_SIZE}px;
  line-height: ${FILLER_CHIP_HEIGHT}px;
  padding: 0 6px;
  border-radius: 9px;
  color: white;
  white-space: nowrap;
  border: 1px solid;
  transition: background-color 0.12s ease, border-color 0.12s ease;
}
.filler-chip--concept {
  font-weight: 600;
  background-color: rgba(167, 139, 250, 0.35);
  border-color: rgba(196, 181, 253, 0.7);
}
.filler-chip--primitive {
  font-weight: 500;
  font-style: italic;
  background-color: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.25);
  cursor: default;
}
.filler-chip--interactive { cursor: pointer; }
.filler-chip--interactive:hover {
  background-color: rgba(167, 139, 250, 0.65);
  border-color: rgba(221, 214, 254, 1);
  text-decoration: underline;
}
.filler-chip--primitive:hover {
  background-color: rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.5);
}
`;

function estimateFillerBlockHeight(
  fillers: { filler_type_label: string; concept_label: string | null }[],
  containerWidth: number
): number {
  if (!fillers || fillers.length === 0) return 0;
  // Account for the inline "Fillers:" label that precedes the chips.
  const labelWidth = Math.ceil('Fillers:'.length * (FILLER_CHIP_FONT_SIZE - 1) * 0.6) + 6;
  let rowWidth = labelWidth;
  let rows = 1;
  for (const f of fillers) {
    const w = estimateFillerChipWidth(f);
    const next = rowWidth + FILLER_CHIP_GAP + w;
    if (next > containerWidth && rowWidth > labelWidth) {
      rows += 1;
      rowWidth = w;
    } else {
      rowWidth = next;
    }
  }
  return FILLER_CONTAINER_TOP_GAP + rows * FILLER_CHIP_HEIGHT + (rows - 1) * FILLER_ROW_GAP + 4;
}

export default function ConceptMainNode({ 
  node, 
  x, 
  y, 
  onNodeClick,
  onEditClick,
  onVisualizeRecipeGraph,
  controlledPropertiesExpanded,
  controlledLexicalUnitsExpanded,
  controlledRecipeGraphExpanded,
  expandedSenses: controlledExpandedSenses,
  onPropertiesExpandedChange,
  onLexicalUnitsExpandedChange,
  onRecipeGraphExpandedChange,
  onToggleSense,
  onRoleMappingClick,
  onClassifierGuidanceClick,
  hasParent,
  onStateKindChange,
}: ConceptMainNodeProps) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [stateKindPickerOpen, setStateKindPickerOpen] = useState(false);
  const [stateKindSaving, setStateKindSaving] = useState(false);
  const [internalPropertiesExpanded, setInternalPropertiesExpanded] = useState<boolean>(true);
  const [internalLexicalUnitsExpanded, setInternalLexicalUnitsExpanded] = useState<boolean>(true);
  const [internalRecipeGraphExpanded, setInternalRecipeGraphExpanded] = useState<boolean>(false);
  const [internalExpandedSenses, setInternalExpandedSenses] = useState<Set<string>>(new Set());

  const propertiesExpanded = controlledPropertiesExpanded !== undefined ? controlledPropertiesExpanded : internalPropertiesExpanded;
  const lexicalUnitsExpanded = controlledLexicalUnitsExpanded !== undefined ? controlledLexicalUnitsExpanded : internalLexicalUnitsExpanded;
  const recipeGraphExpanded = controlledRecipeGraphExpanded !== undefined ? controlledRecipeGraphExpanded : internalRecipeGraphExpanded;
  const expandedSenses = controlledExpandedSenses !== undefined ? controlledExpandedSenses : internalExpandedSenses;

  const setPropertiesExpanded = (val: boolean) => {
    if (onPropertiesExpandedChange) onPropertiesExpandedChange(val);
    else setInternalPropertiesExpanded(val);
  };
  const setLexicalUnitsExpanded = (val: boolean) => {
    if (onLexicalUnitsExpandedChange) onLexicalUnitsExpandedChange(val);
    else setInternalLexicalUnitsExpanded(val);
  };
  const setRecipeGraphExpanded = (val: boolean) => {
    if (onRecipeGraphExpandedChange) onRecipeGraphExpandedChange(val);
    else setInternalRecipeGraphExpanded(val);
  };
  const toggleSense = (senseId: string) => {
    if (onToggleSense) {
      onToggleSense(senseId);
    } else {
      const newSet = new Set(internalExpandedSenses);
      if (newSet.has(senseId)) newSet.delete(senseId);
      else newSet.add(senseId);
      setInternalExpandedSenses(newSet);
    }
  };

  const nodeWidth = CONCEPT_MAIN_NODE_WIDTH;
  const nodeHeights = calculateConceptNodeHeights(node, propertiesExpanded, lexicalUnitsExpanded, recipeGraphExpanded, expandedSenses);
  const nodeHeight = Math.max(CONCEPT_MAIN_NODE_FIXED_HEIGHT, nodeHeights.totalHeight);
  const centerX = -nodeWidth / 2;
  // Anchor from a fixed top so expansion only extends downward
  const topY = -CONCEPT_MAIN_NODE_FIXED_HEIGHT / 2;
  
  const hasPendingChanges = !!node.pending;
  const pendingOperation = node.pending?.operation;
  
  const { 
    shortDefHeight, 
    glossHeight, 
    rolesHeight, 
    lexicalUnitsHeight,
    recipeGraphHeight,
  } = nodeHeights;
  
  let currentY = topY + 50 + shortDefHeight + glossHeight + 8;

  return (
    <Group
      top={y}
      left={x}
      onMouseEnter={() => setHoveredNodeId(node.id)}
      onMouseLeave={() => setHoveredNodeId(null)}
      style={{ cursor: 'pointer' }}
    >
      <style>{FILLER_CHIP_STYLES}</style>
      <rect
        width={nodeWidth}
        height={nodeHeight}
        y={topY}
        x={centerX}
        fill={
          hasPendingChanges && pendingOperation
            ? getPendingNodeFill(pendingOperation)
            : node.state_kind === 'grade'
              ? '#f97316'
              : '#3b82f6'
        }
        stroke={
          hasPendingChanges && pendingOperation
            ? getPendingNodeStroke(pendingOperation)
            : node.state_kind === 'grade'
              ? (hoveredNodeId === node.id ? '#fb923c' : '#ea580c')
              : (hoveredNodeId === node.id ? '#93c5fd' : '#1e40af')
        }
        strokeWidth={hoveredNodeId === node.id ? 4 : (hasPendingChanges ? 4 : 3)}
        rx={8}
        ry={8}
        style={{ cursor: 'pointer', transition: 'stroke 0.15s ease, stroke-width 0.15s ease' }}
        onClick={() => onNodeClick(node.id)}
      />
      
      <g>
      {/* Title */}
      <text
        x={hasPendingChanges && pendingOperation ? centerX + 92 : centerX + 12}
        y={topY + 35}
        fontSize={24}
        fontFamily="Arial"
        textAnchor="start"
        style={{ pointerEvents: 'none' }}
        fill="white"
      >
        <tspan fontWeight="bold">{node.label}</tspan>
        <tspan fontWeight="normal" fontSize={16}> ({node.id})</tspan>
      </text>

      {/* Pending changes indicator badge — rendered after title so it sits on top */}
      {hasPendingChanges && pendingOperation && (
        <g>
          <rect
            x={centerX + 8}
            y={topY + 16}
            width={75}
            height={22}
            rx={11}
            fill={getPendingNodeStroke(pendingOperation)}
          />
          <text
            x={centerX + 46}
            y={topY + 27}
            fontSize={10}
            fontFamily="Arial"
            textAnchor="middle"
            dominantBaseline="central"
            fill="white"
            fontWeight="600"
          >
            {pendingOperation === 'create' ? 'NEW' : pendingOperation === 'delete' ? 'DELETED' : 'MODIFIED'}
          </text>
        </g>
      )}
      
      {/* Category Badge - Not in screenshot, removing */}

      {/* State Kind Badge — next to the (id) in the title; click to open kind picker */}
      {(() => {
        const titleStartX = hasPendingChanges && pendingOperation ? centerX + 92 : centerX + 12;
        const labelWidth = node.label.length * 13.5;
        const idText = ` (${node.id})`;
        const idWidth = idText.length * 8.5;
        const badgeX = titleStartX + labelWidth + idWidth + 8;

        const STATE_KIND_OPTIONS: Array<{ kind: StateKind | null; label: string; color: string }> = [
          { kind: 'dimension', label: 'DIM',   color: '#8b5cf6' },
          { kind: 'grade',     label: 'GRADE', color: '#f97316' },
          { kind: 'taxon',     label: 'TAXON', color: '#6b7280' },
          { kind: null,        label: 'NONE',  color: '#374151' },
        ];

        const badgeWidth = node.state_kind === 'dimension' ? 68 : 46;
        const showEditBtn = !!onStateKindChange;

        const handlePickerSelect = async (kind: StateKind | null) => {
          if (!onStateKindChange || stateKindSaving) return;
          setStateKindPickerOpen(false);
          setStateKindSaving(true);
          try {
            await onStateKindChange(kind);
          } finally {
            setStateKindSaving(false);
          }
        };

        // Picker pill dimensions
        const pickerOptionW = 48;
        const pickerOptionH = 20;
        const pickerGap = 4;
        const pickerTotalW = STATE_KIND_OPTIONS.length * (pickerOptionW + pickerGap) - pickerGap;
        const pickerY = topY + 14;

        return (
          <g>
            {/* Current badge (always shown if state_kind set) */}
            {node.state_kind && (
              <g
                style={{ cursor: showEditBtn ? 'pointer' : 'default' }}
                onClick={showEditBtn ? (e) => { e.stopPropagation(); setStateKindPickerOpen(v => !v); } : undefined}
              >
                <rect
                  x={badgeX}
                  y={topY + 22}
                  width={badgeWidth}
                  height={18}
                  rx={9}
                  fill={node.state_kind === 'grade' ? '#f59e0b' : node.state_kind === 'dimension' ? '#8b5cf6' : '#6b7280'}
                />
                <text
                  x={badgeX + badgeWidth / 2}
                  y={topY + 31}
                  fontSize={9}
                  fontFamily="Arial"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="white"
                  fontWeight="600"
                  style={{ textTransform: 'uppercase', letterSpacing: '0.5px', pointerEvents: 'none' } as React.CSSProperties}
                >
                  {node.state_kind === 'grade' ? 'GRADE' : node.state_kind === 'dimension' ? 'DIMENSION' : 'TAXON'}
                </text>
              </g>
            )}

            {/* Toggle button — shown when no state_kind or next to badge */}
            {showEditBtn && (
              <g
                style={{ cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); setStateKindPickerOpen(v => !v); }}
              >
                <rect
                  x={badgeX + (node.state_kind ? badgeWidth + 4 : 0)}
                  y={topY + 22}
                  width={stateKindPickerOpen ? 18 : (node.state_kind ? 18 : 48)}
                  height={18}
                  rx={9}
                  fill={stateKindSaving ? 'rgba(255,255,255,0.15)' : stateKindPickerOpen ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)'}
                  stroke="rgba(255,255,255,0.4)"
                  strokeWidth={1}
                />
                <text
                  x={badgeX + (node.state_kind ? badgeWidth + 4 : 0) + (stateKindPickerOpen ? 9 : (node.state_kind ? 9 : 24))}
                  y={topY + 31}
                  fontSize={9}
                  fontFamily="Arial"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="white"
                  fontWeight="600"
                  style={{ pointerEvents: 'none' } as React.CSSProperties}
                >
                  {stateKindSaving ? '…' : stateKindPickerOpen ? '✕' : (node.state_kind ? '✎' : 'Set kind')}
                </text>
              </g>
            )}

            {/* Inline picker — shown when open */}
            {stateKindPickerOpen && showEditBtn && (
              <g>
                {/* backdrop */}
                <rect
                  x={badgeX - 4}
                  y={pickerY - 4}
                  width={pickerTotalW + 8}
                  height={pickerOptionH + 8}
                  rx={6}
                  fill="rgba(17,24,39,0.85)"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth={1}
                />
                {STATE_KIND_OPTIONS.map((opt, i) => {
                  const ox = badgeX + i * (pickerOptionW + pickerGap);
                  const isActive = node.state_kind === opt.kind;
                  return (
                    <g
                      key={opt.label}
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); void handlePickerSelect(opt.kind); }}
                    >
                      <rect
                        x={ox}
                        y={pickerY}
                        width={pickerOptionW}
                        height={pickerOptionH}
                        rx={10}
                        fill={isActive ? opt.color : 'rgba(255,255,255,0.1)'}
                        stroke={isActive ? 'white' : opt.color}
                        strokeWidth={isActive ? 1.5 : 1}
                      />
                      <text
                        x={ox + pickerOptionW / 2}
                        y={pickerY + pickerOptionH / 2}
                        fontSize={8}
                        fontFamily="Arial"
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={isActive ? 'white' : opt.color}
                        fontWeight="700"
                        style={{ pointerEvents: 'none', letterSpacing: '0.4px' } as React.CSSProperties}
                      >
                        {opt.label}
                      </text>
                    </g>
                  );
                })}
              </g>
            )}
          </g>
        );
      })()}
      
      {/* Short Definition */}
      {node.short_definition && (
        <foreignObject
          x={centerX + 12}
          y={topY + 50}
          width={nodeWidth - 24}
          height={shortDefHeight}
          style={{ overflow: 'hidden' }}
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
              cursor: 'pointer',
            }}
            onClick={() => onNodeClick(node.id)}
          >
            {node.short_definition}
          </div>
        </foreignObject>
      )}

      {/* Definition/gloss */}
      <foreignObject
        x={centerX + 12}
        y={topY + 50 + shortDefHeight}
        width={nodeWidth - 24}
        height={glossHeight}
        style={{ overflow: 'hidden' }}
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
            cursor: 'pointer',
          }}
          onClick={() => onNodeClick(node.id)}
        >
          {node.gloss || 'No definition available'}
        </div>
      </foreignObject>

      {/* Properties Section */}
      <g>
        <foreignObject
          x={centerX + 12}
          y={currentY}
          width={nodeWidth - 24}
          height={28}
          style={{ overflow: 'hidden' }}
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
            onClick={() => setPropertiesExpanded(!propertiesExpanded)}
          >
            {propertiesExpanded ? '▼' : '▶'} Properties ({node.properties?.length || 0})
          </div>
        </foreignObject>
        
        {propertiesExpanded && node.properties && node.properties.length > 0 && (
          <Group top={currentY + 28} left={centerX + 12}>
            {(() => {
              const sortedProperties = sortRolesByPrecedence(node.properties);
              const colGap = 8;
              const colWidth = (nodeWidth - 24 - colGap) / 2;
              let rowY = 0;

              const rows: { left: typeof sortedProperties[0]; right?: typeof sortedProperties[0] }[] = [];
              for (let i = 0; i < sortedProperties.length; i += 2) {
                rows.push({ left: sortedProperties[i], right: sortedProperties[i + 1] });
              }

              return rows.map((row, rowIdx) => {
                const leftText = `${row.left.label}: ${row.left.description || 'No description'}`;
                const rightText = row.right ? `${row.right.label}: ${row.right.description || 'No description'}` : '';
                const leftLines = Math.ceil(leftText.length / 50);
                const rightLines = row.right ? Math.ceil(rightText.length / 50) : 0;
                const leftBaseHeight = leftLines <= 2 ? 44 : 60;
                const rightBaseHeight = row.right ? (rightLines <= 2 ? 44 : 60) : 0;
                const cellInnerWidth = colWidth - 16; // padding
                const leftFillers = row.left.filler_constraints ?? [];
                const rightFillers = row.right?.filler_constraints ?? [];
                const leftFillerHeight = estimateFillerBlockHeight(leftFillers, cellInnerWidth);
                const rightFillerHeight = row.right ? estimateFillerBlockHeight(rightFillers, cellInnerWidth) : 0;
                const rowHeight = Math.max(
                  leftBaseHeight + leftFillerHeight,
                  rightBaseHeight + rightFillerHeight
                );
                const currentRowY = rowY;
                rowY += rowHeight + 4;

                const renderFillers = (
                  fillers: typeof leftFillers,
                ): React.ReactNode => {
                  if (!fillers || fillers.length === 0) return null;
                  return (
                    <div
                      style={{
                        marginTop: '6px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: `${FILLER_CHIP_GAP}px`,
                        alignItems: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          color: 'rgba(255,255,255,0.65)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.4px',
                          marginRight: '2px',
                        }}
                      >
                        Fillers:
                      </span>
                      {fillers.map((f, i) => (
                        <FillerChip
                          key={`${f.filler_type_id}-${f.concept_id ?? 'p'}-${i}`}
                          filler={f}
                          onConceptClick={onNodeClick}
                        />
                      ))}
                    </div>
                  );
                };

                return (
                  <g key={`role-row-${rowIdx}`}>
                    <foreignObject
                      x={0}
                      y={currentRowY}
                      width={colWidth}
                      height={rowHeight}
                      style={{ overflow: 'hidden' }}
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
                        cursor: 'pointer',
                      }}
                      onClick={() => onNodeClick(node.id)}
                      >
                        <span style={{ fontWeight: 'bold' }}>{row.left.label}:</span>{' '}
                        {row.left.description || 'No description'}
                        {renderFillers(leftFillers)}
                      </div>
                    </foreignObject>
                    {row.right && (
                      <foreignObject
                        x={colWidth + colGap}
                        y={currentRowY}
                        width={colWidth}
                        height={rowHeight}
                        style={{ overflow: 'hidden' }}
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
                          cursor: 'pointer',
                        }}
                        onClick={() => onNodeClick(node.id)}
                        >
                          <span style={{ fontWeight: 'bold' }}>{row.right.label}:</span>{' '}
                          {row.right.description || 'No description'}
                          {renderFillers(rightFillers)}
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

      {/* Senses Section — grouped view: each sense → its frame link + its LUs */}
      {node.senses && node.senses.length > 0 && (
        <g>
          <foreignObject
            x={centerX + 12}
            y={currentY}
            width={nodeWidth - 24}
            height={28}
            style={{ overflow: 'hidden' }}
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
              {lexicalUnitsExpanded ? '▼' : '▶'} Senses ({node.senses.length})
            </div>
          </foreignObject>

          {lexicalUnitsExpanded && (
            <Group top={currentY + 28} left={centerX + 12}>
              {(() => {
                const innerWidth = nodeWidth - 24;
                const colGap = 8;
                const colWidth = (innerWidth - colGap) / 2;
                const luRowGap = 4;
                  const senseHeaderHeight = 46;
                const senseGap = 0;
                const visibleSenses = node.senses.slice().sort(compareSensesByPos).slice(0, 15);

                let senseY = 0;
                return visibleSenses.map((sense, senseIdx) => {
                  const lus = sense.lexical_units ?? [];
                  const rows: { left: typeof lus[0]; right?: typeof lus[0] }[] = [];
                  for (let i = 0; i < lus.length; i += 2) {
                    rows.push({ left: lus[i], right: lus[i + 1] });
                  }
                  const startY = senseY;
                  const warning = sense.conceptWarning;
                  const headerBg =
                    warning === null ? 'rgba(255, 255, 255, 0.12)' : 'rgba(251, 191, 36, 0.25)';
                  const headerBorder =
                    warning === null ? 'rgba(255, 255, 255, 0.2)' : 'rgba(251, 191, 36, 0.6)';

                  const senseElements: React.ReactNode[] = [];
                  senseElements.push(
                    <foreignObject
                      key={`sense-header-${sense.id}`}
                      x={0}
                      y={startY}
                      width={innerWidth}
                      height={senseHeaderHeight}
                      style={{ overflow: 'hidden' }}
                    >
                      <div
                        style={{
                          fontSize: '12px',
                          fontFamily: 'Arial, sans-serif',
                          color: 'white',
                          padding: '5px 8px',
                          background: headerBg,
                          border: `1px solid ${headerBorder}`,
                          borderRadius: visibleSenses.length === 1 ? '4px' : (senseIdx === 0 ? (expandedSenses.has(sense.id) ? '4px' : '4px 4px 0 0') : (senseIdx === visibleSenses.length - 1 && !expandedSenses.has(sense.id) ? '0 0 4px 4px' : (expandedSenses.has(sense.id) ? '4px' : '0'))),
                          height: '100%',
                          boxSizing: 'border-box',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              color: '#bfdbfe',
                              backgroundColor: 'rgba(59, 130, 246, 0.4)',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              textTransform: 'uppercase' as const,
                              marginRight: 6,
                              marginTop: 1,
                              flexShrink: 0,
                            }}
                          >
                            {posShortLabel(sense.pos)}
                          </span>
                          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: 1 }}>
                            {sense.lemmas && sense.lemmas.length > 0 ? (
                              <span style={{ fontSize: 11, color: '#bfdbfe', fontStyle: 'italic', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.2' }}>
                                {sense.lemmas.join(', ')}
                              </span>
                            ) : null}
                            <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.2' }}>
                              {sense.definition || 'No definition'}
                            </span>
                          </div>
                        </div>

                        <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, marginLeft: 8, gap: 4 }}>
                          <SenseArchetypeBadges sense={sense} />
                          {lus.length > 0 && (
                            <span
                              style={{ 
                                cursor: 'pointer', 
                                padding: '2px 6px', 
                                borderRadius: '4px',
                                background: 'rgba(255,255,255,0.15)',
                                fontWeight: 600,
                                fontSize: 11,
                                color: '#bfdbfe'
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSense(sense.id);
                              }}
                            >
                              {expandedSenses.has(sense.id) ? 'Hide LUs' : `Show LUs (${lus.length})`}
                            </span>
                          )}
                          {warning === 'none' && <span style={{ color: '#fde68a', fontWeight: 600, marginLeft: 4, fontSize: 11 }}>⚠ no concept</span>}
                          {warning === 'multiple' && <span style={{ color: '#fde68a', fontWeight: 600, marginLeft: 4, fontSize: 11 }}>⚠ {sense.concepts.length} concepts</span>}
                        </span>
                      </div>
                    </foreignObject>
                  );
                  senseY += senseHeaderHeight;
                  if (!expandedSenses.has(sense.id) && senseIdx < visibleSenses.length - 1) {
                    senseY -= 1;
                  }

                  const renderLuCell = (lu: typeof lus[0], xPos: number, rowTop: number, rowH: number) => (
                    <foreignObject
                      key={lu.id}
                      x={xPos}
                      y={rowTop}
                      width={colWidth}
                      height={rowH}
                      style={{ overflow: 'hidden' }}
                    >
                      <div
                        style={{
                          fontSize: '14px',
                          fontFamily: 'Arial, sans-serif',
                          color: 'white',
                          padding: '5px 8px',
                          background: 'rgba(255, 255, 255, 0.1)',
                          borderRadius: '4px',
                          overflow: 'hidden',
                          height: '100%',
                          boxSizing: 'border-box',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#bfdbfe',
                            backgroundColor: 'rgba(59, 130, 246, 0.4)',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            textTransform: 'uppercase' as const,
                            marginRight: '6px',
                          }}
                        >
                          {lu.pos}
                        </span>
                        {lu.legacy_id && (
                          <span
                            style={{
                              fontSize: '12px',
                              fontWeight: 600,
                              color: '#bfdbfe',
                              marginRight: '6px',
                            }}
                          >
                            {lu.legacy_id}
                          </span>
                        )}
                        <span style={{ color: '#e0eaff' }}>
                          {(() => {
                            const all = [
                              ...(lu.src_lemmas || []).map(l => ({ text: l, src: true })),
                              ...(lu.lemmas || []).map(l => ({ text: l, src: false }))
                            ];
                            return (
                              <>
                                {all.slice(0, 4).map((item, i) => (
                                  <React.Fragment key={i}>
                                    {i > 0 && ', '}
                                    <span style={{ fontWeight: item.src ? 700 : 400 }}>{item.text}</span>
                                  </React.Fragment>
                                ))}
                                {all.length > 4 ? ', ...' : ''}
                              </>
                            );
                          })()}
                        </span>
                        {lu.gloss && (
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

                  if (expandedSenses.has(sense.id)) {
                    senseY += 4;
                    rows.forEach((row, rowIdx) => {
                      const leftHeight = estimateLuRowHeight(row.left, colWidth);
                      const rightHeight = row.right ? estimateLuRowHeight(row.right, colWidth) : 0;
                      const rowHeight = Math.max(leftHeight, rightHeight);
                      const rowTop = senseY;
                      senseElements.push(
                        <g key={`sense-${sense.id}-row-${rowIdx}`}>
                          {renderLuCell(row.left, 0, rowTop, rowHeight)}
                          {row.right && renderLuCell(row.right, colWidth + colGap, rowTop, rowHeight)}
                        </g>
                      );
                      senseY += rowHeight + luRowGap;
                    });
                  }

                  senseY += senseGap;
                  return <g key={`sense-${sense.id}-${senseIdx}`}>{senseElements}</g>;
                });
              })()}
              {node.senses.length > 15 && (
                <text
                  x={8}
                  y={lexicalUnitsHeight - 40}
                  fontSize={11}
                  fill="white"
                  style={{ opacity: 0.7 }}
                >
                  + {node.senses.length - 15} more senses
                </text>
              )}
            </Group>
          )}
        </g>
      )}
      {(() => { currentY += lexicalUnitsHeight > 0 ? lexicalUnitsHeight + 4 : 0; return null; })()}

      {/* Recipe Graph Section */}
      {node.recipe_graph && (
        <g>
          <foreignObject
            x={centerX + 12}
            y={currentY}
            width={nodeWidth - 24}
            height={28}
            style={{ overflow: 'hidden' }}
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
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              onClick={() => setRecipeGraphExpanded(!recipeGraphExpanded)}
            >
              <span>
                {recipeGraphExpanded ? '▼' : '▶'} Recipe Graph ({node.recipe_graph.nodes?.length || 0} nodes, {node.recipe_graph.edges?.length || 0} edges)
              </span>
              {onVisualizeRecipeGraph && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.25)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    onVisualizeRecipeGraph(node.recipe_graph!);
                  }}
                >
                  Visualize
                </span>
              )}
            </div>
          </foreignObject>
          
          {recipeGraphExpanded && (
            <Group top={currentY + 28} left={centerX + 12}>
              {(() => {
                const rg = node.recipe_graph!;
                const items = buildRecipeGraphItems(rg);

                let rowY = 0;
                return items.map((item, idx) => {
                  const rowHeight = estimateRecipeGraphRowHeight(item, nodeWidth - 24);
                  const y = rowY;
                  rowY += rowHeight + RECIPE_GRAPH_ROW_GAP;
                  return (
                    <foreignObject
                      key={`rg-item-${idx}`}
                      x={0}
                      y={y}
                      width={nodeWidth - 24}
                      height={rowHeight}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{
                        fontSize: '12px',
                        fontFamily: 'Arial, monospace',
                        color: 'white',
                        lineHeight: '1.4',
                        padding: '3px 8px',
                        backgroundColor: idx === 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                        borderRadius: '3px',
                        overflow: 'hidden',
                        height: '100%',
                        boxSizing: 'border-box',
                      }}>
                        <span style={{ fontWeight: 'bold', color: '#bfdbfe' }}>{item.label}:</span>{' '}
                        <span style={{ color: '#e0eaff' }}>{item.value}</span>
                      </div>
                    </foreignObject>
                  );
                });
              })()}
            </Group>
          )}
          {(() => { currentY += recipeGraphHeight + 4; return null; })()}
        </g>
      )}

      {/* Classifier Guidance Button */}
      {onClassifierGuidanceClick && node.classifier_guidance && (
        <g>
          <rect
            x={centerX + nodeWidth - 132}
            y={topY + 8}
            width={36}
            height={36}
            rx={6}
            fill="rgba(99, 102, 241, 0.9)"
            stroke="rgba(255, 255, 255, 0.9)"
            strokeWidth={2}
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              onClassifierGuidanceClick();
            }}
            onMouseEnter={(e) => {
              e.currentTarget.setAttribute('fill', 'rgba(67, 56, 202, 1)');
            }}
            onMouseLeave={(e) => {
              e.currentTarget.setAttribute('fill', 'rgba(99, 102, 241, 0.9)');
            }}
          >
            <title>View classifier guidance</title>
          </rect>
          <g
            style={{ pointerEvents: 'none' }}
            transform={`translate(${centerX + nodeWidth - 114}, ${topY + 26}) scale(0.75)`}
          >
            <g transform="translate(-12, -12)">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                stroke="white"
                fill="none"
                d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
              />
            </g>
          </g>
        </g>
      )}

      {/* Role Mapping Button - Next to Edit Button */}
      {onRoleMappingClick && (
        <g>
          <rect
            x={centerX + nodeWidth - 88}
            y={topY + 8}
            width={36}
            height={36}
            rx={6}
            fill={hasParent
              ? (node.state_kind === 'grade' ? "rgba(249, 115, 22, 0.95)" : "rgba(59, 130, 246, 0.95)")
              : "rgba(156, 163, 175, 0.95)"}
            stroke="rgba(255, 255, 255, 0.9)"
            strokeWidth={2}
            style={{ cursor: hasParent ? 'pointer' : 'not-allowed' }}
            onClick={(e) => {
              e.stopPropagation();
              if (hasParent) onRoleMappingClick();
            }}
            onMouseEnter={(e) => {
              if (hasParent) e.currentTarget.setAttribute('fill', node.state_kind === 'grade' ? 'rgba(234, 88, 12, 1)' : 'rgba(29, 78, 216, 1)');
            }}
            onMouseLeave={(e) => {
              if (hasParent) e.currentTarget.setAttribute('fill', node.state_kind === 'grade' ? 'rgba(249, 115, 22, 0.95)' : 'rgba(59, 130, 246, 0.95)');
            }}
          >
            <title>{hasParent ? "View role mappings from parent concepts" : "No parent concepts to map roles from"}</title>
          </rect>
          <g
            style={{ pointerEvents: 'none' }}
            transform={`translate(${centerX + nodeWidth - 70}, ${topY + 26}) scale(0.75)`}
          >
            <g transform="translate(-12, -12)">
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2.5}
                stroke="white"
                fill="none"
                d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" 
              />
            </g>
          </g>
        </g>
      )}

      {/* Edit Button - Top Right */}
      {onEditClick && (
        <g>
          <rect
            x={centerX + nodeWidth - 44}
            y={topY + 8}
            width={36}
            height={36}
            rx={6}
            fill={node.state_kind === 'grade' ? "rgba(249, 115, 22, 0.95)" : "rgba(59, 130, 246, 0.95)"}
            stroke="rgba(255, 255, 255, 0.9)"
            strokeWidth={2}
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              onEditClick();
            }}
            onMouseEnter={(e) => {
              e.currentTarget.setAttribute('fill', node.state_kind === 'grade' ? 'rgba(234, 88, 12, 1)' : 'rgba(29, 78, 216, 1)');
            }}
            onMouseLeave={(e) => {
              e.currentTarget.setAttribute('fill', node.state_kind === 'grade' ? 'rgba(249, 115, 22, 0.95)' : 'rgba(59, 130, 246, 0.95)');
            }}
          >
            <title>Edit concept details</title>
          </rect>
          <g
            style={{ pointerEvents: 'none' }}
            transform={`translate(${centerX + nodeWidth - 26}, ${topY + 26}) scale(0.75)`}
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
      </g>
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
export function calculateConceptNodeHeights(
  node: ConceptGraphNode,
  rolesExpanded: boolean = true,
  lexicalUnitsExpanded: boolean = true,
  recipeGraphExpanded: boolean = false,
  expandedSenses: Set<string> = new Set()
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

  // Properties section (two columns)
  let rolesHeight = 28;
  if (rolesExpanded && node.properties && node.properties.length > 0) {
    const visibleRoles = node.properties;
    const colGap = 8;
    const colWidth = (contentWidth - colGap) / 2;
    const cellInnerWidth = colWidth - 16;
    for (let i = 0; i < visibleRoles.length; i += 2) {
      const leftText = `${visibleRoles[i].label}: ${visibleRoles[i].description || 'No description'}`;
      const leftLines = Math.ceil(leftText.length / 50);
      const leftBase = leftLines <= 2 ? 44 : 60;
      const leftFillerHeight = estimateFillerBlockHeight(
        visibleRoles[i].filler_constraints ?? [],
        cellInnerWidth
      );
      const leftHeight = leftBase + leftFillerHeight;
      let rightHeight = 0;
      if (visibleRoles[i + 1]) {
        const rightText = `${visibleRoles[i + 1].label}: ${visibleRoles[i + 1].description || 'No description'}`;
        const rightLines = Math.ceil(rightText.length / 50);
        const rightBase = rightLines <= 2 ? 44 : 60;
        const rightFillerHeight = estimateFillerBlockHeight(
          visibleRoles[i + 1].filler_constraints ?? [],
          cellInnerWidth
        );
        rightHeight = rightBase + rightFillerHeight;
      }
      rolesHeight += Math.max(leftHeight, rightHeight) + 4;
    }
  }
  height += rolesHeight + 4;

  // Senses section (each sense renders a header + its LUs as a 2-col grid)
  let lexicalUnitsHeight = 0;
  const senses = node.senses || [];
  if (senses.length > 0) {
    lexicalUnitsHeight = 28;
    if (lexicalUnitsExpanded) {
      const luRowGap = 4;
      const colGap = 8;
      const colWidth = (contentWidth - colGap) / 2;
                  const senseHeaderHeight = 46;
      const senseGap = 0;
      const visibleSenses = senses.slice(0, 15);
      for (let senseIdx = 0; senseIdx < visibleSenses.length; senseIdx++) {
        const sense = visibleSenses[senseIdx];
        lexicalUnitsHeight += senseHeaderHeight;
        if (!expandedSenses.has(sense.id) && senseIdx < visibleSenses.length - 1) {
          lexicalUnitsHeight -= 1;
        }
        
        const lus = sense.lexical_units ?? [];
        if (expandedSenses.has(sense.id)) {
          lexicalUnitsHeight += 4;
          if (lus.length === 0) {
            lexicalUnitsHeight += 22 + luRowGap;
          } else {
            for (let i = 0; i < lus.length; i += 2) {
              const leftHeight = estimateLuRowHeight(lus[i], colWidth);
              const rightHeight = lus[i + 1] ? estimateLuRowHeight(lus[i + 1], colWidth) : 0;
              lexicalUnitsHeight += Math.max(leftHeight, rightHeight) + luRowGap;
            }
          }
        }
        lexicalUnitsHeight += senseGap;
      }
      lexicalUnitsHeight += 8;
      if (senses.length > 15) lexicalUnitsHeight += 25;
    }
    height += lexicalUnitsHeight + 4;
  }

  // Recipe graph section
  let recipeGraphHeight = 0;
  if (node.recipe_graph) {
    recipeGraphHeight = 28;
    if (recipeGraphExpanded) {
      const items = buildRecipeGraphItems(node.recipe_graph);
      for (const item of items) {
        recipeGraphHeight += estimateRecipeGraphRowHeight(item, contentWidth) + RECIPE_GRAPH_ROW_GAP;
      }
      recipeGraphHeight += 8;
    }
    height += recipeGraphHeight + 4;
  }

  height += 20;
  
  return {
    totalHeight: height,
    shortDefHeight,
    glossHeight,
    rolesHeight,
    lexicalUnitsHeight,
    recipeGraphHeight,
  };
}

export function calculateConceptMainNodeHeight(
  node: ConceptGraphNode,
  rolesExpanded: boolean = true,
  lexicalUnitsExpanded: boolean = true,
  recipeGraphExpanded: boolean = false,
  expandedSenses: Set<string> = new Set()
): number {
  return calculateConceptNodeHeights(node, rolesExpanded, lexicalUnitsExpanded, recipeGraphExpanded, expandedSenses).totalHeight;
}

