'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Group } from '@visx/group';
import { LinearGradient } from '@visx/gradient';
import { GraphNode, Recipe, RecipePredicateNode, RoleType, LogicNode } from '@/lib/types';
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

    const nodes: Array<{ type: 'current' | 'predicate'; x: number; y: number; width: number; height: number; node: GraphNode | RecipePredicateNode; logicKind?: string; isNegated?: boolean }> = [];
    const edges: Array<{ from: { x: number; y: number; fromEdge: 'bottom' | 'right' | 'left' }; to: { x: number; y: number; toEdge: 'top' | 'right' | 'left' }; label: string } > = [];
    const groups: Array<{ predicateNodeIds: string[]; description: string }> = [];

    nodes.push({ type: 'current', x: centerX, y: centerY, width: currentNodeWidth, height: currentNodeHeight, node: currentNode });

    // Handle both new logic tree and legacy predicate_groups for backwards compatibility
    if (activeRecipe && activeRecipe.logic_root) {
      // NEW: Walk the logic tree and extract OR groups with their predicates
      const orGroups: Array<{ node: LogicNode; predicates: Array<{ predicate: RecipePredicateNode; isNegated: boolean }> }> = [];
      
      // Helper to extract predicates from a node
      function extractPredicates(node: LogicNode, isNegated = false): Array<{ predicate: RecipePredicateNode; isNegated: boolean }> {
        if (node.kind === 'leaf' && node.target_predicate) {
          return [{ predicate: node.target_predicate, isNegated }];
        } else if (node.kind === 'not' && node.children.length > 0) {
          // NOT node - flip negation for children
          return node.children.flatMap(child => extractPredicates(child, !isNegated));
        } else if (node.kind === 'or' || node.kind === 'and') {
          // OR/AND node - collect predicates from children
          return node.children.flatMap(child => extractPredicates(child, isNegated));
        }
        return [];
      }
      
      // Extract groups based on tree structure
      // Common pattern: AND root with OR children (each OR is a group)
      // Alternate pattern: OR root with AND children (each AND is a group)
      // Generic: treat any node with multiple children as a potential group
      
      if (activeRecipe.logic_root.kind === 'and') {
        // Standard: AND root with OR children
        for (const child of activeRecipe.logic_root.children) {
          if (child.kind === 'or') {
            const predicates = extractPredicates(child);
            if (predicates.length > 0) {
              orGroups.push({ node: child, predicates });
            }
          }
        }
      } else if (activeRecipe.logic_root.kind === 'or') {
        // Alternate: OR root with AND/LEAF children (each child is a "group" to choose from)
        for (const child of activeRecipe.logic_root.children) {
          const predicates = extractPredicates(child);
          if (predicates.length > 0) {
            orGroups.push({ node: child, predicates });
          }
        }
      } else {
        // Single leaf or NOT at root (edge case)
        const predicates = extractPredicates(activeRecipe.logic_root);
        if (predicates.length > 0) {
          orGroups.push({ node: activeRecipe.logic_root, predicates });
        }
      }
      
      // Arrange predicates in grid below, centered
      const predicateTop = centerY + currentNodeHeight / 2 + 80;
      const predicateHeight = 160;
      const horizontalGap = 120;
      const verticalGap = 160;
      const maxRowWidth = width - 2 * margin;

      const predicatePositions: Record<string, { x: number; y: number; width: number; height: number }> = {};
      
      // Build ordered items: each OR group as a unit
      const orderedItems = orGroups.map(g => ({ type: 'group' as const, group: g }));
      
      // First pass: calculate rows and their widths
      const rows: Array<{ items: typeof orderedItems; totalWidth: number }> = [];
      let currentRow: typeof orderedItems = [];
      let currentRowWidth = 0;

      for (const item of orderedItems) {
        // Calculate max width for grouped predicates (stacked vertically)
        const groupWidths = item.group.predicates.map(p => {
          const title = p.predicate.lexical.id;
          const textLen = Math.min(24, title.length);
          return Math.max(220, Math.min(360, textLen * 10 + 100));
        });
        const itemWidth = Math.max(...groupWidths) + 20; // padding for group border
        
        const widthWithGap = currentRow.length > 0 ? itemWidth + horizontalGap : itemWidth;
        
        if (currentRow.length > 0 && currentRowWidth + widthWithGap > maxRowWidth) {
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
          let groupY = rowY;
          const verticalGapInGroup = 20;
          
          const groupWidths = item.group.predicates.map(p => {
            const title = p.predicate.lexical.id;
            const textLen = Math.min(24, title.length);
            return Math.max(220, Math.min(360, textLen * 10 + 100));
          });
          const maxGroupWidth = Math.max(...groupWidths);
          
          const groupPredicateIds: string[] = [];
          
          for (const { predicate: pred, isNegated } of item.group.predicates) {
            const nodeX = currentX + maxGroupWidth / 2 + 10;
            const nodeY = groupY + predicateHeight / 2 + 10;
            
            nodes.push({ 
              type: 'predicate', 
              x: nodeX, 
              y: nodeY, 
              width: maxGroupWidth, 
              height: predicateHeight, 
              node: pred,
              isNegated 
            });
            predicatePositions[pred.id] = { x: nodeX, y: nodeY, width: maxGroupWidth, height: predicateHeight };
            groupPredicateIds.push(pred.id);
            
            groupY += predicateHeight + verticalGapInGroup;
          }
          
          // Store group info for rendering borders
          if (item.group.predicates.length > 1) {
            groups.push({
              predicateNodeIds: groupPredicateIds,
              description: item.group.node.description || 'oneOf'
            });
          }
          
          currentX += maxGroupWidth + 20 + horizontalGap;
        }
        
        // Calculate max height in this row
        let maxRowHeight = predicateHeight;
        for (const item of row.items) {
          const verticalGapInGroup = 20;
          const groupHeight = item.group.predicates.length * predicateHeight + (item.group.predicates.length - 1) * verticalGapInGroup + 20;
          maxRowHeight = Math.max(maxRowHeight, groupHeight);
        }
        rowY += maxRowHeight + verticalGap;
      }

      // Build edges between predicates
      for (const rel of activeRecipe.relations) {
        const from = predicatePositions[rel.sourcePredicateId];
        const to = predicatePositions[rel.targetPredicateId];
        if (from && to) {
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const angle = Math.atan2(dy, dx);
          const padding = 15;
          
          const fromX = from.x + Math.cos(angle) * (from.width / 2 + padding);
          const fromY = from.y + Math.sin(angle) * (from.height / 2 + padding);
          const toX = to.x - Math.cos(angle) * (to.width / 2 + padding);
          const toY = to.y - Math.sin(angle) * (to.height / 2 + padding);
          
          edges.push({ 
            from: { x: fromX, y: fromY, fromEdge: dy > 0 ? 'bottom' : (dx > 0 ? 'right' : 'left') }, 
            to: { x: toX, y: toY, toEdge: dy > 0 ? 'top' : (dx > 0 ? 'left' : 'right') }, 
            label: rel.relation_type 
          });
        }
      }
    } else if (activeRecipe && activeRecipe.predicates && activeRecipe.predicates.length > 0) {
      // FALLBACK: Render predicates even without logic_root or predicate_groups
      // This handles recipes created before migration or with incomplete logic trees
      
      // Arrange predicates in grid below, centered
      const predicateTop = centerY + currentNodeHeight / 2 + 80;
      const predicateHeight = 160;
      const horizontalGap = 120;
      const verticalGap = 160;
      const maxRowWidth = width - 2 * margin;

      const predicatePositions: Record<string, { x: number; y: number; width: number; height: number }> = {};
      
      // Check if we have predicate_groups
      const hasGroups = activeRecipe.predicate_groups && activeRecipe.predicate_groups.length > 0;
      
      // Group predicates by predicate_group if they exist, otherwise treat all as ungrouped
      const groupedPredicates: Array<{ group: typeof activeRecipe.predicate_groups[0]; predicates: RecipePredicateNode[] }> = [];
      
      if (hasGroups) {
        for (const group of activeRecipe.predicate_groups) {
          const predsInGroup = activeRecipe.predicates.filter(p => group.predicate_ids.includes(p.id));
          if (predsInGroup.length > 0) {
            groupedPredicates.push({ group, predicates: predsInGroup });
          }
        }
      } else {
        // No groups - create a single pseudo-group with all predicates
        groupedPredicates.push({
          group: { id: 'all', description: null, require_at_least_one: false, predicate_ids: activeRecipe.predicates.map(p => p.id) },
          predicates: activeRecipe.predicates
        });
      }
      
      // Layout groups
      const orderedItems = groupedPredicates.map(g => ({ type: 'group' as const, groupData: g }));
      
      const rows: Array<{ items: typeof orderedItems; totalWidth: number }> = [];
      let currentRow: typeof orderedItems = [];
      let currentRowWidth = 0;

      for (const item of orderedItems) {
        const groupWidths = item.groupData.predicates.map(p => {
          const title = p.lexical.id;
          const textLen = Math.min(24, title.length);
          return Math.max(220, Math.min(360, textLen * 10 + 100));
        });
        const itemWidth = Math.max(...groupWidths) + 20;
        
        const widthWithGap = currentRow.length > 0 ? itemWidth + horizontalGap : itemWidth;
        
        if (currentRow.length > 0 && currentRowWidth + widthWithGap > maxRowWidth) {
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

      // Position nodes
      let rowY = predicateTop;
      for (const row of rows) {
        const rowStartX = centerX - row.totalWidth / 2;
        let currentX = rowStartX;
        
        for (const item of row.items) {
          let groupY = rowY;
          const verticalGapInGroup = 20;
          
          const groupWidths = item.groupData.predicates.map(p => {
            const title = p.lexical.id;
            const textLen = Math.min(24, title.length);
            return Math.max(220, Math.min(360, textLen * 10 + 100));
          });
          const maxGroupWidth = Math.max(...groupWidths);
          
          const groupPredicateIds: string[] = [];
          
          for (const pred of item.groupData.predicates) {
            const nodeX = currentX + maxGroupWidth / 2 + 10;
            const nodeY = groupY + predicateHeight / 2 + 10;
            
            // Check if predicate is negated (old way - from predicate.negated field if it still exists)
            const isNegated = (pred as unknown as { negated?: boolean }).negated || false;
            
            nodes.push({ 
              type: 'predicate', 
              x: nodeX, 
              y: nodeY, 
              width: maxGroupWidth, 
              height: predicateHeight, 
              node: pred,
              isNegated 
            });
            predicatePositions[pred.id] = { x: nodeX, y: nodeY, width: maxGroupWidth, height: predicateHeight };
            groupPredicateIds.push(pred.id);
            
            groupY += predicateHeight + verticalGapInGroup;
          }
          
          // Store group info for rendering borders (only if we have actual groups, not pseudo-groups)
          if (hasGroups && item.groupData.predicates.length > 1) {
            groups.push({
              predicateNodeIds: groupPredicateIds,
              description: item.groupData.group.description || 'oneOf'
            });
          }
          
          currentX += maxGroupWidth + 20 + horizontalGap;
        }
        
        let maxRowHeight = predicateHeight;
        for (const item of row.items) {
          const verticalGapInGroup = 20;
          const groupHeight = item.groupData.predicates.length * predicateHeight + (item.groupData.predicates.length - 1) * verticalGapInGroup + 20;
          maxRowHeight = Math.max(maxRowHeight, groupHeight);
        }
        rowY += maxRowHeight + verticalGap;
      }

      // Build edges between predicates (old way)
      for (const rel of activeRecipe.relations) {
        const from = predicatePositions[rel.sourcePredicateId];
        const to = predicatePositions[rel.targetPredicateId];
        if (from && to) {
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const angle = Math.atan2(dy, dx);
          const padding = 15;
          
          const fromX = from.x + Math.cos(angle) * (from.width / 2 + padding);
          const fromY = from.y + Math.sin(angle) * (from.height / 2 + padding);
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
    return { width, height, nodes, edges, groups };
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
        {layout.groups.map((group, idx) => {
          // Find all predicates in this group and calculate bounding box
          const groupPredicateNodes = layout.nodes.filter(n => 
            n.type === 'predicate' && group.predicateNodeIds.includes((n.node as RecipePredicateNode).id)
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
            <g key={`group-${idx}`}>
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
            const isNegated = n.isNegated || false;
            return (
              <Group key={`node-${idx}`} top={n.y} left={n.x} onMouseEnter={() => setHoveredId(pred.id)} onMouseLeave={() => setHoveredId(null)} style={{ cursor: 'pointer' }}>
                <rect
                  width={n.width}
                  height={n.height}
                  y={centerY}
                  x={centerX}
                  fill={colors.predicate.fill}
                  stroke={isNegated ? '#ef4444' : colors.predicate.stroke}
                  strokeWidth={isNegated ? 3 : 2}
                  strokeDasharray={isNegated ? '5,5' : undefined}
                  rx={6}
                  ry={6}
                  onClick={() => onNodeClick(pred.lexical.id)}
                />
                {isNegated && (
                  <text x={centerX + n.width - 25} y={centerY + 18} fontSize={14} fontFamily="Arial" textAnchor="start" fill="#ef4444" fontWeight="bold">
                    NOT
                  </text>
                )}
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


