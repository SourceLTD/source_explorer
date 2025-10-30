'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Group } from '@visx/group';
import { LinearGradient } from '@visx/gradient';
import { GraphNode, Recipe, RecipePredicateNode, RoleType, LogicNode, RecipePrecondition } from '@/lib/types';
import GraphMainNode, { calculateMainNodeHeight } from './GraphMainNode';

interface RecipesGraphProps {
  currentNode: GraphNode;
  recipes: Recipe[];
  selectedRecipeId?: string;
  onSelectRecipe: (recipeId: string) => void;
  onNodeClick: (nodeId: string, recipeId?: string) => void;
  onEditClick?: () => void;
}

const colors = {
  current: { fill: '#3b82f6', stroke: '#1e40af' },
  predicate: { fill: '#6b7280', stroke: '#374151' },
  predicateGreen: { fill: '#059669', stroke: '#047857' },
  link: '#4b5563',
  arrow: '#374151',
  background: '#ffffff',
  forbiddenNode: '#fca5a5',
  forbiddenStroke: '#dc2626',
};

export default function RecipesGraph({ currentNode, recipes, selectedRecipeId, onSelectRecipe, onNodeClick, onEditClick }: RecipesGraphProps) {
  const [hoveredPredicateId, setHoveredPredicateId] = useState<string | null>(null);
  const [roleTypes, setRoleTypes] = useState<RoleType[]>([]);
  
  // Track expansion states for main node to calculate correct layout
  const [rolesExpanded, setRolesExpanded] = useState<boolean>(true); // Auto-expand roles in recipe mode
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

  // Calculate which roles should be greyed out based on preconditions (for main node display)
  const greyedOutRoleIds = useMemo(() => {
    if (!activeRecipe || !activeRecipe.preconditions) return new Set<string>();
    
    const greyedIds = new Set<string>();
    for (const precondition of activeRecipe.preconditions) {
      // Check for "role_is_null" condition which means the role must be NULL (greyed out)
      if (precondition.condition_type === 'role_is_null' && precondition.target_role_id) {
        greyedIds.add(precondition.target_role_id);
      }
    }
    return greyedIds;
  }, [activeRecipe]);

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

  // Handler for clicking predicate nodes with discovered variables
  const handlePredicateClick = (pred: RecipePredicateNode) => {
    const verbId = pred.lexical.id;
    
    // Check if this predicate has any discovered variable bindings
    const discoveredBindings = pred.roleMappings.filter(m => m.discovered);
    
    if (discoveredBindings.length === 0) {
      // No discovered variables - just navigate to the verb normally
      onNodeClick(verbId);
      return;
    }
    
    // Has discovered variables - navigate immediately, then fetch recipes asynchronously
    // This prevents the white block delay
    onNodeClick(verbId);
    
    // Asynchronously fetch and find the right recipe
    (async () => {
      try {
        const response = await fetch(`/api/entries/${verbId}/recipes`);
        if (!response.ok) return;
        
        const data = await response.json();
        const targetRecipes = data.recipes || [];
        
        // Find a recipe where at least one of the discovered roles is NOT discovered
        const discoveredRoleLabels = new Set(discoveredBindings.map(b => b.entryRoleLabel || b.variableTypeLabel).filter(Boolean));
        
        const suitableRecipe = targetRecipes.find((recipe: Recipe) => {
          // Check if any predicates in this recipe have bindings to the discovered roles that are NOT discovered
          return recipe.predicates.some(p => 
            p.roleMappings.some(m => 
              discoveredRoleLabels.has(m.entryRoleLabel || '') && !m.discovered
            )
          );
        });
        
        // Update the selected recipe after navigation
        if (suitableRecipe) {
          onSelectRecipe(suitableRecipe.id);
        }
      } catch (error) {
        console.error('Error fetching recipes for discovered variable navigation:', error);
      }
    })();
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
    const groups: Array<{ predicateNodeIds: string[]; description: string; kind: 'and' | 'or' }> = [];
    let allPredicateIdsForOuterBorder: string[] = [];
    let needsOuterBorder = false;
    let outerBorderKind: 'and' | 'or' = 'or';

    nodes.push({ type: 'current', x: centerX, y: centerY, width: currentNodeWidth, height: currentNodeHeight, node: currentNode });

    // Handle both new logic tree and legacy predicate_groups for backwards compatibility
    if (activeRecipe && activeRecipe.logic_root) {
      // NEW: Walk the logic tree and extract groups with their predicates
      const orGroups: Array<{ node: LogicNode; predicates: Array<{ predicate: RecipePredicateNode; isNegated: boolean }>; innerKind: 'and' | 'or'; isStructural: boolean }> = [];
      
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
      // Pattern 1: AND root with OR children → each OR is a oneOf group, no outer border
      // Pattern 2: OR root with AND children → each AND is an all group, outer OR border wraps everything
      // Pattern 3: OR root with OR children → nested oneOf groups
      
      if (activeRecipe.logic_root.kind === 'and') {
        // AND root - check if children are OR nodes or direct LEAFs/ANDs
        const hasOrChildren = activeRecipe.logic_root.children.some(c => c.kind === 'or');
        
        if (hasOrChildren) {
          // Standard pattern: AND root with OR children (each OR = oneOf group)
          for (const child of activeRecipe.logic_root.children) {
            if (child.kind === 'or') {
              const predicates = extractPredicates(child);
              if (predicates.length > 0) {
                orGroups.push({ node: child, predicates, innerKind: 'or', isStructural: true });
              }
            }
          }
          needsOuterBorder = false;
        } else {
          // All children are LEAFs or ANDs - group them all together with an 'all' border
          const allPredicates = activeRecipe.logic_root.children.flatMap(child => extractPredicates(child));
          if (allPredicates.length > 0) {
            orGroups.push({ 
              node: activeRecipe.logic_root, 
              predicates: allPredicates, 
              innerKind: 'and',
              isStructural: true
            });
          }
          needsOuterBorder = false;
        }
      } else if (activeRecipe.logic_root.kind === 'or') {
        // OR root - check if children are AND nodes or direct LEAFs
        const hasAndChildren = activeRecipe.logic_root.children.some(c => c.kind === 'and');
        
        if (hasAndChildren) {
          // OR root with mixed AND/LEAF children (like communicate.v.01)
          // Strategy: Group consecutive LEAFs together, but keep ANDs separate
          let currentLeafGroup: Array<{ predicate: RecipePredicateNode; isNegated: boolean }> = [];
          
          for (const child of activeRecipe.logic_root.children) {
            if (child.kind === 'and' || child.kind === 'or' || child.kind === 'not') {
              // If we have accumulated leaf predicates, flush them as a group
              if (currentLeafGroup.length > 0) {
                orGroups.push({
                  node: activeRecipe.logic_root,
                  predicates: currentLeafGroup,
                  innerKind: 'or',
                  isStructural: false // Accumulated leaves - no inner border
                });
                currentLeafGroup = [];
              }
              
              // Add the complex node as its own group
              const predicates = extractPredicates(child);
              if (predicates.length > 0) {
                orGroups.push({ 
                  node: child, 
                  predicates,
                  innerKind: child.kind === 'and' ? 'and' : 'or',
                  isStructural: true // Structural node - gets inner border
                });
              }
            } else {
              // Leaf node - accumulate with other leaves
              const predicates = extractPredicates(child);
              currentLeafGroup.push(...predicates);
            }
          }
          
          // Flush any remaining leaf predicates
          if (currentLeafGroup.length > 0) {
            orGroups.push({
              node: activeRecipe.logic_root,
              predicates: currentLeafGroup,
              innerKind: 'or',
              isStructural: false // Accumulated leaves - no inner border
            });
          }
          
          needsOuterBorder = true; // Always wrap in outer oneOf for OR root
          outerBorderKind = 'or';
        } else {
          // All children are LEAFs - group them all together in one 'oneOf' border
          const allPredicates = activeRecipe.logic_root.children.flatMap(child => extractPredicates(child));
          if (allPredicates.length > 0) {
            orGroups.push({ 
              node: activeRecipe.logic_root, 
              predicates: allPredicates, 
              innerKind: 'or',
              // If multiple predicates, make it structural so it gets a oneOf border
              // If single predicate, no border needed
              isStructural: allPredicates.length > 1
            });
          }
          needsOuterBorder = false;
        }
      } else {
        // Single leaf or NOT at root (edge case)
        const predicates = extractPredicates(activeRecipe.logic_root);
        if (predicates.length > 0) {
          orGroups.push({ node: activeRecipe.logic_root, predicates, innerKind: 'or', isStructural: false });
        }
        needsOuterBorder = false;
      }
      
      // Calculate space needed for recipe toggle
      const recipeToggleHeight = recipes.length > 1 ? 35 : 0;
      const baseSpacing = 40; // Base spacing below main node
      
      // Arrange predicates in grid below, centered
      // Position predicates below: main node + toggle + spacing
      const predicateTop = centerY + currentNodeHeight / 2 + baseSpacing + recipeToggleHeight + 40;
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
          return Math.max(280, Math.min(420, textLen * 10 + 120)); // Increased width
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
            return Math.max(280, Math.min(420, textLen * 10 + 120)); // Increased width
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
          
          // Track ALL predicates for outer border (regardless of whether they get inner borders)
          allPredicateIdsForOuterBorder.push(...groupPredicateIds);
          
          // Store inner group info for rendering borders
          // Only create inner borders for structural groups (AND/OR nodes), not accumulated leaves
          if (item.group.predicates.length > 1 && item.group.isStructural) {
            groups.push({
              predicateNodeIds: groupPredicateIds,
              description: item.group.node.description || (item.group.innerKind === 'and' ? 'all' : 'oneOf'),
              kind: item.group.innerKind
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
      
      // Calculate space needed for recipe toggle
      const recipeToggleHeight = recipes.length > 1 ? 35 : 0;
      const baseSpacing = 40; // Base spacing below main node
      
      // Arrange predicates in grid below, centered
      // Position predicates below: main node + toggle + spacing
      const predicateTop = centerY + currentNodeHeight / 2 + baseSpacing + recipeToggleHeight + 40;
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
              description: item.groupData.group.description || 'oneOf',
              kind: 'or' // Legacy groups are all OR (require_at_least_one)
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

    // Calculate outer border if needed (for OR/AND at root with multiple children)
    let outerBorder: { predicateNodeIds: string[]; description: string; kind: 'and' | 'or' } | null = null;
    
    if (activeRecipe && activeRecipe.logic_root && needsOuterBorder && allPredicateIdsForOuterBorder && allPredicateIdsForOuterBorder.length > 0) {
      // Use ALL predicate IDs (from all groups, not just structural ones)
      console.log(`[RecipesGraph] Creating outer ${outerBorderKind} border with ${allPredicateIdsForOuterBorder.length} predicates, ${groups.length} inner groups`);
      outerBorder = {
        predicateNodeIds: allPredicateIdsForOuterBorder,
        description: activeRecipe.logic_root.description || (outerBorderKind === 'or' ? 'oneOf' : 'all'),
        kind: outerBorderKind
      };
    } else if (activeRecipe && activeRecipe.logic_root) {
      console.log(`[RecipesGraph] No outer border needed: needsOuterBorder=${needsOuterBorder}, root.kind=${activeRecipe.logic_root.kind}, children=${activeRecipe.logic_root.children.length}`);
    }

    // Calculate height
    const height = nodes.reduce((h, n) => Math.max(h, n.y + n.height / 2 + margin), centerY + currentNodeHeight / 2 + margin);
    
    console.log('[RecipesGraph] Layout:', {
      nodes: nodes.length,
      predicateNodes: nodes.filter(n => n.type === 'predicate').length,
      edges: edges.length,
      groups: groups.length,
      hasOuterBorder: !!outerBorder,
      height
    });
    
    return { width, height, nodes, edges, groups, outerBorder };
  }, [currentNode, activeRecipe, lemmasExpanded, examplesExpanded, rolesExpanded, legalConstraintsExpanded, causesExpanded, entailsExpanded, alsoSeeExpanded, recipes]);

  // Show a loading state if recipes haven't loaded yet
  if (!recipes || recipes.length === 0) {
    console.log('[RecipesGraph] Early return: No recipes');
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-gray-500">No recipes available for this verb</div>
      </div>
    );
  }

  if (!activeRecipe) {
    console.log('[RecipesGraph] Early return: No active recipe');
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-gray-500">Loading recipe...</div>
      </div>
    );
  }
  
  console.log('[RecipesGraph] Rendering recipe:', { recipeId: activeRecipe.id, label: activeRecipe.label });

  return (
    <div className="w-full h-full flex items-start justify-center pt-4">
      <svg width={layout.width} height={layout.height} style={{ backgroundColor: 'transparent' }}>
        <LinearGradient id="recipes-link-gradient" from={colors.link} to={colors.link} />
        <defs>
          <marker id="arrow" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto" markerUnits="userSpaceOnUse">
            <path d="M 0 0 L 12 6 L 0 12 z" fill={colors.arrow} />
          </marker>
          <filter id="drop-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
            <feOffset dx="0" dy="2" result="offsetblur"/>
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.3"/>
            </feComponentTransfer>
            <feMerge>
              <feMergeNode/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Recipe toggle under main node */}
        {recipes && recipes.length > 1 && (() => {
          const currentLayoutNode = layout.nodes.find(n => n.type === 'current');
          if (!currentLayoutNode) return null;
          const overlayWidth = currentLayoutNode.width; // align with main node width
          const overlayHeight = 28;
          const overlayX = currentLayoutNode.x - overlayWidth / 2;
          const overlayY = currentLayoutNode.y + currentLayoutNode.height / 2 + 35; // space below main node, above predicates
          const canToggle = recipes.length > 1;
          const recipeNumber = `${activeRecipeIndex + 1}/${recipes.length}`;
          return (
            <foreignObject x={overlayX} y={overlayY} width={overlayWidth} height={overlayHeight}>
              <div className="flex items-center justify-center gap-3 select-none" style={{ pointerEvents: 'auto' }}>
                <button
                  type="button"
                  onClick={handlePrevRecipe}
                  disabled={!canToggle}
                  className="h-7 w-7 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
                  aria-label="Previous recipe"
                  title="Previous recipe"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <div className="px-2 text-sm font-medium text-gray-800">
                  {recipeNumber}
                </div>
                <button
                  type="button"
                  onClick={handleNextRecipe}
                  disabled={!canToggle}
                  className="h-7 w-7 flex items-center justify-center rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
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

        {/* Inner Group Borders */}
        {layout.groups.map((group, idx) => {
          const groupPredicateNodes = layout.nodes.filter(n => 
            n.type === 'predicate' && group.predicateNodeIds.includes((n.node as RecipePredicateNode).id)
          );
          
          if (groupPredicateNodes.length === 0) return null;
          
          const padding = 10;
          const minX = Math.min(...groupPredicateNodes.map(n => n.x - n.width / 2)) - padding;
          const maxX = Math.max(...groupPredicateNodes.map(n => n.x + n.width / 2)) + padding;
          const minY = Math.min(...groupPredicateNodes.map(n => n.y - n.height / 2)) - padding;
          const maxY = Math.max(...groupPredicateNodes.map(n => n.y + n.height / 2)) + padding;
          
          const boxWidth = maxX - minX;
          const boxHeight = maxY - minY;
          
          const isAndGroup = group.kind === 'and';
          const labelText = isAndGroup ? 'all' : 'oneOf';
          const labelWidth = isAndGroup ? 22 : 38; // Increased for gaps on both sides
          
          return (
            <g key={`group-${idx}`}>
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
              <rect
                x={minX + 8}
                y={minY - 6}
                width={labelWidth}
                height={12}
                fill={colors.background}
              />
              <text
                x={minX + 8 + labelWidth / 2}
                y={minY + 3}
                fontSize="10"
                fill="rgba(0, 0, 0, 0.7)"
                fontWeight="bold"
                textAnchor="middle"
              >
                {labelText}
              </text>
            </g>
          );
        })}

        {/* Outer Group Border (for OR/AND at root level) */}
        {layout.outerBorder && (() => {
          const outerPredicateNodes = layout.nodes.filter(n => 
            n.type === 'predicate' && layout.outerBorder!.predicateNodeIds.includes((n.node as RecipePredicateNode).id)
          );
          
          if (outerPredicateNodes.length === 0) return null;
          
          const padding = 25; // Larger padding for outer border
          const minX = Math.min(...outerPredicateNodes.map(n => n.x - n.width / 2)) - padding;
          const maxX = Math.max(...outerPredicateNodes.map(n => n.x + n.width / 2)) + padding;
          const minY = Math.min(...outerPredicateNodes.map(n => n.y - n.height / 2)) - padding;
          const maxY = Math.max(...outerPredicateNodes.map(n => n.y + n.height / 2)) + padding;
          
          const boxWidth = maxX - minX;
          const boxHeight = maxY - minY;
          
          const isAndGroup = layout.outerBorder.kind === 'and';
          const labelText = isAndGroup ? 'all' : 'oneOf';
          const labelWidth = isAndGroup ? 26 : 44; // Increased for gaps on both sides
          
          return (
            <g key="outer-border">
              <rect
                x={minX}
                y={minY}
                width={boxWidth}
                height={boxHeight}
                fill="none"
                stroke="rgba(0, 0, 0, 0.6)"
                strokeWidth={3}
                rx={8}
              />
              <rect
                x={minX + 12}
                y={minY - 8}
                width={labelWidth}
                height={16}
                fill={colors.background}
              />
              <text
                x={minX + 12 + labelWidth / 2}
                y={minY + 3}
                fontSize="12"
                fill="rgba(0, 0, 0, 0.7)"
                fontWeight="bold"
                textAnchor="middle"
              >
                {labelText}
              </text>
            </g>
          );
        })()}

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
                  onEditClick={onEditClick}
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
                  greyedOutRoleIds={greyedOutRoleIds}
                />
              );
            }

            const pred = n.node as RecipePredicateNode;
            const centerX = -n.width / 2;
            const centerY = -n.height / 2;
            const isNegated = n.isNegated || false;
            const isHovered = hoveredPredicateId === pred.id;
            // Only use green if concrete is explicitly false (non-concrete nouns)
            // Default to grey for verbs, adjectives, concrete nouns, or undefined
            const isNonConcrete = pred.lexical.concrete === false;
            const predicateColors = isNonConcrete ? colors.predicateGreen : colors.predicate;
            return (
              <Group key={`node-${idx}`} top={n.y} left={n.x} onMouseEnter={() => setHoveredPredicateId(pred.id)} onMouseLeave={() => setHoveredPredicateId(null)} style={{ cursor: 'pointer' }}>
                <rect
                  width={n.width}
                  height={n.height}
                  y={centerY}
                  x={centerX}
                  fill={predicateColors.fill}
                  stroke={isNegated ? '#ef4444' : predicateColors.stroke}
                  strokeWidth={isNegated ? 3 : 2}
                  strokeDasharray={isNegated ? '5,5' : undefined}
                  rx={6}
                  ry={6}
                  onClick={() => handlePredicateClick(pred)}
                  filter={isHovered ? 'url(#drop-shadow)' : undefined}
                  style={{ transition: 'filter 0.2s ease-in-out' }}
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
                        
                        // Regular binding display
                        const predicateRoleInfo = getRoleInfo(m.predicateRoleLabel);
                        
                        let targetDisplay = '';
                        let targetDescription = '';
                        const isDiscovered = m.discovered ?? false;
                        const isVariable = m.bindKind === 'variable' && m.variableKey; // Show special styling for variables with keys
                        
                        if (m.bindKind === 'role' && m.entryRoleLabel) {
                          const entryRoleInfo = getRoleInfo(m.entryRoleLabel);
                          targetDisplay = m.entryRoleLabel;
                          targetDescription = entryRoleInfo?.generic_description || 'No description';
                        } else if (m.bindKind === 'variable') {
                          // Show variable key if available, otherwise show variable type label
                          if (m.variableKey) {
                            targetDisplay = `$${m.variableKey}`;
                            targetDescription = m.variableTypeLabel ? `Variable: ${m.variableTypeLabel}` : 'Variable binding';
                          } else if (m.variableTypeLabel) {
                            targetDisplay = `[${m.variableTypeLabel}]`;
                            targetDescription = 'Variable binding';
                          } else {
                            targetDisplay = '[variable]';
                            targetDescription = 'Variable binding';
                          }
                        } else if (m.bindKind === 'constant') {
                          targetDisplay = '[constant]';
                          targetDescription = 'Constant binding';
                        }
                        
                        const tooltip = `${m.predicateRoleLabel}: ${predicateRoleInfo?.generic_description || 'No description'} \n= ${targetDisplay}: ${targetDescription}${isDiscovered ? ' (discovered variable - must be NULL)' : ''}`;
                        
                        return (
                          <text key={i} x={centerX + 10} y={y} fontSize={11} fontFamily="Arial" textAnchor="start" fill="white">
                            <title>{tooltip}</title>
                            <tspan fontWeight="bold">{m.predicateRoleLabel}</tspan>
                            <tspan> = </tspan>
                            {isVariable && <tspan fontSize={10}>🕵🏼 </tspan>}
                            {isVariable && <tspan>(</tspan>}
                            <tspan 
                              fontWeight="500" 
                              fontStyle={isVariable ? 'italic' : (m.bindKind !== 'role' ? 'italic' : 'normal')}
                              opacity={isVariable ? 0.6 : 1}
                            >
                              {targetDisplay}
                            </tspan>
                            {isVariable && <tspan>)</tspan>}
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


