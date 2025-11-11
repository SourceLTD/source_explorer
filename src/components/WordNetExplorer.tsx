'use client';

import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GraphNode, SearchResult, BreadcrumbItem, RoleType, sortRolesByPrecedence, EntryRecipes } from '@/lib/types';
import LexicalGraph from './LexicalGraph';
import RecipesGraph from './RecipesGraph';
import SearchBox from './SearchBox';
import Breadcrumbs from './Breadcrumbs';
import ViewToggle, { ViewMode } from './ViewToggle';
import SignOutButton from './SignOutButton';
import RootNodesView from './RootNodesView';

interface WordNetExplorerProps {
  initialEntryId?: string;
  mode?: 'verbs' | 'nouns' | 'adjectives';
}

export default function WordNetExplorer({ initialEntryId, mode = 'verbs' }: WordNetExplorerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentNode, setCurrentNode] = useState<GraphNode | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setSearchQuery] = useState<string>('');
  const [currentView, setCurrentView] = useState<ViewMode>('graph');
  const [entryRecipes, setEntryRecipes] = useState<EntryRecipes | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | undefined>(undefined);
  const [isEditOverlayOpen, setIsEditOverlayOpen] = useState(false);
  
  // Track last loaded entry to prevent duplicate calls
  const lastLoadedEntryRef = useRef<string | null>(null);

  // Fetch role types on component mount
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

  // Fetch frames and lexfiles when overlay opens
  useEffect(() => {
    if (isEditOverlayOpen && mode === 'verbs') {
      const fetchFrames = async () => {
        try {
          const response = await fetch('/api/frames');
          if (response.ok) {
            const data = await response.json();
            setAvailableFrames(data);
          }
        } catch (error) {
          console.error('Failed to fetch frames:', error);
        }
      };
      fetchFrames();
    }
  }, [isEditOverlayOpen, mode]);
  
  // Editing state
  const [editingField, setEditingField] = useState<'code' | 'hypernym' | 'src_lemmas' | 'gloss' | 'examples' | 'roles' | 'legal_constraints' | 'vendler_class' | 'lexfile' | 'frame' | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [editListItems, setEditListItems] = useState<string[]>([]);
  const [editRoles, setEditRoles] = useState<{id: string; clientId: string; description: string; roleType: string; exampleSentence: string; main: boolean;}[]>([]);
  const [editRoleGroups, setEditRoleGroups] = useState<{id: string, description: string, role_ids: string[]}[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [roleTypes, setRoleTypes] = useState<RoleType[]>([]);
  const [availableFrames, setAvailableFrames] = useState<{id: string; frame_name: string; code?: string | null}[]>([]);
  const [codeValidationMessage, setCodeValidationMessage] = useState<string>('');
  const [selectedHyponymsToMove, setSelectedHyponymsToMove] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Overlay section expansion state
  const [overlaySections, setOverlaySections] = useState({
    basicInfo: true,
    verbProperties: false,
    roles: false,
    legalConstraints: false,
    relations: false,
  });

  type RoleEditableField = 'description' | 'exampleSentence';
  type RoleFieldLocation = 'main' | 'overlay';
  type RoleSelectionState = {
    start: number;
    end: number;
    direction: 'forward' | 'backward' | 'none';
  };

  const getRoleFieldKey = useCallback(
    (clientId: string, field: RoleEditableField, location: RoleFieldLocation) =>
      `${clientId}-${field}-${location}`,
    []
  );

  const roleFieldRefs = useRef<Map<string, HTMLTextAreaElement | HTMLInputElement>>(new Map<string, HTMLTextAreaElement | HTMLInputElement>());
  const activeRoleFieldRef = useRef<{ clientId: string; field: RoleEditableField; location: RoleFieldLocation } | null>(null);
  const overlayContentRef = useRef<HTMLDivElement | null>(null);
  const lastOverlayScrollTopRef = useRef(0);
  const roleSelectionRef = useRef<Map<string, RoleSelectionState>>(new Map<string, RoleSelectionState>());

  const setRoleFieldRef = useCallback((clientId: string, field: RoleEditableField, location: RoleFieldLocation, element: HTMLTextAreaElement | HTMLInputElement | null) => {
    const key = getRoleFieldKey(clientId, field, location);
    if (element) {
      roleFieldRefs.current.set(key, element);
    } else {
      roleFieldRefs.current.delete(key);
    }
  }, [getRoleFieldKey]);

  const storeRoleSelection = useCallback((clientId: string, field: RoleEditableField, location: RoleFieldLocation, target: HTMLTextAreaElement | HTMLInputElement | null) => {
    if (!target) return;
    const key = getRoleFieldKey(clientId, field, location);
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? target.value.length;
    const direction = (target.selectionDirection as RoleSelectionState['direction'] | null) ?? 'none';
    roleSelectionRef.current.set(key, { start, end, direction });
  }, [getRoleFieldKey]);

  const handleRoleFieldFocus = useCallback((clientId: string, field: RoleEditableField, location: RoleFieldLocation, target?: HTMLTextAreaElement | HTMLInputElement | null) => {
    activeRoleFieldRef.current = { clientId, field, location };
    if (target) {
      storeRoleSelection(clientId, field, location, target);
    }
    if (isEditOverlayOpen && overlayContentRef.current) {
      lastOverlayScrollTopRef.current = overlayContentRef.current.scrollTop;
    }
  }, [isEditOverlayOpen, storeRoleSelection]);

  const handleRoleFieldBlur = useCallback((clientId: string, field: RoleEditableField, location: RoleFieldLocation) => {
    if (activeRoleFieldRef.current &&
        activeRoleFieldRef.current.clientId === clientId &&
        activeRoleFieldRef.current.field === field &&
        activeRoleFieldRef.current.location === location) {
      activeRoleFieldRef.current = null;
    }
    roleSelectionRef.current.delete(getRoleFieldKey(clientId, field, location));
  }, [getRoleFieldKey]);

  useLayoutEffect(() => {
    const activeField = activeRoleFieldRef.current;
    if (!activeField) return;

    const key = getRoleFieldKey(activeField.clientId, activeField.field, activeField.location);
    const element = roleFieldRefs.current.get(key);

    if (!element) return;

    const shouldRefocus = document.activeElement !== element;

    if (shouldRefocus) {
      element.focus({ preventScroll: true });
    }

    const selection = roleSelectionRef.current.get(key);
    if (selection && 'setSelectionRange' in element) {
      const { start, end, direction } = selection;
      try {
        element.setSelectionRange(start, end, direction);
      } catch {
        // Ignore selection errors (e.g., unsupported input type)
      }
    } else if (shouldRefocus && 'setSelectionRange' in element) {
      const valueLength = element.value.length;
      try {
        element.setSelectionRange(valueLength, valueLength);
      } catch {
        // Ignore selection errors
      }
    }

    if (isEditOverlayOpen && overlayContentRef.current) {
      overlayContentRef.current.scrollTop = lastOverlayScrollTopRef.current;
      lastOverlayScrollTopRef.current = overlayContentRef.current.scrollTop;
    }
  }, [editRoles, isEditOverlayOpen, getRoleFieldKey]);

  // Helper function to update URL parameters without page reload
  const updateUrlParam = (entryId: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('entry', entryId);
    let basePath = '/graph';
    if (mode === 'nouns') basePath = '/graph/nouns';
    else if (mode === 'adjectives') basePath = '/graph/adjectives';
    router.push(`${basePath}?${params.toString()}`, { scroll: false });
  };

  // Helper to update view in URL
  const updateViewParam = (view: ViewMode) => {
    const params = new URLSearchParams(searchParams);
    params.set('view', view);
    const qs = params.toString();
    let basePath = '/graph';
    if (mode === 'nouns') basePath = '/graph/nouns';
    else if (mode === 'adjectives') basePath = '/graph/adjectives';
    router.push(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
  };

  const loadGraphNode = useCallback(async (entryId: string, invalidateCache: boolean = false) => {
    // Prevent duplicate calls for the same entry (unless cache invalidation is requested)
    if (lastLoadedEntryRef.current === entryId && !invalidateCache) {
      return;
    }
    
    lastLoadedEntryRef.current = entryId;
    setIsLoading(true);
    setError(null);
    
    try {
      let apiPrefix = '/api/entries';
      if (mode === 'nouns') apiPrefix = '/api/nouns';
      else if (mode === 'adjectives') apiPrefix = '/api/adjectives';
      
      const graphUrl = invalidateCache 
        ? `${apiPrefix}/${entryId}/graph?invalidate=true&t=${Date.now()}`
        : `${apiPrefix}/${entryId}/graph`;
      
      const breadcrumbUrl = invalidateCache
        ? `/api/breadcrumbs/${entryId}?t=${Date.now()}`
        : `/api/breadcrumbs/${entryId}`;
      
      const recipesUrl = invalidateCache
        ? `${apiPrefix}/${entryId}/recipes?t=${Date.now()}`
        : `${apiPrefix}/${entryId}/recipes`;
        
      // Only fetch recipes for verbs
      const fetchPromises = [
        fetch(graphUrl, invalidateCache ? { cache: 'no-store' } : {}),
        fetch(breadcrumbUrl, invalidateCache ? { cache: 'no-store' } : {})
      ];
      
      if (mode === 'verbs') {
        fetchPromises.push(fetch(recipesUrl, invalidateCache ? { cache: 'no-store' } : {}));
      }
      
      const responses = await Promise.all(fetchPromises);
      const [graphResponse, breadcrumbResponse, recipesResponse] = responses;

      if (!graphResponse.ok) {
        throw new Error('Failed to load entry');
      }

      const graphNode: GraphNode = await graphResponse.json();
      setCurrentNode(graphNode);

      // Handle recipes (only for verbs)
      if (mode === 'verbs' && recipesResponse) {
        if (recipesResponse.ok) {
          const recipesData: EntryRecipes = await recipesResponse.json();
          setEntryRecipes(recipesData);
          // default selection
          setSelectedRecipeId(recipesData.recipes.find(r => r.is_default)?.id || recipesData.recipes[0]?.id);
        } else {
          setEntryRecipes({ entryId, recipes: [] });
          setSelectedRecipeId(undefined);
        }
      } else {
        // Nouns and adjectives don't have recipes
        setEntryRecipes({ entryId, recipes: [] });
        setSelectedRecipeId(undefined);
      }

      if (breadcrumbResponse.ok) {
        const breadcrumbData: BreadcrumbItem[] = await breadcrumbResponse.json();
        setBreadcrumbs(breadcrumbData);
      } else {
        setBreadcrumbs([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error loading graph node:', err);
    } finally {
      setIsLoading(false);
    }
  }, [mode]);

  const handleNodeClick = (nodeId: string, recipeId?: string) => {
    // Reset the ref to allow loading the new node
    lastLoadedEntryRef.current = null;
    updateUrlParam(nodeId);
    // If a specific recipe ID is provided (e.g., for discovered variables), select it
    setSelectedRecipeId(recipeId);
  };

  const handleSearchResult = (result: SearchResult) => {
    // Reset the ref to allow loading the new node
    lastLoadedEntryRef.current = null;
    updateUrlParam(result.id);
    setSearchQuery(''); // Clear search after selection
  };



  const handleSearchQueryChange = (query: string) => {
    setSearchQuery(query);
  };

  const handleBreadcrumbNavigate = (id: string) => {
    // Reset the ref to allow loading the new node
    lastLoadedEntryRef.current = null;
    updateUrlParam(id);
  };

  const handleHomeClick = () => {
    // Clear the current node and return to home view
    lastLoadedEntryRef.current = null;
    setCurrentNode(null);
    setBreadcrumbs([]);
    // Remove entry from URL but preserve view
    const params = new URLSearchParams(searchParams);
    params.delete('entry');
    const qs = params.toString();
    let basePath = '/graph';
    if (mode === 'nouns') basePath = '/graph/nouns';
    else if (mode === 'adjectives') basePath = '/graph/adjectives';
    router.push(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
  };

  const handleRefreshClick = () => {
    if (currentNode) {
      loadGraphNode(currentNode.id, true); // Force cache invalidation
    }
  };

  const startEditing = (field: 'code' | 'hypernym' | 'src_lemmas' | 'gloss' | 'examples' | 'roles' | 'legal_constraints' | 'vendler_class' | 'lexfile' | 'frame') => {
    if (!currentNode) return;
    
    setEditingField(field);
    setCodeValidationMessage('');
    
    if (field === 'code') {
      // Extract lemma part from id (e.g., "communicate" from "communicate.v.01")
      const lemmaMatch = currentNode.id.match(/^(.+)\.[vnar]\.(\d+)$/);
      if (lemmaMatch) {
        setEditValue(lemmaMatch[1]); // Just the lemma part
      } else {
        setEditValue(currentNode.id);
      }
    } else if (field === 'hypernym') {
      // Set current hypernym and select all hyponyms to move by default
      setEditValue(currentNode.parents[0]?.id || '');
      setSelectedHyponymsToMove(new Set(currentNode.children.map(c => c.id)));
    } else if (field === 'src_lemmas') {
      setEditListItems([...(currentNode.src_lemmas || [])]);
    } else if (field === 'examples') {
      setEditListItems([...currentNode.examples]);
    } else if (field === 'legal_constraints') {
      setEditListItems([...(currentNode.legal_constraints || [])]);
    } else if (field === 'gloss') {
      setEditValue(currentNode.gloss);
    } else if (field === 'vendler_class') {
      setEditValue(currentNode.vendler_class || '');
    } else if (field === 'lexfile') {
      setEditValue(currentNode.lexfile || '');
    } else if (field === 'frame') {
      setEditValue(currentNode.frame_id || '');
    } else if (field === 'roles') {
      const preparedRoles = sortRolesByPrecedence(currentNode.roles || []).map((role, index) => {
        const clientId = role.id && role.id.length > 0 ? role.id : `existing-role-${index}-${role.role_type.label}`;
        return {
          id: role.id,
          clientId,
          description: role.description || '',
          roleType: role.role_type.label,
          exampleSentence: role.example_sentence || '',
          main: role.main,
        };
      });

      const idToClientId = new Map<string, string>();
      preparedRoles.forEach(role => {
        if (role.id) {
          idToClientId.set(role.id, role.clientId);
        }
      });

      setEditRoles(preparedRoles);
      setEditRoleGroups(
        (currentNode.role_groups || []).map(group => ({
          id: group.id,
          description: group.description || '',
          role_ids: group.role_ids.map(roleId => idToClientId.get(roleId) ?? roleId)
        }))
      );
    }
  };

  const cancelEditing = () => {
    setEditingField(null);
    setEditValue('');
    setEditListItems([]);
    setEditRoles([]);
    setEditRoleGroups([]);
    setCodeValidationMessage('');
    setSelectedHyponymsToMove(new Set());
  };

  // Delete entry handler
  const handleDeleteEntry = async () => {
    if (!currentNode) return;

    setIsDeleting(true);
    try {
      let apiPrefix = '/api/entries';
      if (mode === 'nouns') apiPrefix = '/api/nouns';
      else if (mode === 'adjectives') apiPrefix = '/api/adjectives';

      const response = await fetch(`${apiPrefix}/${currentNode.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete entry');
      }

      // Close the delete confirmation and edit overlay
      setShowDeleteConfirm(false);
      setIsEditOverlayOpen(false);

      // Navigate to parent if it exists, otherwise go to root view
      if (currentNode.parents.length > 0) {
        handleNodeClick(currentNode.parents[0].id);
      } else {
        // Go back to root view
        setCurrentNode(null);
        setBreadcrumbs([]);
      }

      // Reset editing state
      cancelEditing();
    } catch (error) {
      console.error('Error deleting entry:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete entry');
    } finally {
      setIsDeleting(false);
    }
  };

  // Find next available unique code
  const findUniqueCode = async (baseLemma: string, pos: string): Promise<string> => {
    let apiPrefix = '/api/entries';
    if (mode === 'nouns') apiPrefix = '/api/nouns';
    else if (mode === 'adjectives') apiPrefix = '/api/adjectives';
    
    // Start checking from .01
    for (let num = 1; num <= 99; num++) {
      const numStr = num.toString().padStart(2, '0');
      const candidateId = `${baseLemma}.${pos}.${numStr}`;
      
      try {
        const response = await fetch(`${apiPrefix}/${candidateId}`);
        if (!response.ok) {
          // ID doesn't exist, it's available
          return candidateId;
        }
      } catch {
        // Error fetching means it doesn't exist
        return candidateId;
      }
    }
    
    throw new Error('No available numeric suffix found (checked up to 99)');
  };

  const saveEdit = async () => {
    if (!currentNode || !editingField) return;
    
    setIsSaving(true);
    try {
      let apiPrefix = '/api/entries';
      if (mode === 'nouns') apiPrefix = '/api/nouns';
      else if (mode === 'adjectives') apiPrefix = '/api/adjectives';

      // Handle code changes separately
      if (editingField === 'code') {
        const newLemma = editValue.trim().toLowerCase().replace(/\s+/g, '_');
        
        if (!newLemma) {
          throw new Error('Lemma cannot be empty');
        }
        
        // Extract POS from current ID
        const posMatch = currentNode.id.match(/\.([vnar])\.(\d+)$/);
        if (!posMatch) {
          throw new Error('Invalid ID format');
        }
        
        const pos = posMatch[1];
        
        // Find unique code
        setCodeValidationMessage('Finding unique code...');
        const newId = await findUniqueCode(newLemma, pos);
        setCodeValidationMessage(`Will use: ${newId}`);
        
        // Update with new ID
        const response = await fetch(`${apiPrefix}/${currentNode.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: newId })
        });

        if (!response.ok) {
          throw new Error('Failed to update code');
        }

        // Navigate to the new ID with cache invalidation
        lastLoadedEntryRef.current = null;
        setEditingField(null);
        setEditValue('');
        
        // Show success message before navigating
        setCodeValidationMessage('✓ Code updated successfully');
        setTimeout(() => {
          updateUrlParam(newId);
          setCodeValidationMessage('');
        }, 500);
        return;
      }

      // Handle hypernym changes separately
      if (editingField === 'hypernym') {
        if (!editValue) {
          throw new Error('Please select a new hypernym');
        }

        const oldHypernym = currentNode.parents[0]?.id;
        const newHypernym = editValue;
        const hyponymsToMove = Array.from(selectedHyponymsToMove);
        const hyponymsToStay = currentNode.children
          .map(c => c.id)
          .filter(id => !selectedHyponymsToMove.has(id));

        setCodeValidationMessage('Updating relations...');

        const response = await fetch('/api/relations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'change_hypernym',
            entryId: currentNode.id,
            oldHypernym,
            newHypernym,
            hyponymsToMove,
            hyponymsToStay,
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update hypernym');
        }

        // Reload the graph node with cache invalidation
        lastLoadedEntryRef.current = null;
        await loadGraphNode(currentNode.id, true);
        setEditingField(null);
        setEditValue('');
        setCodeValidationMessage('');
        setSelectedHyponymsToMove(new Set());
        
        // Show brief success message
        setCodeValidationMessage('✓ Hypernym updated successfully');
        setTimeout(() => setCodeValidationMessage(''), 2000);
        return;
      }

      // Handle other fields
      const updateData: Record<string, unknown> = {};
      
      switch (editingField) {
        case 'src_lemmas':
          updateData.src_lemmas = editListItems.filter(s => s.trim());
          break;
        case 'gloss':
          updateData.gloss = editValue.trim();
          break;
        case 'examples':
          updateData.examples = editListItems.filter(s => s.trim());
          break;
        case 'legal_constraints':
          updateData.legal_constraints = editListItems.filter(s => s.trim());
          break;
        case 'vendler_class':
          updateData.vendler_class = editValue || null;
          break;
        case 'lexfile':
          updateData.lexfile = editValue;
          break;
        case 'frame':
          updateData.frame_id = editValue || null;
          break;
        case 'roles':
          // Only verbs have roles
          if (mode === 'verbs') {
            updateData.roles = editRoles.filter(role => role.description.trim());

            const roleIdLookup = new Map<string, string>();
            editRoles.forEach(role => {
              if (role.id) {
                roleIdLookup.set(role.clientId, role.id);
                roleIdLookup.set(role.id, role.id);
              }
            });

            updateData.role_groups = editRoleGroups
              .map(group => {
                const resolvedRoleIds = group.role_ids
                  .map(roleId => roleIdLookup.get(roleId))
                  .filter((id): id is string => Boolean(id));
                return {
                  ...group,
                  role_ids: resolvedRoleIds,
                };
              })
              .filter(group => group.role_ids.length >= 2);
          }
          break;
      }
      
      const response = await fetch(`${apiPrefix}/${currentNode.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        throw new Error('Failed to update entry');
      }

      // Reload the graph node to get updated data with cache invalidation
      // Reset the lastLoadedEntryRef to force a fresh load
      lastLoadedEntryRef.current = null;
      await loadGraphNode(currentNode.id, true);
      
      setEditingField(null);
      setEditValue('');
      setEditListItems([]);
      setEditRoles([]);
      setEditRoleGroups([]);
      setCodeValidationMessage('');
      
      // Show brief success message
      setCodeValidationMessage('✓ Changes saved successfully');
      setTimeout(() => setCodeValidationMessage(''), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
      setCodeValidationMessage('');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFlagToggle = async () => {
    if (!currentNode) return;
    
    try {
      let apiPrefix = '/api/entries';
      if (mode === 'nouns') apiPrefix = '/api/nouns';
      else if (mode === 'adjectives') apiPrefix = '/api/adjectives';
      
      const response = await fetch(`${apiPrefix}/moderation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [currentNode.id],
          updates: {
            flagged: !currentNode.flagged
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update flag status');
      }

      // Reload the graph node to get updated data with cache invalidation
      lastLoadedEntryRef.current = null;
      await loadGraphNode(currentNode.id, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update flag status');
    }
  };

  const handleForbidToggle = async () => {
    if (!currentNode) return;
    
    try {
      let apiPrefix = '/api/entries';
      if (mode === 'nouns') apiPrefix = '/api/nouns';
      else if (mode === 'adjectives') apiPrefix = '/api/adjectives';
      
      const response = await fetch(`${apiPrefix}/moderation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [currentNode.id],
          updates: {
            forbidden: !currentNode.forbidden
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update forbidden status');
      }

      // Reload the graph node to get updated data with cache invalidation
      lastLoadedEntryRef.current = null;
      await loadGraphNode(currentNode.id, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update forbidden status');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  };

  // List editing helpers
  const updateListItem = (index: number, value: string) => {
    const newItems = [...editListItems];
    newItems[index] = value;
    setEditListItems(newItems);
  };

  const addListItem = () => {
    setEditListItems([...editListItems, '']);
  };

  const removeListItem = (index: number) => {
    const newItems = editListItems.filter((_, i) => i !== index);
    setEditListItems(newItems);
  };

  const moveListItem = (fromIndex: number, toIndex: number) => {
    const newItems = [...editListItems];
    const [movedItem] = newItems.splice(fromIndex, 1);
    newItems.splice(toIndex, 0, movedItem);
    setEditListItems(newItems);
  };

  // Roles editing helpers
  const updateRole = useCallback((clientId: string, field: 'description' | 'roleType' | 'exampleSentence' | 'main', value: string | boolean) => {
    setEditRoles(prev => prev.map((role) => 
      role.clientId === clientId ? { ...role, [field]: value } : role
    ));
  }, []);

  const addRole = (main: boolean) => {
    // Generate a temporary unique ID for new roles
    const clientId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    setEditRoles(prev => [...prev, { id: '', clientId, description: '', roleType: '', exampleSentence: '', main }]);
  };

  const removeRole = (clientId: string) => {
    if (activeRoleFieldRef.current && activeRoleFieldRef.current.clientId === clientId) {
      activeRoleFieldRef.current = null;
    }

    (['main', 'overlay'] as RoleFieldLocation[]).forEach(location => {
      roleFieldRefs.current.delete(getRoleFieldKey(clientId, 'description', location));
      roleFieldRefs.current.delete(getRoleFieldKey(clientId, 'exampleSentence', location));
      roleSelectionRef.current.delete(getRoleFieldKey(clientId, 'description', location));
      roleSelectionRef.current.delete(getRoleFieldKey(clientId, 'exampleSentence', location));
    });

    const identifiersToRemove: string[] = [];

    setEditRoles(prev => prev.filter(role => {
      if (role.clientId === clientId) {
        identifiersToRemove.push(role.clientId);
        if (role.id) {
          identifiersToRemove.push(role.id);
        }
        return false;
      }
      return true;
    }));

    if (identifiersToRemove.length > 0) {
      setEditRoleGroups(prev => prev.map(group => ({
        ...group,
        role_ids: group.role_ids.filter(id => !identifiersToRemove.includes(id))
      })).filter(group => group.role_ids.length >= 2));
    }
  };

  // Role group editing helpers
  const addRoleGroup = () => {
    // Generate a temporary unique ID for new role groups
    const tempId = `temp-group-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    setEditRoleGroups(prev => [...prev, { id: tempId, description: '', role_ids: [] }]);
  };

  const removeRoleGroup = (index: number) => {
    setEditRoleGroups(prev => prev.filter((_, i) => i !== index));
  };

  const updateRoleGroup = (index: number, field: 'description' | 'role_ids', value: string | string[]) => {
    setEditRoleGroups(prev => prev.map((group, i) => 
      i === index ? { ...group, [field]: value } : group
    ));
  };

  const toggleRoleInGroup = (groupIndex: number, roleId: string) => {
    setEditRoleGroups(prev => prev.map((group, i) => {
      if (i !== groupIndex) return group;
      const isInGroup = group.role_ids.includes(roleId);
      return {
        ...group,
        role_ids: isInGroup 
          ? group.role_ids.filter(id => id !== roleId)
          : [...group.role_ids, roleId]
      };
    }));
  };

  // Moderation functions
  const handleModerationUpdate = async (updates: { flagged?: boolean; forbidden?: boolean }) => {
    if (!currentNode) return;

    try {
      let apiPrefix = '/api/entries';
      if (mode === 'nouns') apiPrefix = '/api/nouns';
      else if (mode === 'adjectives') apiPrefix = '/api/adjectives';
      
      const response = await fetch(`${apiPrefix}/moderation`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ids: [currentNode.id],
          updates
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update entry');
      }

      // Reload the graph node to get updated data with cache invalidation
      lastLoadedEntryRef.current = null;
      await loadGraphNode(currentNode.id, true);
      
      console.log('Successfully updated entry');
    } catch (error) {
      console.error('Error updating entry:', error);
      setError(error instanceof Error ? error.message : 'Failed to update entry');
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleToggleFlagged = () => {
    const newFlaggedValue = !currentNode?.flagged;
    handleModerationUpdate({ 
      flagged: newFlaggedValue,
      // Clear reason if unflagging
      ...(newFlaggedValue ? {} : { flaggedReason: null })
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleToggleForbidden = () => {
    const newForbiddenValue = !currentNode?.forbidden;
    handleModerationUpdate({ 
      forbidden: newForbiddenValue,
      // Clear reason if allowing
      ...(newForbiddenValue ? {} : { forbiddenReason: null })
    });
  };

  // Load entry based on URL params or initial prop and sync view from URL
  useEffect(() => {
    const viewParam = searchParams.get('view');
    if (viewParam === 'graph' || viewParam === 'recipes' || viewParam === 'table') {
      setCurrentView(viewParam as ViewMode);
    }
    const currentEntryId = searchParams.get('entry') || initialEntryId;
    if (currentEntryId) {
      loadGraphNode(currentEntryId);
    }
  }, [searchParams, initialEntryId, loadGraphNode]);

  // Close edit overlay on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isEditOverlayOpen && !editingField) {
        setIsEditOverlayOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isEditOverlayOpen, editingField]);

  // OverlaySection component (similar to FilterSection)
  const OverlaySection = ({ title, icon, isOpen, onToggle, children }: {
    title: string;
    icon: React.ReactNode;
    isOpen: boolean;
    onToggle: () => void;
    children: React.ReactNode;
  }) => (
    <div className={`border-b border-gray-200 last:border-b-0 ${isOpen ? 'bg-gray-50' : ''}`}>
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-gray-900">{title}</span>
        </div>
        <svg 
          className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="px-6 pb-6 pt-2 space-y-4">
          {children}
        </div>
      )}
    </div>
  );

  // Available options for dropdowns
  const vendlerClasses = ['state', 'activity', 'accomplishment', 'achievement'];
  const availableLexfiles = mode === 'verbs' 
    ? ['verb.body', 'verb.change', 'verb.cognition', 'verb.communication', 'verb.competition', 'verb.consumption', 'verb.contact', 'verb.creation', 'verb.emotion', 'verb.motion', 'verb.perception', 'verb.possession', 'verb.social', 'verb.stative', 'verb.weather']
    : mode === 'nouns'
    ? ['noun.Tops', 'noun.act', 'noun.animal', 'noun.artifact', 'noun.attribute', 'noun.body', 'noun.cognition', 'noun.communication', 'noun.event', 'noun.feeling', 'noun.food', 'noun.group', 'noun.location', 'noun.motive', 'noun.object', 'noun.person', 'noun.phenomenon', 'noun.plant', 'noun.possession', 'noun.process', 'noun.quantity', 'noun.relation', 'noun.shape', 'noun.state', 'noun.substance', 'noun.time']
    : ['adj.all', 'adj.pert', 'adj.ppl'];

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/')}
              className="text-xl font-bold text-gray-900 hover:text-gray-700 cursor-pointer"
            >
              SourceNet
            </button>
            <div className="h-6 w-px bg-gray-300"></div>
            <h1 className="text-xl font-bold text-gray-900">
              {mode === 'nouns' ? 'Nouns' : mode === 'adjectives' ? 'Adjectives' : 'Verbs'}
            </h1>
            <p className="text-sm text-gray-600">
              Explore lexical relationships
            </p>
          </div>
          
          <div className="flex items-center gap-4 flex-1 justify-end">
            <div className="flex-1 max-w-2xl">
              <SearchBox 
                onSelectResult={handleSearchResult}
                onSearchChange={handleSearchQueryChange}
                placeholder="Search graph..."
                mode={mode}
              />
            </div>
            <ViewToggle 
              currentView={currentView}
              onViewChange={(view: ViewMode) => {
                if (view === 'table') {
                  let tablePath = '/table';
                  if (mode === 'nouns') tablePath = '/table/nouns';
                  else if (mode === 'adjectives') tablePath = '/table/adjectives';
                  router.push(tablePath);
                } else {
                  setCurrentView(view);
                  updateViewParam(view);
                }
              }}
              hideRecipes={mode === 'nouns' || mode === 'adjectives'}
            />
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex">
        {/* Sidebar with Entry Details - Only show in table mode */}
        {currentView === 'table' && (
        <aside className="w-80 bg-white border-r border-gray-200 p-6 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin h-8 w-8 border-2 border-gray-300 border-t-blue-600 rounded-full"></div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center">
                <svg className="h-5 w-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-red-800 text-sm font-medium">Error</span>
              </div>
              <p className="text-red-700 text-sm mt-1">{error}</p>
            </div>
          )}

          {currentNode && !isLoading && (
            <div className="space-y-6">
              {/* Entry Header */}
              <div>
                <h2 className="text-lg font-bold text-gray-900 mb-2">
                  {(() => {
                    const allLemmas = currentNode.lemmas || [];
                    const srcLemmas = currentNode.src_lemmas || [];
                    const regularLemmas = allLemmas.filter(lemma => !srcLemmas.includes(lemma));
                    return [...regularLemmas, ...srcLemmas][0] || currentNode.id;
                  })()} ({currentNode.id})
                </h2>
                
                {/* Status Indicators */}
                <div className="flex items-center gap-2 mb-3">
                  {currentNode.flagged && (
                    <span className="inline-block px-2 py-1 text-xs rounded font-medium bg-orange-100 text-orange-800">
                      Flagged
                      {currentNode.flaggedReason && (
                        <span className="ml-1 text-orange-600">({currentNode.flaggedReason})</span>
                      )}
                    </span>
                  )}
                  {currentNode.forbidden && (
                    <span className="inline-block px-2 py-1 text-xs rounded font-medium bg-red-100 text-red-800">
                      Forbidden
                      {currentNode.forbiddenReason && (
                        <span className="ml-1 text-red-600">({currentNode.forbiddenReason})</span>
                      )}
                    </span>
                  )}
                </div>
                
                {/* Moderation Actions */}
                <div className="flex items-center gap-2 mb-4">
                  <button
                    onClick={handleFlagToggle}
                    className={`flex items-center gap-1 px-3 py-1 text-sm font-medium border rounded-md transition-colors cursor-pointer ${
                      currentNode.flagged 
                        ? 'text-orange-700 bg-orange-100 border-orange-200 hover:bg-orange-200' 
                        : 'text-gray-700 bg-gray-100 border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 2H21l-3 6 3 6h-8.5l-1-2H5a2 2 0 00-2 2zm9-13.5V9" />
                    </svg>
                    {currentNode.flagged ? 'Unflag' : 'Flag'}
                  </button>
                  <button
                    onClick={handleForbidToggle}
                    className={`flex items-center gap-1 px-3 py-1 text-sm font-medium border rounded-md transition-colors cursor-pointer ${
                      currentNode.forbidden 
                        ? 'text-red-700 bg-red-100 border-red-200 hover:bg-red-200' 
                        : 'text-gray-700 bg-gray-100 border-gray-200 hover:bg-gray-200'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
                    </svg>
                    {currentNode.forbidden ? 'Allow' : 'Forbid'}
                  </button>
                </div>
              </div>

              {/* Lemmas */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Lemmas</h3>
                {editingField === 'src_lemmas' ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {editListItems.map((item, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={item}
                            onChange={(e) => updateListItem(index, e.target.value)}
                            className="flex-1 px-3 py-2 border-2 border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-600 text-sm bg-white text-gray-900 font-medium shadow-sm"
                            placeholder="Enter lemma"
                            autoFocus={index === editListItems.length - 1}
                          />
                          <div className="flex space-x-1">
                            {index > 0 && (
                              <button
                                onClick={() => moveListItem(index, index - 1)}
                                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                                title="Move up"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                </svg>
                              </button>
                            )}
                            {index < editListItems.length - 1 && (
                              <button
                                onClick={() => moveListItem(index, index + 1)}
                                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                                title="Move down"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            )}
                            <button
                              onClick={() => removeListItem(index)}
                              className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                              title="Remove"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <button
                      onClick={addListItem}
                      className="w-full px-3 py-2 border-2 border-dashed border-gray-300 rounded-md text-gray-600 hover:border-gray-400 hover:text-gray-700 text-sm flex items-center justify-center space-x-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span>Add Lemma</span>
                    </button>
                    
                    <div className="flex space-x-2">
                      <button
                        onClick={saveEdit}
                        disabled={isSaving}
                        className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="px-3 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400"
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="text-xs text-gray-600 font-medium bg-gray-50 px-2 py-1 rounded">Press Ctrl+Enter to save, Esc to cancel</p>
                  </div>
                ) : (
                  <div 
                    className="cursor-pointer hover:bg-gray-50 p-2 rounded border-2 border-transparent hover:border-gray-200 transition-colors"
                    onDoubleClick={() => startEditing('src_lemmas')}
                    title="Double-click to edit"
                  >
                    {(() => {
                      const allLemmas = currentNode.lemmas || [];
                      const srcLemmas = currentNode.src_lemmas || [];
                      // Only show regular lemmas that are NOT in src_lemmas
                      const regularLemmas = allLemmas.filter(lemma => !srcLemmas.includes(lemma));
                      const hasLemmas = regularLemmas.length > 0 || srcLemmas.length > 0;
                      
                      return hasLemmas ? (
                        <p className="text-gray-900 text-sm font-medium">
                          {regularLemmas.join('; ')}
                          {regularLemmas.length > 0 && srcLemmas.length > 0 && '; '}
                          {srcLemmas.map((lemma, idx) => (
                            <span key={idx}>
                              <strong>{lemma}</strong>
                              {idx < srcLemmas.length - 1 && '; '}
                            </span>
                          ))}
                        </p>
                      ) : (
                        <p className="text-gray-500 text-sm italic">No lemmas (double-click to add)</p>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Definition */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Definition</h3>
                {editingField === 'gloss' ? (
                  <div className="space-y-2">
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="w-full px-3 py-2 border-2 border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-600 text-sm resize-vertical bg-white text-gray-900 font-medium shadow-sm"
                      rows={3}
                      placeholder="Enter definition"
                      autoFocus
                    />
                    <div className="flex space-x-2">
                      <button
                        onClick={saveEdit}
                        disabled={isSaving}
                        className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="px-3 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400"
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="text-xs text-gray-600 font-medium bg-gray-50 px-2 py-1 rounded">Press Ctrl+Enter to save, Esc to cancel</p>
                  </div>
                ) : (
                  <p 
                    className="text-gray-900 text-sm leading-relaxed cursor-pointer hover:bg-gray-50 p-2 rounded border-2 border-transparent hover:border-gray-200 transition-colors"
                    onDoubleClick={() => startEditing('gloss')}
                    title="Double-click to edit"
                  >
                    {currentNode.gloss}
                  </p>
                )}
              </div>

              {/* Examples */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Examples</h3>
                {editingField === 'examples' ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {editListItems.map((item, index) => (
                        <div key={index} className="flex items-start space-x-2">
                          <textarea
                            value={item}
                            onChange={(e) => updateListItem(index, e.target.value)}
                            className="flex-1 px-3 py-2 border-2 border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-600 text-sm bg-white text-gray-900 font-medium shadow-sm resize-vertical"
                            rows={2}
                            placeholder="Enter example sentence"
                            autoFocus={index === editListItems.length - 1}
                          />
                          <div className="flex flex-col space-y-1 pt-1">
                            {index > 0 && (
                              <button
                                onClick={() => moveListItem(index, index - 1)}
                                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                                title="Move up"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                </svg>
                              </button>
                            )}
                            {index < editListItems.length - 1 && (
                              <button
                                onClick={() => moveListItem(index, index + 1)}
                                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                                title="Move down"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            )}
                            <button
                              onClick={() => removeListItem(index)}
                              className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                              title="Remove"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <button
                      onClick={addListItem}
                      className="w-full px-3 py-2 border-2 border-dashed border-gray-300 rounded-md text-gray-600 hover:border-gray-400 hover:text-gray-700 text-sm flex items-center justify-center space-x-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span>Add Example</span>
                    </button>
                    
                    <div className="flex space-x-2">
                      <button
                        onClick={saveEdit}
                        disabled={isSaving}
                        className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="px-3 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400"
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="text-xs text-gray-600 font-medium bg-gray-50 px-2 py-1 rounded">Press Ctrl+Enter to save, Esc to cancel</p>
                  </div>
                ) : (
                  <div 
                    className="cursor-pointer hover:bg-gray-50 p-2 rounded border-2 border-transparent hover:border-gray-200 transition-colors"
                    onDoubleClick={() => startEditing('examples')}
                    title="Double-click to edit"
                  >
                    {currentNode.examples && currentNode.examples.length > 0 ? (
                      <div className="space-y-2">
                        {currentNode.examples.map((example, index) => (
                          <p key={index} className="text-gray-900 text-sm leading-relaxed italic">
                            &quot;{example}&quot;
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm italic">No examples (double-click to add)</p>
                    )}
                  </div>
                )}
              </div>

              {/* Roles */}
              {((currentNode.roles && currentNode.roles.length > 0) || editingField === 'roles') && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Roles</h3>
                  {editingField === 'roles' ? (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        {editRoles.map((role) => (
                          <div key={role.clientId} className={`p-3 border rounded-lg ${role.main ? 'border-blue-300 bg-blue-50' : 'border-purple-300 bg-purple-50'}`}>
                            <div className="flex items-center space-x-2">
                              <select
                                value={role.roleType}
                                onChange={(e) => updateRole(role.clientId, 'roleType', e.target.value)}
                                className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                              >
                                <option value="">Select role type</option>
                                {roleTypes.map((roleType) => (
                                  <option key={roleType.id} value={roleType.label}>
                                    {roleType.label}
                                  </option>
                                ))}
                              </select>
                              <label className="flex items-center space-x-1 text-xs">
                                <input
                                  type="checkbox"
                                  checked={role.main}
                                  onChange={(e) => updateRole(role.clientId, 'main', e.target.checked)}
                                  className="rounded"
                                />
                                <span>Main</span>
                              </label>
                              <button
                                onClick={() => removeRole(role.clientId)}
                                className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                                title="Remove role"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                            <textarea
                              ref={(el) => setRoleFieldRef(role.clientId, 'description', 'main', el)}
                              value={role.description}
                              onChange={(e) => {
                                e.stopPropagation();
                                storeRoleSelection(role.clientId, 'description', 'main', e.currentTarget);
                                updateRole(role.clientId, 'description', e.target.value);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onFocus={(e) => {
                                e.stopPropagation();
                                handleRoleFieldFocus(role.clientId, 'description', 'main');
                              }}
                              onBlur={() => handleRoleFieldBlur(role.clientId, 'description', 'main')}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white text-gray-900 resize-vertical"
                              rows={2}
                              placeholder="Role description"
                            />
                            <textarea
                              ref={(el) => setRoleFieldRef(role.clientId, 'exampleSentence', 'main', el)}
                              value={role.exampleSentence}
                              onChange={(e) => {
                                e.stopPropagation();
                                storeRoleSelection(role.clientId, 'exampleSentence', 'main', e.currentTarget);
                                updateRole(role.clientId, 'exampleSentence', e.target.value);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onFocus={(e) => {
                                e.stopPropagation();
                                handleRoleFieldFocus(role.clientId, 'exampleSentence', 'main');
                              }}
                              onBlur={() => handleRoleFieldBlur(role.clientId, 'exampleSentence', 'main')}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white text-gray-900 resize-vertical"
                              rows={1}
                              placeholder="Example sentence (optional)"
                            />
                          </div>
                        ))}
                      </div>
                      
                      <div className="flex space-x-2">
                        <button
                          onClick={() => addRole(true)}
                          className="flex-1 px-3 py-2 border-2 border-dashed border-blue-300 rounded-md text-blue-600 hover:border-blue-400 hover:text-blue-700 text-sm flex items-center justify-center space-x-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          <span>Add Main Role</span>
                        </button>
                        <button
                          onClick={() => addRole(false)}
                          className="flex-1 px-3 py-2 border-2 border-dashed border-purple-300 rounded-md text-purple-600 hover:border-purple-400 hover:text-purple-700 text-sm flex items-center justify-center space-x-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          <span>Add Alt Role</span>
                        </button>
                      </div>

                      {/* Role Groups Section */}
                      {editRoles.length > 1 && (
                        <div className="pt-4 border-t border-gray-200">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Role Groups (OR constraints)</h4>
                          <p className="text-xs text-gray-600 mb-3">Group roles that are alternatives to each other (one of these roles is required)</p>
                          
                          {editRoleGroups.length > 0 && (
                            <div className="space-y-3 mb-3">
                              {editRoleGroups.map((group, groupIndex) => (
                                <div key={group.id || `group-${groupIndex}`} className="p-3 border-2 border-gray-300 rounded-lg bg-gray-50">
                                  <div className="flex items-start justify-between mb-2">
                                    <input
                                      type="text"
                                      value={group.description}
                                      onChange={(e) => updateRoleGroup(groupIndex, 'description', e.target.value)}
                                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs bg-white text-gray-900"
                                      placeholder="Group description (optional)"
                                    />
                                    <button
                                      onClick={() => removeRoleGroup(groupIndex)}
                                      className="ml-2 p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                                      title="Remove group"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                  <div className="space-y-1">
                                    {editRoles.map((role) => {
                                      const roleIdentifier = role.clientId;
                                      const isInGroup = group.role_ids.includes(roleIdentifier);
                                      return (
                                        <label key={roleIdentifier} className="flex items-center space-x-2 text-xs cursor-pointer hover:bg-white p-1 rounded">
                                          <input
                                            type="checkbox"
                                            checked={isInGroup}
                                            onChange={() => toggleRoleInGroup(groupIndex, roleIdentifier)}
                                            className="rounded"
                                          />
                                          <span className={role.main ? 'text-blue-700 font-medium' : 'text-purple-700'}>
                                            {role.roleType || '(no type)'}
                                          </span>
                                          <span className="text-gray-600 truncate">
                                            {role.description ? `- ${role.description.substring(0, 30)}${role.description.length > 30 ? '...' : ''}` : ''}
                                          </span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                  {group.role_ids.length < 2 && (
                                    <p className="text-xs text-red-600 mt-2">⚠️ Group needs at least 2 roles</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          
                          <button
                            onClick={addRoleGroup}
                            className="w-full px-3 py-2 border-2 border-dashed border-gray-300 rounded-md text-gray-600 hover:border-gray-400 hover:text-gray-700 text-sm flex items-center justify-center space-x-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <span>Add Role Group</span>
                          </button>
                        </div>
                      )}
                      
                      <div className="flex space-x-2">
                        <button
                          onClick={saveEdit}
                          disabled={isSaving}
                          className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                          {isSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="px-3 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div 
                      className="cursor-pointer hover:bg-gray-50 p-2 rounded border-2 border-transparent hover:border-gray-200 transition-colors"
                      onDoubleClick={() => startEditing('roles')}
                      title="Double-click to edit"
                    >
                      {currentNode.roles && currentNode.roles.length > 0 ? (
                        <div className="space-y-2">
                          {(() => {
                            // Create a map of role IDs to check which roles are in groups
                            const rolesInGroups = new Set<string>();
                            const roleGroups = currentNode.role_groups || [];
                            roleGroups.forEach(group => {
                              group.role_ids.forEach(roleId => rolesInGroups.add(roleId));
                            });
                            
                            // Separate roles that are not in groups
                            const sortedRoles = sortRolesByPrecedence(currentNode.roles);
                            const ungroupedRoles = sortedRoles.filter(role => !rolesInGroups.has(role.id));
                            
                            return (
                              <>
                                {/* Render ungrouped roles */}
                                {ungroupedRoles.map((role, index) => (
                                  <div key={`role-${index}`} className="text-sm">
                                    <span className={`font-medium ${role.main ? 'text-blue-800' : 'text-purple-800'}`}>
                                      {role.role_type.label}:
                                    </span>{' '}
                                    <span className="text-gray-900">{role.description || 'No description'}</span>
                                    {role.example_sentence && (
                                      <div className="text-xs text-gray-600 italic mt-1">
                                        &quot;{role.example_sentence}&quot;
                                      </div>
                                    )}
                                  </div>
                                ))}
                                
                                {/* Render role groups with OR indicators */}
                                {roleGroups.map((group, groupIdx) => {
                                  const groupRoles = currentNode.roles!.filter(role => group.role_ids.includes(role.id));
                                  if (groupRoles.length === 0) return null;
                                  
                                  return (
                                    <div 
                                      key={`group-${groupIdx}`}
                                      className="border border-black rounded px-3 py-2 bg-gray-50"
                                      title={group.description || 'OR group: one of these roles is required'}
                                    >
                                      {groupRoles.map((role, roleIdx) => (
                                        <React.Fragment key={`group-${groupIdx}-role-${roleIdx}`}>
                                          {roleIdx > 0 && (
                                            <span className="mx-2 text-sm font-bold text-gray-700">OR</span>
                                          )}
                                          <div className="inline-block text-sm">
                                            <span className={`font-medium ${role.main ? 'text-blue-800' : 'text-purple-800'}`}>
                                              {role.role_type.label}:
                                            </span>{' '}
                                            <span className="text-gray-900">{role.description || 'No description'}</span>
                                          </div>
                                        </React.Fragment>
                                      ))}
                                    </div>
                                  );
                                })}
                              </>
                            );
                          })()}
                        </div>
                      ) : (
                        <p className="text-gray-500 text-sm italic">No roles (double-click to add)</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Parents (Hypernyms) */}
              {currentNode.parents.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Hypernyms ({currentNode.parents.length})
                  </h3>
                  <div className="space-y-2">
                    {currentNode.parents.map(parent => (
                      <button
                        key={parent.id}
                        onClick={() => handleNodeClick(parent.id)}
                        className="block w-full text-left p-3 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition-colors"
                      >
                        <div className="font-medium text-green-800 text-sm">
                          {(() => {
                            const allLemmas = parent.lemmas || [];
                            const srcLemmas = parent.src_lemmas || [];
                            const regularLemmas = allLemmas.filter(lemma => !srcLemmas.includes(lemma));
                            if (regularLemmas.length === 0 && srcLemmas.length === 0) return parent.id;
                            
                            return (
                              <>
                                {regularLemmas.join(', ')}
                                {regularLemmas.length > 0 && srcLemmas.length > 0 && ', '}
                                {srcLemmas.map((lemma, idx) => (
                                  <span key={idx}>
                                    <strong>{lemma}</strong>
                                    {idx < srcLemmas.length - 1 && ', '}
                                  </span>
                                ))}
                              </>
                            );
                          })()}
                        </div>
                        <div className="text-green-600 text-xs mt-1 line-clamp-2">
                          {parent.gloss}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Children (Hyponyms) */}
              {currentNode.children.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Hyponyms ({currentNode.children.length})
                  </h3>
                  <div className="space-y-2">
                    {currentNode.children.map(child => (
                      <button
                        key={child.id}
                        onClick={() => handleNodeClick(child.id)}
                        className="block w-full text-left p-3 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 rounded-lg transition-colors"
                      >
                        <div className="font-medium text-yellow-800 text-sm">
                          {(() => {
                            const allLemmas = child.lemmas || [];
                            const srcLemmas = child.src_lemmas || [];
                            const regularLemmas = allLemmas.filter(lemma => !srcLemmas.includes(lemma));
                            if (regularLemmas.length === 0 && srcLemmas.length === 0) return child.id;
                            
                            return (
                              <>
                                {regularLemmas.join(', ')}
                                {regularLemmas.length > 0 && srcLemmas.length > 0 && ', '}
                                {srcLemmas.map((lemma, idx) => (
                                  <span key={idx}>
                                    <strong>{lemma}</strong>
                                    {idx < srcLemmas.length - 1 && ', '}
                                  </span>
                                ))}
                              </>
                            );
                          })()}
                        </div>
                        <div className="text-yellow-600 text-xs mt-1 line-clamp-2">
                          {child.gloss}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Causes */}
              {currentNode.causes && currentNode.causes.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Causes ({currentNode.causes.length})
                  </h3>
                  <div className="space-y-2">
                    {currentNode.causes.map(cause => (
                      <button
                        key={cause.id}
                        onClick={() => handleNodeClick(cause.id)}
                        className="block w-full text-left p-3 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors"
                      >
                        <div className="font-medium text-purple-800 text-sm">
                          {(() => {
                            const allLemmas = cause.lemmas || [];
                            const srcLemmas = cause.src_lemmas || [];
                            const regularLemmas = allLemmas.filter(lemma => !srcLemmas.includes(lemma));
                            if (regularLemmas.length === 0 && srcLemmas.length === 0) return cause.id;
                            
                            return (
                              <>
                                {regularLemmas.join(', ')}
                                {regularLemmas.length > 0 && srcLemmas.length > 0 && ', '}
                                {srcLemmas.map((lemma, idx) => (
                                  <span key={idx}>
                                    <strong>{lemma}</strong>
                                    {idx < srcLemmas.length - 1 && ', '}
                                  </span>
                                ))}
                              </>
                            );
                          })()}
                        </div>
                        <div className="text-purple-600 text-xs mt-1 line-clamp-2">
                          {cause.gloss}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Entails */}
              {currentNode.entails && currentNode.entails.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Entails ({currentNode.entails.length})
                  </h3>
                  <div className="space-y-2">
                    {currentNode.entails.map(entail => (
                      <button
                        key={entail.id}
                        onClick={() => handleNodeClick(entail.id)}
                        className="block w-full text-left p-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
                      >
                        <div className="font-medium text-indigo-800 text-sm">
                          {(() => {
                            const allLemmas = entail.lemmas || [];
                            const srcLemmas = entail.src_lemmas || [];
                            const regularLemmas = allLemmas.filter(lemma => !srcLemmas.includes(lemma));
                            if (regularLemmas.length === 0 && srcLemmas.length === 0) return entail.id;
                            
                            return (
                              <>
                                {regularLemmas.join(', ')}
                                {regularLemmas.length > 0 && srcLemmas.length > 0 && ', '}
                                {srcLemmas.map((lemma, idx) => (
                                  <span key={idx}>
                                    <strong>{lemma}</strong>
                                    {idx < srcLemmas.length - 1 && ', '}
                                  </span>
                                ))}
                              </>
                            );
                          })()}
                        </div>
                        <div className="text-indigo-600 text-xs mt-1 line-clamp-2">
                          {entail.gloss}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Similar to (Also See) */}
              {currentNode.alsoSee && currentNode.alsoSee.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Similar to ({currentNode.alsoSee.length})
                  </h3>
                  <div className="space-y-2">
                    {currentNode.alsoSee.map(similar => (
                      <button
                        key={similar.id}
                        onClick={() => handleNodeClick(similar.id)}
                        className="block w-full text-left p-3 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors"
                      >
                        <div className="font-medium text-teal-800 text-sm">
                          {(() => {
                            const allLemmas = similar.lemmas || [];
                            const srcLemmas = similar.src_lemmas || [];
                            const regularLemmas = allLemmas.filter(lemma => !srcLemmas.includes(lemma));
                            if (regularLemmas.length === 0 && srcLemmas.length === 0) return similar.id;
                            
                            return (
                              <>
                                {regularLemmas.join(', ')}
                                {regularLemmas.length > 0 && srcLemmas.length > 0 && ', '}
                                {srcLemmas.map((lemma, idx) => (
                                  <span key={idx}>
                                    <strong>{lemma}</strong>
                                    {idx < srcLemmas.length - 1 && ', '}
                                  </span>
                                ))}
                              </>
                            );
                          })()}
                        </div>
                        <div className="text-teal-600 text-xs mt-1 line-clamp-2">
                          {similar.gloss}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!currentNode && !isLoading && !error && (
            <div className="text-center text-gray-500 mt-12">
              <svg className="h-12 w-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-sm">Search for a lexical entry to begin exploring</p>
            </div>
          )}
        </aside>
        )}

        {/* Main Graph Area */}
        <div className="flex-1 p-6 bg-white">
          {currentNode && !isLoading ? (
            <div className="h-full flex flex-col">
              {/* Breadcrumbs - only show in graph mode (troponymy) */}
              <div className="mb-4">
                <Breadcrumbs 
                  items={currentView === 'graph' ? breadcrumbs : []} 
                  onNavigate={handleBreadcrumbNavigate}
                  onHomeClick={handleHomeClick}
                  onRefreshClick={handleRefreshClick}
                />
              </div>
              
              {/* Graph */}
              <div className="flex-1">
                {currentView === 'graph' ? (
                  <LexicalGraph 
                    currentNode={currentNode} 
                    onNodeClick={handleNodeClick}
                    onEditClick={() => setIsEditOverlayOpen(true)}
                    mode={mode}
                  />
                ) : (
                  <RecipesGraph
                    currentNode={currentNode}
                    recipes={entryRecipes?.recipes || []}
                    selectedRecipeId={selectedRecipeId}
                    onSelectRecipe={(rid) => setSelectedRecipeId(rid)}
                    onNodeClick={handleNodeClick}
                    onEditClick={() => setIsEditOverlayOpen(true)}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center bg-white rounded-lg shadow-sm">
              {isLoading ? (
                <div className="text-center">
                  <div className="animate-spin h-12 w-12 border-2 border-gray-300 border-t-blue-600 rounded-full mx-auto mb-4"></div>
                  <p className="text-gray-500">Loading graph...</p>
                </div>
              ) : (
                <RootNodesView onNodeClick={handleNodeClick} />
              )}
            </div>
          )}
        </div>

        {/* Edit Overlay */}
        {isEditOverlayOpen && currentNode && (
          <div 
            className="fixed inset-0 flex items-center justify-center z-50"
            onClick={(e) => {
              // Close only if clicking the backdrop directly
              if (e.target === e.currentTarget && !editingField) {
                setIsEditOverlayOpen(false);
              }
            }}
          >
            <div 
              className="absolute inset-0"
              style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}
            ></div>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl mx-4 max-h-[85vh] overflow-hidden relative z-10 flex flex-col">
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">Edit Entry</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-sm text-gray-600">{currentNode.id}</p>
                    {codeValidationMessage && !isSaving && (
                      <span className="text-xs text-green-600 font-medium">
                        {codeValidationMessage}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteConfirm(true);
                    }}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors cursor-pointer"
                    title="Delete Entry"
                  >
                    Delete
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!editingField) {
                        setIsEditOverlayOpen(false);
                      }
                    }}
                    className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                    title="Close (or press Escape)"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div
                ref={overlayContentRef}
                className="overflow-y-auto flex-1"
                onScroll={(event) => {
                  lastOverlayScrollTopRef.current = (event.currentTarget as HTMLDivElement).scrollTop;
                }}
              >
                {/* Moderation Section */}
                <div className="border-b border-gray-200 bg-gray-50">
                  <div className="px-6 py-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Moderation</h4>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleFlagToggle}
                        className={`flex items-center gap-1 px-3 py-1 text-sm font-medium border rounded-md transition-colors cursor-pointer ${
                          currentNode.flagged 
                            ? 'text-orange-700 bg-orange-100 border-orange-200 hover:bg-orange-200' 
                            : 'text-gray-700 bg-gray-100 border-gray-200 hover:bg-gray-200'
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 2H21l-3 6 3 6h-8.5l-1-2H5a2 2 0 00-2 2zm9-13.5V9" />
                        </svg>
                        {currentNode.flagged ? 'Unflag' : 'Flag'}
                      </button>
                      <button
                        onClick={handleForbidToggle}
                        className={`flex items-center gap-1 px-3 py-1 text-sm font-medium border rounded-md transition-colors cursor-pointer ${
                          currentNode.forbidden 
                            ? 'text-red-700 bg-red-100 border-red-200 hover:bg-red-200' 
                            : 'text-gray-700 bg-gray-100 border-gray-200 hover:bg-gray-200'
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
                        </svg>
                        {currentNode.forbidden ? 'Allow' : 'Forbid'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Basic Info Section */}
                <div className="border-b border-gray-200">
                  <button
                    onClick={() => setOverlaySections(prev => ({ ...prev, basicInfo: !prev.basicInfo }))}
                    className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-medium text-gray-900">Basic Information</span>
                    </div>
                    <svg 
                      className={`w-4 h-4 text-gray-500 transition-transform ${overlaySections.basicInfo ? 'rotate-180' : ''}`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {overlaySections.basicInfo && (
                    <div className="px-6 pb-6 pt-2 space-y-4">
                      {/* Code (ID) - Lemma Part Only */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-medium text-gray-700">Entry Code (Lemma Part)</h3>
                          {editingField !== 'code' && (
                            <button
                              onClick={() => startEditing('code')}
                              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                        {editingField === 'code' ? (
                          <div className="space-y-2">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                                  placeholder="Enter lemma (e.g., communicate)"
                                  autoFocus
                                />
                                <span className="text-gray-500 text-sm font-mono">
                                  .{currentNode.id.match(/\.([vnar])\.(\d+)$/)?.[1]}.XX
                                </span>
                              </div>
                              {codeValidationMessage && (
                                <p className="text-xs text-blue-600 font-medium">
                                  {codeValidationMessage}
                                </p>
                              )}
                              <p className="text-xs text-gray-600">
                                The numeric part (.XX) will be automatically assigned to ensure uniqueness.
                              </p>
                            </div>
                            <div className="flex space-x-2 pt-2">
                              <button
                                onClick={saveEdit}
                                disabled={isSaving}
                                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                              >
                                {isSaving ? 'Validating & Saving...' : 'Save'}
                              </button>
                              <button
                                onClick={cancelEditing}
                                className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-900 font-mono">
                            {currentNode.id}
                          </div>
                        )}
                      </div>

                      {/* Src Lemmas */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-medium text-gray-700">Source Lemmas</h3>
                          {editingField !== 'src_lemmas' && (
                            <button
                              onClick={() => startEditing('src_lemmas')}
                              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                        {editingField === 'src_lemmas' ? (
                          <div className="space-y-2">
                            <div className="space-y-2">
                              {editListItems.map((item, index) => (
                                <div key={index} className="flex items-center space-x-2">
                                  <input
                                    type="text"
                                    value={item}
                                    onChange={(e) => updateListItem(index, e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                    placeholder="Enter lemma"
                                  />
                                  <button
                                    onClick={() => removeListItem(index)}
                                    className="p-2 text-red-500 hover:bg-red-50 rounded"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              ))}
                            </div>
                            <button
                              onClick={addListItem}
                              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                            >
                              + Add Lemma
                            </button>
                            <div className="flex space-x-2 pt-2">
                              <button
                                onClick={saveEdit}
                                disabled={isSaving}
                                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                              >
                                {isSaving ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                onClick={cancelEditing}
                                className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-gray-900">
                            {currentNode.src_lemmas && currentNode.src_lemmas.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {currentNode.src_lemmas.map((lemma, idx) => (
                                  <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold">
                                    {lemma}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-gray-500 text-sm italic">No source lemmas</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Definition */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-medium text-gray-700">Definition</h3>
                          {editingField !== 'gloss' && (
                            <button
                              onClick={() => startEditing('gloss')}
                              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                        {editingField === 'gloss' ? (
                          <div className="space-y-2">
                            <textarea
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-vertical"
                              rows={3}
                              placeholder="Enter definition"
                              autoFocus
                            />
                            <div className="flex space-x-2">
                              <button
                                onClick={saveEdit}
                                disabled={isSaving}
                                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                              >
                                {isSaving ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                onClick={cancelEditing}
                                className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-gray-900 text-sm leading-relaxed">
                            {currentNode.gloss}
                          </p>
                        )}
                      </div>

                      {/* Examples */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-sm font-medium text-gray-700">Examples</h3>
                          {editingField !== 'examples' && (
                            <button
                              onClick={() => startEditing('examples')}
                              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                        {editingField === 'examples' ? (
                          <div className="space-y-2">
                            <div className="space-y-2">
                              {editListItems.map((item, index) => (
                                <div key={index} className="flex items-start space-x-2">
                                  <textarea
                                    value={item}
                                    onChange={(e) => updateListItem(index, e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-vertical"
                                    rows={2}
                                    placeholder="Enter example sentence"
                                  />
                                  <button
                                    onClick={() => removeListItem(index)}
                                    className="p-2 text-red-500 hover:bg-red-50 rounded"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              ))}
                            </div>
                            <button
                              onClick={addListItem}
                              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                            >
                              + Add Example
                            </button>
                            <div className="flex space-x-2 pt-2">
                              <button
                                onClick={saveEdit}
                                disabled={isSaving}
                                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                              >
                                {isSaving ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                onClick={cancelEditing}
                                className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            {currentNode.examples && currentNode.examples.length > 0 ? (
                              <div className="space-y-1">
                                {currentNode.examples.map((example, index) => (
                                  <p key={index} className="text-gray-900 text-sm italic">
                                    &quot;{example}&quot;
                                  </p>
                                ))}
                              </div>
                            ) : (
                              <p className="text-gray-500 text-sm italic">No examples</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Verb Properties Section */}
                {mode === 'verbs' && (
                  <OverlaySection
                    title="Verb Properties"
                    icon={
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                      </svg>
                    }
                    isOpen={overlaySections.verbProperties}
                    onToggle={() => setOverlaySections(prev => ({ ...prev, verbProperties: !prev.verbProperties }))}
                  >
                    {/* Vendler Class */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-medium text-gray-700">Vendler Class</h3>
                        {editingField !== 'vendler_class' && (
                          <button
                            onClick={() => startEditing('vendler_class')}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                      {editingField === 'vendler_class' ? (
                        <div className="space-y-2">
                          <select
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          >
                            <option value="">None</option>
                            {vendlerClasses.map(vc => (
                              <option key={vc} value={vc}>{vc}</option>
                            ))}
                          </select>
                          <div className="flex space-x-2">
                            <button
                              onClick={saveEdit}
                              disabled={isSaving}
                              className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                              {isSaving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-900 text-sm">
                          {currentNode.vendler_class || <span className="text-gray-500 italic">None</span>}
                        </p>
                      )}
                    </div>

                    {/* Frame */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-medium text-gray-700">Frame</h3>
                        {editingField !== 'frame' && (
                          <button
                            onClick={() => startEditing('frame')}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                      {editingField === 'frame' ? (
                        <div className="space-y-2">
                          <select
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          >
                            <option value="">None</option>
                            {availableFrames.map(frame => (
                              <option key={frame.id} value={frame.id}>{frame.frame_name}</option>
                            ))}
                          </select>
                          <div className="flex space-x-2">
                            <button
                              onClick={saveEdit}
                              disabled={isSaving}
                              className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                              {isSaving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-900 text-sm">
                          {currentNode.frame?.frame_name || <span className="text-gray-500 italic">None</span>}
                        </p>
                      )}
                    </div>

                    {/* Category (Lexfile) */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-medium text-gray-700">Category</h3>
                        {editingField !== 'lexfile' && (
                          <button
                            onClick={() => startEditing('lexfile')}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                      {editingField === 'lexfile' ? (
                        <div className="space-y-2">
                          <select
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          >
                            {availableLexfiles.map(lf => (
                              <option key={lf} value={lf}>{lf}</option>
                            ))}
                          </select>
                          <div className="flex space-x-2">
                            <button
                              onClick={saveEdit}
                              disabled={isSaving}
                              className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                              {isSaving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-900 text-sm">{currentNode.lexfile}</p>
                      )}
                    </div>
                  </OverlaySection>
                )}

                {/* Roles Section (Verbs only) */}
                {mode === 'verbs' && (
                  <OverlaySection
                    title="Roles"
                    icon={
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    }
                    isOpen={overlaySections.roles}
                    onToggle={() => setOverlaySections(prev => ({ ...prev, roles: !prev.roles }))}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-medium text-gray-700">Thematic Roles</h3>
                        {editingField !== 'roles' && (
                          <button
                            onClick={() => startEditing('roles')}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                      {editingField === 'roles' ? (
                        <div className="space-y-3">
                          {editRoles.map((role) => (
                            <div key={role.clientId} className={`p-3 border rounded-lg ${role.main ? 'border-blue-300 bg-blue-50' : 'border-purple-300 bg-purple-50'}`}>
                              <div className="flex items-center justify-between mb-2">
                                <select
                                  value={role.roleType}
                                  onChange={(e) => updateRole(role.clientId, 'roleType', e.target.value)}
                                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                                >
                                  <option value="">Select role type</option>
                                  {roleTypes.map((rt) => (
                                    <option key={rt.id} value={rt.label}>{rt.label}</option>
                                  ))}
                                </select>
                                <label className="ml-2 flex items-center space-x-1 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={role.main}
                                    onChange={(e) => updateRole(role.clientId, 'main', e.target.checked)}
                                    className="rounded"
                                  />
                                  <span>Main</span>
                                </label>
                                <button
                                  onClick={() => removeRole(role.clientId)}
                                  className="ml-2 p-1 text-red-500 hover:bg-red-100 rounded"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                              <textarea
                                ref={(el) => setRoleFieldRef(role.clientId, 'description', 'main', el)}
                                value={role.description}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  storeRoleSelection(role.clientId, 'description', 'main', e.currentTarget);
                                  updateRole(role.clientId, 'description', e.target.value);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                onFocus={(e) => {
                                  e.stopPropagation();
                                  handleRoleFieldFocus(role.clientId, 'description', 'main');
                                }}
                                onBlur={() => handleRoleFieldBlur(role.clientId, 'description', 'main')}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white text-gray-900 resize-vertical"
                                rows={2}
                                placeholder="Role description"
                              />
                              <textarea
                                ref={(el) => setRoleFieldRef(role.clientId, 'exampleSentence', 'main', el)}
                                value={role.exampleSentence}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  storeRoleSelection(role.clientId, 'exampleSentence', 'main', e.currentTarget);
                                  updateRole(role.clientId, 'exampleSentence', e.target.value);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                onFocus={(e) => {
                                  e.stopPropagation();
                                  handleRoleFieldFocus(role.clientId, 'exampleSentence', 'main');
                                }}
                                onBlur={() => handleRoleFieldBlur(role.clientId, 'exampleSentence', 'main')}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white text-gray-900 resize-vertical"
                                rows={1}
                                placeholder="Example sentence (optional)"
                              />
                            </div>
                          ))}
                          <div className="flex space-x-2">
                            <button
                              onClick={() => addRole(true)}
                              className="flex-1 px-3 py-2 border border-blue-300 rounded-md text-blue-600 hover:bg-blue-50 text-sm"
                            >
                              + Add Main Role
                            </button>
                            <button
                              onClick={() => addRole(false)}
                              className="flex-1 px-3 py-2 border border-purple-300 rounded-md text-purple-600 hover:bg-purple-50 text-sm"
                            >
                              + Add Alt Role
                            </button>
                          </div>

                          {/* Role Groups */}
                          {editRoles.length > 1 && (
                            <div className="pt-4 border-t">
                              <h4 className="text-sm font-medium text-gray-700 mb-2">Role Groups (OR constraints)</h4>
                              {editRoleGroups.map((group, groupIndex) => (
                                <div key={groupIndex} className="p-3 border border-gray-300 rounded-lg bg-gray-50 mb-2">
                                  <div className="flex items-start justify-between mb-2">
                                    <input
                                      type="text"
                                      value={group.description}
                                      onChange={(e) => updateRoleGroup(groupIndex, 'description', e.target.value)}
                                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs bg-white text-gray-900"
                                      placeholder="Group description (optional)"
                                    />
                                    <button
                                      onClick={() => removeRoleGroup(groupIndex)}
                                      className="ml-2 p-1 text-red-500 hover:bg-red-100 rounded"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                  <div className="space-y-1">
                                    {editRoles.map((role) => {
                                      const roleIdentifier = role.clientId;
                                      const isInGroup = group.role_ids.includes(roleIdentifier);
                                      return (
                                        <label key={roleIdentifier} className="flex items-center space-x-2 text-xs cursor-pointer hover:bg-white p-1 rounded">
                                          <input
                                            type="checkbox"
                                            checked={isInGroup}
                                            onChange={() => toggleRoleInGroup(groupIndex, roleIdentifier)}
                                            className="rounded"
                                          />
                                          <span className={role.main ? 'text-blue-700 font-medium' : 'text-purple-700'}>
                                            {role.roleType || '(no type)'}
                                          </span>
                                          <span className="text-gray-600 truncate">
                                            {role.description ? `- ${role.description.substring(0, 30)}${role.description.length > 30 ? '...' : ''}` : ''}
                                          </span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                  {group.role_ids.length < 2 && (
                                    <p className="text-xs text-red-600 mt-2">⚠️ Group needs at least 2 roles</p>
                                  )}
                                </div>
                              ))}
                              <button
                                onClick={addRoleGroup}
                                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                              >
                                + Add Role Group
                              </button>
                            </div>
                          )}

                          <div className="flex space-x-2 pt-2 border-t">
                            <button
                              onClick={saveEdit}
                              disabled={isSaving}
                              className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                              {isSaving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          {currentNode.roles && currentNode.roles.length > 0 ? (
                            <div className="space-y-2">
                              {sortRolesByPrecedence(currentNode.roles).map((role, index) => (
                                <div key={index} className="text-sm">
                                  <span className={`font-medium ${role.main ? 'text-blue-800' : 'text-purple-800'}`}>
                                    {role.role_type.label}:
                                  </span>{' '}
                                  <span className="text-gray-900">{role.description || 'No description'}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-500 text-sm italic">No roles</p>
                          )}
                        </div>
                      )}
                    </div>
                  </OverlaySection>
                )}

                {/* Legal Constraints Section */}
                <OverlaySection
                  title="Legal Constraints"
                  icon={
                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  }
                  isOpen={overlaySections.legalConstraints}
                  onToggle={() => setOverlaySections(prev => ({ ...prev, legalConstraints: !prev.legalConstraints }))}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-gray-700">Legal Constraints</h3>
                      {editingField !== 'legal_constraints' && (
                        <button
                          onClick={() => startEditing('legal_constraints')}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    {editingField === 'legal_constraints' ? (
                      <div className="space-y-2">
                        <div className="space-y-2">
                          {editListItems.map((item, index) => (
                            <div key={index} className="flex items-center space-x-2">
                              <input
                                type="text"
                                value={item}
                                onChange={(e) => updateListItem(index, e.target.value)}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                placeholder="Enter legal constraint"
                              />
                              <button
                                onClick={() => removeListItem(index)}
                                className="p-2 text-red-500 hover:bg-red-50 rounded"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={addListItem}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          + Add Constraint
                        </button>
                        <div className="flex space-x-2 pt-2">
                          <button
                            onClick={saveEdit}
                            disabled={isSaving}
                            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                          >
                            {isSaving ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {currentNode.legal_constraints && currentNode.legal_constraints.length > 0 ? (
                          <div className="space-y-1">
                            {currentNode.legal_constraints.map((constraint, index) => (
                              <p key={index} className="text-gray-900 text-sm">
                                {constraint}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-gray-500 text-sm italic">No legal constraints</p>
                        )}
                      </div>
                    )}
                  </div>
                </OverlaySection>

                {/* Relations Section */}
                <OverlaySection
                  title="Relations (Hypernyms & Hyponyms)"
                  icon={
                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  }
                  isOpen={overlaySections.relations}
                  onToggle={() => setOverlaySections(prev => ({ ...prev, relations: !prev.relations }))}
                >
                  {/* Hypernym */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-gray-700">Hypernym (Parent)</h3>
                      {editingField !== 'hypernym' && (
                        <button
                          onClick={() => startEditing('hypernym')}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                        >
                          Change
                        </button>
                      )}
                    </div>
                    {editingField === 'hypernym' ? (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          {/* Current Hypernym */}
                          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <p className="text-xs text-yellow-800 font-medium mb-1">Current Hypernym:</p>
                            <p className="text-sm text-gray-900">
                              {currentNode.parents[0]?.id || <span className="text-gray-500 italic">None</span>}
                            </p>
                          </div>

                          {/* Search for New Hypernym */}
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-2">
                              Search for New Hypernym:
                            </label>
                            <SearchBox
                              onSelectResult={(result) => {
                                setEditValue(result.id);
                              }}
                              placeholder="Search entries..."
                              mode={mode}
                            />
                          </div>

                          {/* Selected New Hypernym */}
                          {editValue && editValue !== currentNode.parents[0]?.id && (
                            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                              <p className="text-xs text-green-800 font-medium mb-1">New Hypernym:</p>
                              <p className="text-sm text-gray-900">{editValue}</p>
                            </div>
                          )}

                          {/* Hyponyms to Move */}
                          {currentNode.children.length > 0 && editValue && editValue !== currentNode.parents[0]?.id && (
                            <div className="border-t pt-3">
                              <h4 className="text-sm font-medium text-gray-700 mb-2">
                                Manage Hyponyms ({currentNode.children.length} total)
                              </h4>
                              <p className="text-xs text-gray-600 mb-3">
                                Select which hyponyms should move with this entry to the new hypernym.
                                Unchecked hyponyms will stay and become children of the old hypernym.
                              </p>
                              <div className="space-y-2 max-h-60 overflow-y-auto">
                                {currentNode.children.map((child) => (
                                  <label 
                                    key={child.id}
                                    className="flex items-start gap-2 p-2 hover:bg-white rounded cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedHyponymsToMove.has(child.id)}
                                      onChange={(e) => {
                                        const newSet = new Set(selectedHyponymsToMove);
                                        if (e.target.checked) {
                                          newSet.add(child.id);
                                        } else {
                                          newSet.delete(child.id);
                                        }
                                        setSelectedHyponymsToMove(newSet);
                                      }}
                                      className="mt-0.5 rounded"
                                    />
                                    <div className="flex-1">
                                      <p className="text-sm font-medium text-gray-900">{child.id}</p>
                                      <p className="text-xs text-gray-600">{child.gloss}</p>
                                    </div>
                                  </label>
                                ))}
                              </div>
                              <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
                                <p className="text-blue-900">
                                  <strong>{selectedHyponymsToMove.size}</strong> will move with this entry
                                </p>
                                <p className="text-blue-900">
                                  <strong>{currentNode.children.length - selectedHyponymsToMove.size}</strong> will stay with old hypernym
                                </p>
                              </div>
                            </div>
                          )}

                          {codeValidationMessage && (
                            <p className="text-xs text-blue-600 font-medium">
                              {codeValidationMessage}
                            </p>
                          )}
                        </div>

                        <div className="flex space-x-2 pt-2">
                          <button
                            onClick={saveEdit}
                            disabled={isSaving || !editValue}
                            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                          >
                            {isSaving ? 'Updating Relations...' : 'Save Changes'}
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="mb-3">
                          <h4 className="text-xs font-medium text-gray-700 mb-2">Current Hypernym:</h4>
                          {currentNode.parents.length > 0 ? (
                            <div className="p-2 bg-green-50 border border-green-200 rounded">
                              <p className="text-sm font-medium text-green-800">{currentNode.parents[0].id}</p>
                              <p className="text-xs text-green-600">{currentNode.parents[0].gloss}</p>
                            </div>
                          ) : (
                            <p className="text-gray-500 text-sm italic">No hypernym (root node)</p>
                          )}
                        </div>
                        <div>
                          <h4 className="text-xs font-medium text-gray-700 mb-2">Current Hyponyms ({currentNode.children.length}):</h4>
                          {currentNode.children.length > 0 ? (
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                              {currentNode.children.map((child) => (
                                <div key={child.id} className="p-2 bg-yellow-50 border border-yellow-200 rounded">
                                  <p className="text-sm font-medium text-yellow-800">{child.id}</p>
                                  <p className="text-xs text-yellow-600">{child.gloss}</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-500 text-sm italic">No hyponyms</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </OverlaySection>
              </div>
            </div>

            {/* Delete Confirmation Dialog */}
            {showDeleteConfirm && (
              <div className="absolute inset-0 flex items-center justify-center z-20">
                <div 
                  className="absolute inset-0 bg-black bg-opacity-50"
                  onClick={() => setShowDeleteConfirm(false)}
                ></div>
                <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4 relative z-30">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Entry</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Are you sure you want to delete <strong>{currentNode.id}</strong>?
                  </p>
                  {currentNode.children.length > 0 && (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                      <p className="text-sm text-blue-900 font-medium mb-1">
                        This entry has {currentNode.children.length} hyponym{currentNode.children.length !== 1 ? 's' : ''}:
                      </p>
                      <ul className="text-xs text-blue-800 list-disc list-inside max-h-32 overflow-y-auto">
                        {currentNode.children.slice(0, 5).map(child => (
                          <li key={child.id}>{child.id}</li>
                        ))}
                        {currentNode.children.length > 5 && (
                          <li className="text-blue-600 italic">...and {currentNode.children.length - 5} more</li>
                        )}
                      </ul>
                      <p className="text-xs text-blue-700 mt-2">
                        {currentNode.parents.length > 0 ? (
                          <>They will be reassigned to <strong>{currentNode.parents[0].id}</strong></>
                        ) : (
                          <>They will become root nodes</>
                        )}
                      </p>
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                      disabled={isDeleting}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteEntry}
                      className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors disabled:opacity-50"
                      disabled={isDeleting}
                    >
                      {isDeleting ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// function getPartOfSpeechLabel(pos: string): string {
//   const labels: Record<string, string> = {
//     'n': 'Noun',
//     'v': 'Verb',
//     'a': 'Adjective',
//     'r': 'Adverb',
//     's': 'Adjective Satellite',
//   };
//   return labels[pos] || pos;
// }
