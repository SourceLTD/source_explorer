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
  const [_hoveredId, setHoveredId] = useState<string | null>(null);
  const [roleTypes, setRoleTypes] = useState<RoleType[]>([]);

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

    // Current node - use shared height calculation
    const currentNodeWidth = 600;
    const currentNodeHeight = calculateMainNodeHeight(currentNode);
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
      
      // First pass: calculate rows and their widths
      const rows: Array<{ predicates: typeof activeRecipe.predicates; totalWidth: number }> = [];
      let currentRow: typeof activeRecipe.predicates = [];
      let currentRowWidth = 0;

      for (const pred of activeRecipe.predicates) {
        const title = pred.lexical.id;
        const textLen = Math.min(24, title.length);
        const predWidth = Math.max(220, Math.min(360, textLen * 10 + 100));
        const widthWithGap = currentRow.length > 0 ? predWidth + horizontalGap : predWidth;
        
        if (currentRow.length > 0 && currentRowWidth + widthWithGap > maxRowWidth) {
          // Start new row
          rows.push({ predicates: currentRow, totalWidth: currentRowWidth });
          currentRow = [pred];
          currentRowWidth = predWidth;
        } else {
          currentRow.push(pred);
          currentRowWidth += widthWithGap;
        }
      }
      if (currentRow.length > 0) {
        rows.push({ predicates: currentRow, totalWidth: currentRowWidth });
      }

      // Second pass: position nodes centered in each row
      let rowY = predicateTop;
      for (const row of rows) {
        const rowStartX = centerX - row.totalWidth / 2;
        let currentX = rowStartX;
        
        for (const pred of row.predicates) {
          const title = pred.lexical.id;
          const textLen = Math.min(24, title.length);
          const predWidth = Math.max(220, Math.min(360, textLen * 10 + 100));
          
          const nodeX = currentX + predWidth / 2;
          const nodeY = rowY + predicateHeight / 2;
          
          nodes.push({ type: 'predicate', x: nodeX, y: nodeY, width: predWidth, height: predicateHeight, node: pred });
          predicatePositions[pred.id] = { x: nodeX, y: nodeY, width: predWidth, height: predicateHeight };
          
          currentX += predWidth + horizontalGap;
        }
        
        rowY += predicateHeight + verticalGap;
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
  }, [currentNode, activeRecipe]);

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
                        const entryRoleInfo = getRoleInfo(m.entryRoleLabel);
                        const tooltip = `${m.predicateRoleLabel}: ${predicateRoleInfo?.generic_description || 'No description'} \n→ ${m.entryRoleLabel}: ${entryRoleInfo?.generic_description || 'No description'}`;
                        return (
                          <text key={i} x={centerX + 10} y={y} fontSize={11} fontFamily="Arial" textAnchor="start" fill="white">
                            <title>{tooltip}</title>
                            <tspan fontWeight="bold">{m.predicateRoleLabel}</tspan>
                            <tspan> → </tspan>
                            <tspan fontWeight="500">{m.entryRoleLabel}</tspan>
                          </text>
                        );
                      })}
                    </>
                  );
                })()}
              </Group>
            );
          })}
        </Group>
      </svg>
    </div>
  );
}


