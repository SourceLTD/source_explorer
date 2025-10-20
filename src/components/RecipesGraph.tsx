'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Group } from '@visx/group';
import { LinearGradient } from '@visx/gradient';
import { GraphNode, Recipe, RecipePredicateNode, RoleType } from '@/lib/types';
import GraphMainNode, { calculateMainNodeHeight } from './GraphMainNode';

interface RecipesGraphProps {
  currentNode: GraphNode;
  recipes: Recipe[];
  selectedRecipeId?: string;
  onSelectRecipe: (recipeId: string) => void;
  onNodeClick: (nodeId: string) => void;
}

const colors = {
  current: { fill: '#3b82f6', stroke: '#1e40af' },
  predicate: { fill: '#6b7280', stroke: '#374151' },
  link: '#4b5563',
  arrow: '#374151',
  background: '#ffffff',
  forbiddenNode: '#fca5a5',
  forbiddenStroke: '#dc2626',
};

export default function RecipesGraph({ currentNode, recipes, selectedRecipeId, onSelectRecipe, onNodeClick }: RecipesGraphProps) {
  const [, setHoveredId] = useState<string | null>(null);
  const [roleTypes, setRoleTypes] = useState<RoleType[]>([]);
  
  // Track expansion states for main node to calculate correct layout
  const [rolesExpanded, setRolesExpanded] = useState<boolean>(false);
  const [lemmasExpanded, setLemmasExpanded] = useState<boolean>(true);
  const [examplesExpanded, setExamplesExpanded] = useState<boolean>(true);
  const [legalConstraintsExpanded, setLegalConstraintsExpanded] = useState<boolean>(false);
  const [causesExpanded, setCausesExpanded] = useState<boolean>(false);
  const [entailsExpanded, setEntailsExpanded] = useState<boolean>(false);
  const [alsoSeeExpanded, setAlsoSeeExpanded] = useState<boolean>(false);

  // Fetch role types for tooltips
  useEffect(() => {
    const fetchRoleTypes = async () => {
      try {
        const response = await fetch('/api/role-types');
        if (response.ok) {
          const data = await response.json();
          setRoleTypes(data);
        }
      } catch (error) {
        console.error('Failed to fetch role types:', error);
      }
    };
    fetchRoleTypes();
  }, []);

  const activeRecipe = useMemo(() => {
    if (!recipes || recipes.length === 0) return null;
    if (selectedRecipeId) return recipes.find(r => r.id === selectedRecipeId) || recipes[0];
    return recipes[0];
  }, [recipes, selectedRecipeId]);

  const activeRecipeIndex = useMemo(() => {
    if (!activeRecipe || !recipes || recipes.length === 0) return -1;
    return recipes.findIndex(r => r.id === activeRecipe.id);
  }, [activeRecipe, recipes]);

  const handlePrevRecipe = () => {
    if (!recipes || recipes.length === 0 || activeRecipeIndex === -1) return;
    const prevIndex = (activeRecipeIndex - 1 + recipes.length) % recipes.length;
    onSelectRecipe(recipes[prevIndex].id);
  };

  const handleNextRecipe = () => {
    if (!recipes || recipes.length === 0 || activeRecipeIndex === -1) return;
    const nextIndex = (activeRecipeIndex + 1) % recipes.length;
    onSelectRecipe(recipes[nextIndex].id);
  };

  // Helper to get role type info for tooltip
  const getRoleInfo = (roleLabel: string): RoleType | undefined => {
    return roleTypes.find(rt => rt.label === roleLabel);
  };

  const layout = useMemo(() => {
    const width = 900;
    const margin = 40;
    const centerX = width / 2;

    // Current node - use shared height calculation with current expansion states
    const currentNodeWidth = 600;
    const currentNodeHeight = calculateMainNodeHeight(
      currentNode,
      lemmasExpanded,
      examplesExpanded,
      rolesExpanded,
      legalConstraintsExpanded,
      causesExpanded,
      entailsExpanded,
      alsoSeeExpanded
    );
    const centerY = margin + currentNodeHeight / 2;

    const nodes: Array<{ type: 'current' | 'predicate'; x: number; y: number; width: number; height: number; node: GraphNode | RecipePredicateNode }> = [];
    const edges: Array<{ from: { x: number; y: number; fromEdge: 'bottom' | 'right' | 'left' }; to: { x: number; y: number; toEdge: 'top' | 'right' | 'left' }; label: string } > = [];

    nodes.push({ type: 'current', x: centerX, y: centerY, width: currentNodeWidth, height: currentNodeHeight, node: currentNode });

    if (activeRecipe) {
      // Arrange predicates in grid below, centered
      const predicateTop = centerY + currentNodeHeight / 2 + 80;
      const predicateHeight = 160;
      const horizontalGap = 120; // Doubled for much better arrow visibility
      const verticalGap = 160; // Doubled vertical gap too
      const maxRowWidth = width - 2 * margin;

      const predicatePositions: Record<string, { x: number; y: number; width: number; height: number }> = {};
      
      // Create a map of predicate ID to group ID
      const predicateToGroup = new Map<string, string>();
      const groupedPredicateIds = new Set<string>();
      
      activeRecipe.predicate_groups.forEach(group => {
        group.predicate_ids.forEach(predId => {
          predicateToGroup.set(predId, group.id);
          groupedPredicateIds.add(predId);
        });
      });
      
      // Organize predicates: group members together, then ungrouped ones
      const predicatesByGroup = new Map<string, typeof activeRecipe.predicates>();
      activeRecipe.predicate_groups.forEach(group => {
        const predsInGroup = activeRecipe.predicates.filter(p => group.predicate_ids.includes(p.id));
        predicatesByGroup.set(group.id, predsInGroup);
      });
      
      // Build ordered list: groups first (as units), then ungrouped predicates
      const orderedItems: Array<{ type: 'group'; groupId: string; predicates: typeof activeRecipe.predicates } | { type: 'single'; predicate: RecipePredicateNode }> = [];
      
      // Track which groups we've added
      const addedGroups = new Set<string>();
      
      // Go through predicates in order and add groups as units when we encounter their first member
      for (const pred of activeRecipe.predicates) {
        const groupId = predicateToGroup.get(pred.id);
        
        if (groupId && !addedGroups.has(groupId)) {
          // Add the entire group as a unit
          addedGroups.add(groupId);
          const predsInGroup = predicatesByGroup.get(groupId) || [];
          orderedItems.push({ type: 'group', groupId, predicates: predsInGroup });
        } else if (!groupId) {
          // Add ungrouped predicate
          orderedItems.push({ type: 'single', predicate: pred });
        }
        // Skip if we've already added this group
      }
      
      // First pass: calculate rows and their widths, treating groups as single units
      const rows: Array<{ items: typeof orderedItems; totalWidth: number }> = [];
      let currentRow: typeof orderedItems = [];
      let currentRowWidth = 0;

      for (const item of orderedItems) {
        let itemWidth: number;
        
        if (item.type === 'group') {
          // Calculate max width for grouped predicates (they'll be stacked vertically)
          const groupWidths = item.predicates.map(p => {
            const title = p.lexical.id;
            const textLen = Math.min(24, title.length);
            return Math.max(220, Math.min(360, textLen * 10 + 100));
          });
          itemWidth = Math.max(...groupWidths) + 20; // Add padding for group border
        } else {
          const title = item.predicate.lexical.id;
          const textLen = Math.min(24, title.length);
          itemWidth = Math.max(220, Math.min(360, textLen * 10 + 100));
        }
        
        const widthWithGap = currentRow.length > 0 ? itemWidth + horizontalGap : itemWidth;
        
        if (currentRow.length > 0 && currentRowWidth + widthWithGap > maxRowWidth) {
          // Start new row
          rows.push({ items: currentRow, totalWidth: currentRowWidth });
          currentRow = [item];
          currentRowWidth = itemWidth;
        } else {
          currentRow.push(item);
          currentRowWidth += widthWithGap;
        }
      }
      if (currentRow.length > 0) {
        rows.push({ items: currentRow, totalWidth: currentRowWidth });
      }

      // Second pass: position nodes centered in each row
      let rowY = predicateTop;
      for (const row of rows) {
        const rowStartX = centerX - row.totalWidth / 2;
        let currentX = rowStartX;
        
        for (const item of row.items) {
          if (item.type === 'group') {
            // Position all predicates in the group vertically stacked
            let groupY = rowY;
            const verticalGapInGroup = 20; // Smaller gap within group
            
            // Calculate max width - all predicates in group will use this same width
            const groupWidths = item.predicates.map(p => {
              const title = p.lexical.id;
              const textLen = Math.min(24, title.length);
              return Math.max(220, Math.min(360, textLen * 10 + 100));
            });
            const maxGroupWidth = Math.max(...groupWidths);
            
            for (const pred of item.predicates) {
              const nodeX = currentX + maxGroupWidth / 2 + 10; // Center within max width, add padding for group border
              const nodeY = groupY + predicateHeight / 2 + 10; // Add padding for group border
              
              // All predicates in the group use maxGroupWidth for consistency
              nodes.push({ type: 'predicate', x: nodeX, y: nodeY, width: maxGroupWidth, height: predicateHeight, node: pred });
              predicatePositions[pred.id] = { x: nodeX, y: nodeY, width: maxGroupWidth, height: predicateHeight };
              
              groupY += predicateHeight + verticalGapInGroup;
            }
            
            currentX += maxGroupWidth + 20 + horizontalGap; // Add padding for group border
          } else {
            // Position single ungrouped predicate
            const pred = item.predicate;
            const title = pred.lexical.id;
            const textLen = Math.min(24, title.length);
            const predWidth = Math.max(220, Math.min(360, textLen * 10 + 100));
            
            const nodeX = currentX + predWidth / 2;
            const nodeY = rowY + predicateHeight / 2;
            
            nodes.push({ type: 'predicate', x: nodeX, y: nodeY, width: predWidth, height: predicateHeight, node: pred });
            predicatePositions[pred.id] = { x: nodeX, y: nodeY, width: predWidth, height: predicateHeight };
            
            currentX += predWidth + horizontalGap;
          }
        }
        
        // Calculate max height in this row (important when groups are stacked vertically)
        let maxRowHeight = predicateHeight;
        for (const item of row.items) {
          if (item.type === 'group') {
            const verticalGapInGroup = 20;
            const groupHeight = item.predicates.length * predicateHeight + (item.predicates.length - 1) * verticalGapInGroup + 20; // Add padding
            maxRowHeight = Math.max(maxRowHeight, groupHeight);
          }
        }
        rowY += maxRowHeight + verticalGap;
      }

      // Build edges between predicates with proper endpoints
      for (const rel of activeRecipe.relations) {
        const from = predicatePositions[rel.sourcePredicateId];
        const to = predicatePositions[rel.targetPredicateId];
        if (from && to) {
          // Calculate edge endpoints to avoid node overlap
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const angle = Math.atan2(dy, dx);
          
          // Add extra padding so arrow doesn't touch nodes
          const padding = 15;
          
          // Start from edge of source node with padding
          const fromX = from.x + Math.cos(angle) * (from.width / 2 + padding);
          const fromY = from.y + Math.sin(angle) * (from.height / 2 + padding);
          
          // End at edge of target node with padding
          const toX = to.x - Math.cos(angle) * (to.width / 2 + padding);
          const toY = to.y - Math.sin(angle) * (to.height / 2 + padding);
          
          edges.push({ 
            from: { x: fromX, y: fromY, fromEdge: dy > 0 ? 'bottom' : (dx > 0 ? 'right' : 'left') }, 
            to: { x: toX, y: toY, toEdge: dy > 0 ? 'top' : (dx > 0 ? 'left' : 'right') }, 
            label: rel.relation_type 
          });
        }
      }
    }

    const height = nodes.reduce((h, n) => Math.max(h, n.y + n.height / 2 + margin), centerY + currentNodeHeight / 2 + margin);
    return { width, height, nodes, edges };
  }, [currentNode, activeRecipe, lemmasExpanded, examplesExpanded, rolesExpanded, legalConstraintsExpanded, causesExpanded, entailsExpanded, alsoSeeExpanded]);

  return (
    <div className="w-full h-full flex items-start justify-center pt-4">
      <svg width={layout.width} height={layout.height}>
        <LinearGradient id="recipes-link-gradient" from={colors.link} to={colors.link} />
        <defs>
          <marker id="arrow" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M 0 0 L 12 6 L 0 12 z" fill={colors.arrow} />
          </marker>
        </defs>
        <rect width={layout.width} height={layout.height} rx={14} fill={colors.background} stroke="none" />

        {/* Recipe toggle under main node */}
        {recipes && recipes.length > 1 && (() => {
          const currentLayoutNode = layout.nodes.find(n => n.type === 'current');
          if (!currentLayoutNode) return null;
          const overlayWidth = currentLayoutNode.width; // align with main node width
          const overlayHeight = 28;
          const overlayX = currentLayoutNode.x - overlayWidth / 2;
          const overlayY = currentLayoutNode.y + currentLayoutNode.height / 2 + 35; // space below main node, above predicates
          const canToggle = recipes.length > 1;
          const title = activeRecipe?.label || activeRecipe?.id || 'Recipe';
          return (
            <foreignObject x={overlayX} y={overlayY} width={overlayWidth} height={overlayHeight}>
              <div className="flex items-center justify-center gap-3 select-none" style={{ pointerEvents: 'auto' }}>
                <button
                  type="button"
                  onClick={handlePrevRecipe}
                  disabled={!canToggle}
                  className="h-7 w-7 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  aria-label="Previous recipe"
                  title="Previous recipe"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <div className="px-2 text-sm font-medium text-gray-800 truncate max-w-[70%]" title={title}>
                  {title}
                </div>
                <button
                  type="button"
                  onClick={handleNextRecipe}
                  disabled={!canToggle}
                  className="h-7 w-7 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  aria-label="Next recipe"
                  title="Next recipe"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            </foreignObject>
          );
        })()}

        {/* Edges */}
        {layout.edges.map((edge, i) => (
          <g key={`edge-${i}`}>
            <line
              x1={edge.from.x}
              y1={edge.from.y}
              x2={edge.to.x}
              y2={edge.to.y}
              stroke={colors.link}
              strokeWidth={3}
              markerEnd="url(#arrow)"
            />
            <text x={(edge.from.x + edge.to.x) / 2} y={(edge.from.y + edge.to.y) / 2 - 8} fontSize={12} fontFamily="Arial" textAnchor="middle" fill="#374151" fontWeight="600">
              {edge.label}
            </text>
          </g>
        ))}

        {/* Predicate Group Borders */}
        {activeRecipe && activeRecipe.predicate_groups && activeRecipe.predicate_groups.map((group) => {
          // Find all predicates in this group and calculate bounding box
          const groupPredicateNodes = layout.nodes.filter(n => 
            n.type === 'predicate' && group.predicate_ids.includes((n.node as RecipePredicateNode).id)
          );
          
          if (groupPredicateNodes.length === 0) return null;
          
          // Calculate bounding box
          const padding = 10;
          const minX = Math.min(...groupPredicateNodes.map(n => n.x - n.width / 2)) - padding;
          const maxX = Math.max(...groupPredicateNodes.map(n => n.x + n.width / 2)) + padding;
          const minY = Math.min(...groupPredicateNodes.map(n => n.y - n.height / 2)) - padding;
          const maxY = Math.max(...groupPredicateNodes.map(n => n.y + n.height / 2)) + padding;
          
          const boxWidth = maxX - minX;
          const boxHeight = maxY - minY;
          
          return (
            <g key={`group-${group.id}`}>
              {/* Border around group */}
              <rect
                x={minX}
                y={minY}
                width={boxWidth}
                height={boxHeight}
                fill="none"
                stroke="rgba(0, 0, 0, 0.7)"
                strokeWidth={2}
                rx={5}
              />
              {/* "oneOf" label that interrupts the border */}
              <rect
                x={minX + 8}
                y={minY - 6}
                width={32}
                height={12}
                fill={colors.background}
              />
              <text
                x={minX + 24}
                y={minY + 3}
                fontSize="10"
                fill="rgba(0, 0, 0, 0.7)"
                fontWeight="bold"
                textAnchor="middle"
              >
                oneOf
              </text>
            </g>
          );
        })}

        <Group>
          {layout.nodes.map((n, idx) => {
            if (n.type === 'current') {
              const gn = n.node as GraphNode;
              return (
                <GraphMainNode
                  key={`node-${idx}`}
                  node={gn}
                  x={n.x}
                  y={n.y}
                  onNodeClick={onNodeClick}
                  controlledRolesExpanded={rolesExpanded}
                  controlledLemmasExpanded={lemmasExpanded}
                  controlledExamplesExpanded={examplesExpanded}
                  controlledLegalConstraintsExpanded={legalConstraintsExpanded}
                  controlledCausesExpanded={causesExpanded}
                  controlledEntailsExpanded={entailsExpanded}
                  controlledAlsoSeeExpanded={alsoSeeExpanded}
                  onRolesExpandedChange={setRolesExpanded}
                  onLemmasExpandedChange={setLemmasExpanded}
                  onExamplesExpandedChange={setExamplesExpanded}
                  onLegalConstraintsExpandedChange={setLegalConstraintsExpanded}
                  onCausesExpandedChange={setCausesExpanded}
                  onEntailsExpandedChange={setEntailsExpanded}
                  onAlsoSeeExpandedChange={setAlsoSeeExpanded}
                />
              );
            }

            const pred = n.node as RecipePredicateNode;
            const centerX = -n.width / 2;
            const centerY = -n.height / 2;
            return (
              <Group key={`node-${idx}`} top={n.y} left={n.x} onMouseEnter={() => setHoveredId(pred.id)} onMouseLeave={() => setHoveredId(null)} style={{ cursor: 'pointer' }}>
                <rect
                  width={n.width}
                  height={n.height}
                  y={centerY}
                  x={centerX}
                  fill={colors.predicate.fill}
                  stroke={colors.predicate.stroke}
                  strokeWidth={2}
                  rx={6}
                  ry={6}
                  onClick={() => onNodeClick(pred.lexical.id)}
                />
                <text x={centerX + 10} y={centerY + 20} fontSize={13} fontFamily="Arial" textAnchor="start" fill="white">
                  <tspan fontWeight="bold">{pred.lexical.id.split('.v.')[0] || pred.lexical.id}</tspan>
                  <tspan fontWeight="normal" fontSize={11}> ({pred.lexical.id})</tspan>
                </text>
                <foreignObject x={centerX + 10} y={centerY + 28} width={n.width - 20} height={34}>
                  <div style={{ fontSize: '12px', color: 'white', lineHeight: '1.25', overflow: 'hidden', wordWrap: 'break-word', fontStyle: 'italic' }}>
                    {pred.lexical.gloss}
                  </div>
                </foreignObject>
                {pred.roleMappings && pred.roleMappings.length > 0 && (() => {
                  const baseY = centerY + 70;
                  const lineHeight = 14;
                  return (
                    <>
                      {pred.roleMappings.map((m, i) => {
                        const y = baseY + i * lineHeight;
                        const predicateRoleInfo = getRoleInfo(m.predicateRoleLabel);
                        
                        let targetDisplay = '';
                        let targetDescription = '';
                        
                        if (m.bindKind === 'role' && m.entryRoleLabel) {
                          const entryRoleInfo = getRoleInfo(m.entryRoleLabel);
                          targetDisplay = m.entryRoleLabel;
                          targetDescription = entryRoleInfo?.generic_description || 'No description';
                        } else if (m.bindKind === 'variable' && m.variableTypeLabel) {
                          targetDisplay = `[${m.variableTypeLabel}]`;
                          targetDescription = 'Variable binding';
                        } else if (m.bindKind === 'constant') {
                          targetDisplay = '[constant]';
                          targetDescription = 'Constant binding';
                        }
                        
                        const tooltip = `${m.predicateRoleLabel}: ${predicateRoleInfo?.generic_description || 'No description'} \n= ${targetDisplay}: ${targetDescription}`;
                        
                        return (
                          <text key={i} x={centerX + 10} y={y} fontSize={11} fontFamily="Arial" textAnchor="start" fill="white">
                            <title>{tooltip}</title>
                            <tspan fontWeight="bold">{m.predicateRoleLabel}</tspan>
                            <tspan> = </tspan>
                            <tspan fontWeight="500" fontStyle={m.bindKind !== 'role' ? 'italic' : 'normal'}>
                              {targetDisplay}
                            </tspan>
                          </text>
                        );
                      })}
                    </>
                  );
                })()}
                {/* Example text at bottom of node */}
                {pred.example && (
                  <foreignObject x={centerX + 10} y={centerY + n.height - 35} width={n.width - 20} height={30}>
                    <div style={{ fontSize: '11px', color: 'white', fontStyle: 'italic', lineHeight: '1.2', overflow: 'hidden', wordWrap: 'break-word' }}>
                      {pred.example}
                    </div>
                  </foreignObject>
                )}
              </Group>
            );
          })}
        </Group>
      </svg>
    </div>
  );
}


