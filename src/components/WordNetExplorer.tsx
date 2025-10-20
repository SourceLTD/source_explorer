'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  
  // Editing state
  const [editingField, setEditingField] = useState<'lemmas' | 'gloss' | 'examples' | 'roles' | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [editListItems, setEditListItems] = useState<string[]>([]);
  const [editRoles, setEditRoles] = useState<{id: string, description: string, roleType: string, exampleSentence: string, main: boolean}[]>([]);
  const [editRoleGroups, setEditRoleGroups] = useState<{id: string, description: string, role_ids: string[]}[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [roleTypes, setRoleTypes] = useState<RoleType[]>([]);

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

  const loadGraphNode = async (entryId: string, invalidateCache: boolean = false) => {
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
        ? `${apiPrefix}/${entryId}/graph?invalidate=true`
        : `${apiPrefix}/${entryId}/graph`;
        
      // Only fetch recipes for verbs
      const fetchPromises = [
        fetch(graphUrl),
        fetch(`/api/breadcrumbs/${entryId}`)
      ];
      
      if (mode === 'verbs') {
        fetchPromises.push(fetch(`${apiPrefix}/${entryId}/recipes`));
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
  };

  const handleNodeClick = (nodeId: string) => {
    // Reset the ref to allow loading the new node
    lastLoadedEntryRef.current = null;
    updateUrlParam(nodeId);
    setSelectedRecipeId(undefined);
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
    router.push(qs ? `/graph?${qs}` : '/graph', { scroll: false });
  };

  const handleRefreshClick = () => {
    if (currentNode) {
      loadGraphNode(currentNode.id, true); // Force cache invalidation
    }
  };

  const startEditing = (field: 'lemmas' | 'gloss' | 'examples' | 'roles') => {
    if (!currentNode) return;
    
    setEditingField(field);
    
    if (field === 'lemmas') {
      // For editing, display in the correct order: regular lemmas, then src_lemmas
      setEditListItems([...(currentNode.lemmas || []), ...(currentNode.src_lemmas || [])]);
    } else if (field === 'examples') {
      setEditListItems([...currentNode.examples]);
    } else if (field === 'gloss') {
      setEditValue(currentNode.gloss);
    } else if (field === 'roles') {
      setEditRoles(
        sortRolesByPrecedence(currentNode.roles || []).map(role => ({
          id: role.id,
          description: role.description || '',
          roleType: role.role_type.label,
          exampleSentence: role.example_sentence || '',
          main: role.main
        }))
      );
      setEditRoleGroups(
        (currentNode.role_groups || []).map(group => ({
          id: group.id,
          description: group.description || '',
          role_ids: group.role_ids
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
  };

  const saveEdit = async () => {
    if (!currentNode || !editingField) return;
    
    setIsSaving(true);
    try {
      const updateData: Record<string, unknown> = {};
      
      switch (editingField) {
        case 'lemmas':
          updateData.lemmas = editListItems.filter(s => s.trim());
          break;
        case 'gloss':
          updateData.gloss = editValue.trim();
          break;
        case 'examples':
          updateData.examples = editListItems.filter(s => s.trim());
          break;
        case 'roles':
          // Only verbs have roles
          if (mode === 'verbs') {
            updateData.roles = editRoles.filter(role => role.description.trim());
            updateData.role_groups = editRoleGroups.filter(group => group.role_ids.length >= 2);
          }
          break;
      }

      let apiPrefix = '/api/entries';
      if (mode === 'nouns') apiPrefix = '/api/nouns';
      else if (mode === 'adjectives') apiPrefix = '/api/adjectives';
      
      const response = await fetch(`${apiPrefix}/${currentNode.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        throw new Error('Failed to update entry');
      }

      // Reload the graph node to get updated data with cache invalidation
      await loadGraphNode(currentNode.id, true);
      
      setEditingField(null);
      setEditValue('');
      setEditListItems([]);
      setEditRoles([]);
      setEditRoleGroups([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFlagToggle = async () => {
    if (!currentNode) return;
    
    try {
      const response = await fetch('/api/entries/moderation', {
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

      // Reload the graph node to get updated data
      await loadGraphNode(currentNode.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update flag status');
    }
  };

  const handleForbidToggle = async () => {
    if (!currentNode) return;
    
    try {
      const response = await fetch('/api/entries/moderation', {
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

      // Reload the graph node to get updated data
      await loadGraphNode(currentNode.id);
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
  const updateRole = (index: number, field: 'description' | 'roleType' | 'exampleSentence' | 'main', value: string | boolean) => {
    setEditRoles(prev => prev.map((role, i) => 
      i === index ? { ...role, [field]: value } : role
    ));
  };

  const addRole = (main: boolean) => {
    setEditRoles(prev => [...prev, { id: '', description: '', roleType: '', exampleSentence: '', main }]);
  };

  const removeRole = (index: number) => {
    const roleId = editRoles[index].id;
    // Remove the role
    setEditRoles(prev => prev.filter((_, i) => i !== index));
    // Remove the role from any groups
    setEditRoleGroups(prev => prev.map(group => ({
      ...group,
      role_ids: group.role_ids.filter(id => id !== roleId)
    })).filter(group => group.role_ids.length >= 2));
  };

  // Role group editing helpers
  const addRoleGroup = () => {
    setEditRoleGroups(prev => [...prev, { id: '', description: '', role_ids: [] }]);
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

      // Reload the graph node to get updated data
      await loadGraphNode(currentNode.id);
      
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
  }, [searchParams, initialEntryId]);

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
        {/* Sidebar with Entry Details */}
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
                {editingField === 'lemmas' ? (
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
                    onDoubleClick={() => startEditing('lemmas')}
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
                        {editRoles.map((role, index) => (
                          <div key={index} className={`space-y-2 p-3 border rounded-lg ${role.main ? 'border-blue-200 bg-blue-50' : 'border-purple-200 bg-purple-50'}`}>
                            <div className="flex items-center space-x-2">
                              <select
                                value={role.roleType}
                                onChange={(e) => updateRole(index, 'roleType', e.target.value)}
                                className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs bg-white text-gray-900"
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
                                  onChange={(e) => updateRole(index, 'main', e.target.checked)}
                                  className="rounded"
                                />
                                <span>Main</span>
                              </label>
                              <button
                                onClick={() => removeRole(index)}
                                className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                                title="Remove role"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                            <textarea
                              value={role.description}
                              onChange={(e) => updateRole(index, 'description', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white text-gray-900 resize-vertical"
                              rows={2}
                              placeholder="Role description"
                            />
                            <textarea
                              value={role.exampleSentence}
                              onChange={(e) => updateRole(index, 'exampleSentence', e.target.value)}
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
                                <div key={groupIndex} className="p-3 border-2 border-gray-300 rounded-lg bg-gray-50">
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
                                    {editRoles.map((role, roleIndex) => {
                                      // Generate a temporary ID for new roles
                                      const roleId = role.id || `temp-${roleIndex}`;
                                      const isInGroup = group.role_ids.includes(roleId);
                                      return (
                                        <label key={roleIndex} className="flex items-center space-x-2 text-xs cursor-pointer hover:bg-white p-1 rounded">
                                          <input
                                            type="checkbox"
                                            checked={isInGroup}
                                            onChange={() => toggleRoleInGroup(groupIndex, roleId)}
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
                    mode={mode}
                  />
                ) : (
                  <RecipesGraph
                    currentNode={currentNode}
                    recipes={entryRecipes?.recipes || []}
                    selectedRecipeId={selectedRecipeId}
                    onSelectRecipe={(rid) => setSelectedRecipeId(rid)}
                    onNodeClick={handleNodeClick}
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
