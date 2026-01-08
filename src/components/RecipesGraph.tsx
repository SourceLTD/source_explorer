'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { GraphNode, Recipe, RecipePredicateNode, RoleType, LogicNode, LogicNodeKind, RecipePrecondition } from '@/lib/types';
import GraphMainNode, { calculateMainNodeHeight } from './GraphMainNode';

interface RecipesGraphProps {
  currentNode: GraphNode;
  recipes: Recipe[];
  selectedRecipeId?: string;
  onSelectRecipe: (recipeId: string) => void;
  onNodeClick: (nodeId: string, recipeId?: string) => void;
  onEditClick?: () => void;
}

// Colors not needed for text-only logic view

export default function RecipesGraph({ currentNode, recipes, selectedRecipeId, onSelectRecipe, onNodeClick, onEditClick }: RecipesGraphProps) {
  const [roleTypes, setRoleTypes] = useState<RoleType[]>([]);
  const [argTooltip, setArgTooltip] = useState<{ title: string; description?: string; x: number; y: number } | null>(null);
  const [expandedBindings, setExpandedBindings] = useState<Record<string, boolean>>({});
  
  // Track expansion states for main node
  const [rolesExpanded, setRolesExpanded] = useState<boolean>(true);
  const [lemmasExpanded, setLemmasExpanded] = useState<boolean>(true);
  const [examplesExpanded, setExamplesExpanded] = useState<boolean>(true);
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

  useEffect(() => {
    setExpandedBindings({});
  }, [activeRecipe?.id]);

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

  // Helper to get verb-specific role description from a GraphNode
  const getVerbRoleDescription = (node: GraphNode, roleLabel: string): string | undefined => {
    if (!node.roles) return undefined;
    const normalized = roleLabel.toLowerCase();
    const role = node.roles.find(r => {
      if (r.role_type.label === roleLabel) return true;
      if (r.role_type.label.toLowerCase() === normalized) return true;
      if (r.role_type.code && r.role_type.code.toLowerCase() === normalized) return true;
      return false;
    });
    return role?.description || undefined;
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
        const response = await fetch(`/api/verbs/${verbId}/recipes`);
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

  // Main node size (left panel)
  const mainNodeSize = useMemo(() => {
    const nodeWidth = 600; // GraphMainNode uses 600 internally
    const svgPadding = 20; // Padding for borders
    const width = nodeWidth + svgPadding;
    const height = calculateMainNodeHeight(
      currentNode,
      lemmasExpanded,
      examplesExpanded,
      rolesExpanded,
      causesExpanded,
      entailsExpanded,
      alsoSeeExpanded
    );
    return { width, height, centerX: width / 2, centerY: 30 + height / 2 };
  }, [currentNode, lemmasExpanded, examplesExpanded, rolesExpanded, causesExpanded, entailsExpanded, alsoSeeExpanded]);

  const renderLeafBindings = (pred: RecipePredicateNode) => {
    if (!pred.roleMappings || pred.roleMappings.length === 0) {
      return [
        <div key={`${pred.id}-binding-none`} className="text-xs text-gray-500">
          No bindings
        </div>
      ];
    }

    return pred.roleMappings.map((m, idx) => {
      const key = `${pred.id}-binding-${idx}`;
      const roleLabel = m.predicateRoleLabel;

      if (m.bindKind === 'role' && m.entryRoleLabel) {
        const predRoleDesc = getVerbRoleDescription(pred.lexical, roleLabel);
        const entryRoleDesc = getVerbRoleDescription(currentNode, m.entryRoleLabel);
        const predInfo = getRoleInfo(roleLabel);
        const entryInfo = getRoleInfo(m.entryRoleLabel);
        const predDesc = (predRoleDesc ?? predInfo?.generic_description ?? roleLabel) as string;
        const entryDesc = (entryRoleDesc ?? entryInfo?.generic_description ?? m.entryRoleLabel) as string;
        const entryRoleLabelStr = m.entryRoleLabel;

        return (
          <div key={key} className="flex items-center gap-1">
            <span
              className="hover:underline cursor-help"
              onMouseEnter={(e) => {
                const r = (e.target as HTMLElement).getBoundingClientRect();
                setArgTooltip({ title: roleLabel, description: predDesc, x: r.left + r.width / 2, y: r.top - 8 });
              }}
              onMouseLeave={() => setArgTooltip(null)}
            >
              {roleLabel}
            </span>
            <span>=</span>
            <span
              className="hover:underline cursor-help text-blue-900"
              onMouseEnter={(e) => {
                const r = (e.target as HTMLElement).getBoundingClientRect();
                setArgTooltip({ title: entryRoleLabelStr, description: entryDesc, x: r.left + r.width / 2, y: r.top - 8 });
              }}
              onMouseLeave={() => setArgTooltip(null)}
            >
              {entryRoleLabelStr}
            </span>
          </div>
        );
      }

      if (m.bindKind === 'variable') {
        const variableKey = m.variableKey;
        const variable = variableKey ? activeRecipe?.variables?.find(v => v.key === variableKey) : undefined;
        const varDisplay = variableKey ? `$${variableKey}` : `[${m.variableTypeLabel || 'variable'}]`;
        const noun = variable?.noun_code ? `instance of ${variable.noun_code}${variable.noun_gloss ? ` (${variable.noun_gloss})` : ''}` : (m.variableTypeLabel ? `type ${m.variableTypeLabel}` : 'variable');
        const predRoleDesc = getVerbRoleDescription(pred.lexical, roleLabel);
        const predInfo = getRoleInfo(roleLabel);
        const predDesc = (predRoleDesc ?? predInfo?.generic_description ?? roleLabel) as string;

        return (
          <div key={key} className="flex items-center gap-1">
            <span
              className="hover:underline cursor-help"
              onMouseEnter={(e) => {
                const r = (e.target as HTMLElement).getBoundingClientRect();
                setArgTooltip({ title: roleLabel, description: predDesc, x: r.left + r.width / 2, y: r.top - 8 });
              }}
              onMouseLeave={() => setArgTooltip(null)}
            >
              {roleLabel}
            </span>
            <span>=</span>
            <span
              className="hover:underline cursor-help text-blue-900"
              onMouseEnter={(e) => {
                const r = (e.target as HTMLElement).getBoundingClientRect();
                setArgTooltip({ title: `🕵 ${varDisplay}`, description: noun, x: r.left + r.width / 2, y: r.top - 8 });
              }}
              onMouseLeave={() => setArgTooltip(null)}
            >
              🕵({varDisplay})
            </span>
          </div>
        );
      }

      const predRoleDesc = getVerbRoleDescription(pred.lexical, roleLabel);
      const predInfo = getRoleInfo(roleLabel);
      const predDesc = (predRoleDesc ?? predInfo?.generic_description ?? roleLabel) as string;

      return (
        <div key={key} className="flex items-center gap-1">
          <span
            className="hover:underline cursor-help"
            onMouseEnter={(e) => {
              const r = (e.target as HTMLElement).getBoundingClientRect();
              setArgTooltip({ title: roleLabel, description: predDesc, x: r.left + r.width / 2, y: r.top - 8 });
            }}
            onMouseLeave={() => setArgTooltip(null)}
          >
            {roleLabel}
          </span>
          <span>=</span>
          <span
            className="hover:underline cursor-help text-blue-900"
            onMouseEnter={(e) => {
              const r = (e.target as HTMLElement).getBoundingClientRect();
              setArgTooltip({ title: '📌 [constant]', description: 'Constant binding', x: r.left + r.width / 2, y: r.top - 8 });
            }}
            onMouseLeave={() => setArgTooltip(null)}
          >
            📌 [constant]
          </span>
        </div>
      );
    });
  };

  // Format preconditions into a readable sentence
  const formatPreconditions = (preconditions: RecipePrecondition[]): string => {
    if (!preconditions || preconditions.length === 0) return '';
    
    // Filter to only recipe-level preconditions (not predicate-specific ones)
    const recipeLevelPreconditions = preconditions.filter(pc => !pc.target_recipe_predicate_id);
    
    if (recipeLevelPreconditions.length === 0) return '';
    
    // Track seen roles and their conditions to handle conflicts
    // Map role label -> condition type (prioritize 'null' over 'not_null' if both exist)
    const roleConditions = new Map<string, { isNull: boolean; text: string }>();
    const otherParts: string[] = [];
    
    for (const prec of recipeLevelPreconditions) {
      if ((prec.condition_type === 'role_is_null' || prec.condition_type === 'role_is_not_null') && prec.target_role_id) {
        // Use the role label directly from the database (fetched via JOIN)
        const roleLabel = prec.target_role_label || prec.target_role_id;
        const isNull = prec.condition_type === 'role_is_null';
        const text = `${roleLabel} is ${isNull ? 'null' : 'not null'}`;
        
        // If we haven't seen this role, or if this is a "null" condition (prioritize null over not_null)
        const existing = roleConditions.get(roleLabel);
        if (!existing || (isNull && !existing.isNull)) {
          roleConditions.set(roleLabel, { isNull, text });
        }
      } else if (prec.description) {
        // Normalize "must be provided" to "is not null"
        const normalizedDesc = prec.description.replace(/must be provided/gi, 'is not null');
        // Use description as the key for deduplication
        if (!otherParts.includes(normalizedDesc)) {
          otherParts.push(normalizedDesc);
        }
      } else {
        // Fallback for unknown condition types
        const fallbackText = `${prec.condition_type}`;
        if (!otherParts.includes(fallbackText)) {
          otherParts.push(fallbackText);
        }
      }
    }
    
    // Combine role conditions and other parts
    const parts = Array.from(roleConditions.values()).map(v => v.text).concat(otherParts);
    
    if (parts.length === 0) return '';
    
    // Join with commas and 'and' for the last item
    if (parts.length === 1) {
      return `This recipe is applicable when ${parts[0]}`;
    } else if (parts.length === 2) {
      return `This recipe is applicable when ${parts[0]} and ${parts[1]}`;
    } else {
      const last = parts.pop();
      return `This recipe is applicable when ${parts.join(', ')}, and ${last}`;
    }
  };

  const renderLogicNode = (node: LogicNode, depth: number, parentKind?: LogicNodeKind, childIndex?: number): React.ReactNode[] => {
    const pad = { paddingLeft: depth * 16 };
    if (node.kind === 'leaf' && node.target_predicate) {
      const pred = node.target_predicate;
      const verbId = pred.lexical.id;
      const isExpanded = expandedBindings[pred.id] ?? false;
      const items: React.ReactNode[] = [];

      // Show ↘️ emoji only for the second child (index 1) of relation types (except AND/OR)
      // For relation types like "enables", "causes", etc., the second child is the target/result
      const isRelationType = parentKind !== undefined && parentKind !== 'and' && parentKind !== 'or' && parentKind !== 'leaf';
      const showEmoji = isRelationType && childIndex === 1;

      items.push(
        <div key={`${node.id}-line`} style={pad} className="font-mono text-sm text-gray-800 flex items-center gap-2">
          {showEmoji && <span>↘️</span>}
          <button
            type="button"
            className="w-6 h-6 flex items-center justify-center rounded border border-gray-400 text-gray-700 bg-white hover:bg-gray-100"
            onClick={() => setExpandedBindings(prev => ({ ...prev, [pred.id]: !isExpanded }))}
            aria-label={isExpanded ? 'Collapse bindings' : 'Expand bindings'}
          >
            {isExpanded ? '-' : '+'}
          </button>
          <span
            className="text-blue-600 hover:underline cursor-pointer font-semibold"
            onClick={() => handlePredicateClick(pred)}
            title="Open this verb in recipe view"
          >
            {verbId}
          </span>
          <span className="text-gray-500">()</span>
          {pred.example && (
            <span className="text-xs italic text-gray-500 font-normal">
              e.g. "{pred.example}"
            </span>
          )}
        </div>
      );

      if (isExpanded) {
        items.push(
          <div
            key={`${node.id}-bindings`}
            style={{ paddingLeft: depth * 16 + 32 }}
            className="mt-2"
          >
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-sm text-blue-900 font-mono space-y-1">
              {renderLeafBindings(pred)}
            </div>
          </div>
        );
      }

      return items;
    }
    if (node.kind === 'not') {
      const lines: React.ReactNode[] = [
        <div key={`${node.id}-title`} style={pad} className="font-mono text-sm text-gray-800">NOT</div>
      ];
      if (node.children && node.children[0]) {
        lines.push(...renderLogicNode(node.children[0], depth + 1, node.kind, 0));
      }
      return lines;
    }
    const title = node.kind.toUpperCase();
    const lines: React.ReactNode[] = [
      <div key={`${node.id}-title`} style={pad} className="font-mono text-sm text-gray-800">{title}</div>
    ];
    for (let i = 0; i < (node.children || []).length; i++) {
      lines.push(...renderLogicNode(node.children[i], depth + 1, node.kind, i));
    }
    return lines;
  };

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

  const mainNodeHeight = mainNodeSize.centerY + mainNodeSize.height / 2 + 30;

  return (
    <div className="w-full h-full flex justify-center overflow-auto py-6">
      <div className="flex flex-col md:flex-row gap-6 w-full md:w-2/3 max-w-[1400px] px-2 md:px-4 mx-auto">
        {/* Left: Main node */}
        <div className="w-full md:w-1/2 flex justify-center min-w-0 overflow-visible">
          <div className="flex justify-center overflow-visible">
            <svg width={mainNodeSize.width} height={mainNodeHeight} style={{ display: 'block', overflow: 'visible' }}>
              <GraphMainNode
                node={currentNode}
                x={mainNodeSize.centerX}
                y={mainNodeSize.centerY}
                onNodeClick={onNodeClick}
                onEditClick={onEditClick}
                controlledRolesExpanded={rolesExpanded}
                controlledLemmasExpanded={lemmasExpanded}
                controlledExamplesExpanded={examplesExpanded}
                controlledCausesExpanded={causesExpanded}
                controlledEntailsExpanded={entailsExpanded}
                controlledAlsoSeeExpanded={alsoSeeExpanded}
                onRolesExpandedChange={setRolesExpanded}
                onLemmasExpandedChange={setLemmasExpanded}
                onExamplesExpandedChange={setExamplesExpanded}
                onCausesExpandedChange={setCausesExpanded}
                onEntailsExpandedChange={setEntailsExpanded}
                onAlsoSeeExpandedChange={setAlsoSeeExpanded}
                greyedOutRoleIds={greyedOutRoleIds}
              />
            </svg>
          </div>
        </div>

        {/* Right: Text logic view */}
        <div className="w-full md:w-1/2 flex flex-col min-w-0" style={{ marginTop: '-10px' }}>
          {/* Recipe toggle */}
          <div className="flex items-center justify-start gap-3 mb-2 select-none">
            <button
              type="button"
              onClick={handlePrevRecipe}
              disabled={recipes.length <= 1}
              className={`h-7 w-7 flex items-center justify-center rounded-full border ${
                recipes.length <= 1
                  ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
              }`}
              aria-label="Previous recipe"
              title="Previous recipe"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className={`px-2 text-sm font-medium ${recipes.length <= 1 ? 'text-gray-400' : 'text-gray-800'}`}>
              {activeRecipeIndex + 1}/{recipes.length}
            </div>
            <button
              type="button"
              onClick={handleNextRecipe}
              disabled={recipes.length <= 1}
              className={`h-7 w-7 flex items-center justify-center rounded-full border ${
                recipes.length <= 1
                  ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
              }`}
              aria-label="Next recipe"
              title="Next recipe"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            {recipes.length > 1 && activeRecipe?.label && (
              <div className="px-3 text-sm font-medium text-gray-700 ml-2">
                {activeRecipe.label}
              </div>
            )}
          </div>

          {/* Logic text box */}
          <div className="border border-gray-300 rounded-xl p-3 bg-white w-full overflow-auto min-w-0" style={{ height: mainNodeHeight - 36 - 10 }}>
            {activeRecipe?.preconditions && activeRecipe.preconditions.length > 0 && (
              <>
                <div className="text-sm font-bold text-gray-800 mb-2">
                  {formatPreconditions(activeRecipe.preconditions)}
                </div>
                <div className="text-gray-400 mb-2 font-mono" style={{ fontSize: '10px', letterSpacing: '1px' }}>
                  {'='.repeat(50)}
                </div>
                {activeRecipe?.example && (
                  <div className="text-xs italic text-gray-500 mb-2 font-mono">
                    e.g. "{activeRecipe.example}"
                  </div>
                )}
              </>
            )}
            {(!activeRecipe?.preconditions || activeRecipe.preconditions.length === 0) && activeRecipe?.example && (
              <div className="text-xs italic text-gray-500 mb-2 font-mono">
                e.g. "{activeRecipe.example}"
              </div>
            )}
            {!activeRecipe?.logic_root ? (
              <div className="text-xs text-gray-600 font-mono">No logic tree available for this recipe.</div>
            ) : (
              <div className="space-y-1">
                {renderLogicNode(activeRecipe.logic_root, 0)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {argTooltip && (
        <div
          className="fixed z-50 px-3 py-2 text-xs font-medium text-white bg-gray-900 rounded-xl pointer-events-none"
          style={{ left: argTooltip.x, top: argTooltip.y, transform: 'translate(-50%, -100%)' }}
        >
          <div>{argTooltip.title}</div>
          {argTooltip.description && <div className="opacity-90">{argTooltip.description}</div>}
          <div className="absolute left-1/2 -bottom-1 w-2 h-2 bg-gray-900 transform -translate-x-1/2 rotate-45" />
        </div>
      )}
    </div>
  );
}


