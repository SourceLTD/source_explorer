'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GraphNode, SearchResult, BreadcrumbItem } from '@/lib/types';
import LexicalGraph from './LexicalGraph';
import SearchBox from './SearchBox';
import Breadcrumbs from './Breadcrumbs';
import ViewToggle, { ViewMode } from './ViewToggle';
import SignOutButton from './SignOutButton';
import RootNodesView from './RootNodesView';

interface WordNetExplorerProps {
  initialEntryId?: string;
}

export default function WordNetExplorer({ initialEntryId }: WordNetExplorerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentNode, setCurrentNode] = useState<GraphNode | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setSearchQuery] = useState<string>('');
  
  // Track last loaded entry to prevent duplicate calls
  const lastLoadedEntryRef = useRef<string | null>(null);
  
  // Editing state
  const [editingField, setEditingField] = useState<'lemmas' | 'gloss' | 'examples' | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [editListItems, setEditListItems] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Helper function to update URL parameters without page reload
  const updateUrlParam = (entryId: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('entry', entryId);
    router.push(`/graph?${params.toString()}`, { scroll: false });
  };

  const loadGraphNode = async (entryId: string) => {
    // Prevent duplicate calls for the same entry
    if (lastLoadedEntryRef.current === entryId) {
      return;
    }
    
    lastLoadedEntryRef.current = entryId;
    setIsLoading(true);
    setError(null);
    
    try {
      const [graphResponse, breadcrumbResponse] = await Promise.all([
        fetch(`/api/entries/${entryId}/graph`),
        fetch(`/api/breadcrumbs/${entryId}`)
      ]);

      if (!graphResponse.ok) {
        throw new Error('Failed to load entry');
      }

      const graphNode: GraphNode = await graphResponse.json();
      setCurrentNode(graphNode);

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
    // Clear the URL parameter
    router.push('/graph', { scroll: false });
  };

  const startEditing = (field: 'lemmas' | 'gloss' | 'examples') => {
    if (!currentNode) return;
    
    setEditingField(field);
    
    if (field === 'lemmas') {
      // For editing, combine src_lemmas and lemmas
      setEditListItems([...(currentNode.src_lemmas || []), ...(currentNode.lemmas || [])]);
    } else if (field === 'examples') {
      setEditListItems([...currentNode.examples]);
    } else if (field === 'gloss') {
      setEditValue(currentNode.gloss);
    }
  };

  const cancelEditing = () => {
    setEditingField(null);
    setEditValue('');
    setEditListItems([]);
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
      }

      const response = await fetch(`/api/entries/${currentNode.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        throw new Error('Failed to update entry');
      }

      // Reload the graph node to get updated data
      await loadGraphNode(currentNode.id);
      
      setEditingField(null);
      setEditValue('');
      setEditListItems([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
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

  // Moderation functions
  const handleModerationUpdate = async (updates: { flagged?: boolean; forbidden?: boolean }) => {
    if (!currentNode) return;

    try {
      const response = await fetch('/api/entries/moderation', {
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

  // Load entry based on URL params or initial prop
  useEffect(() => {
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
              Verbs
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
              />
            </div>
            <ViewToggle 
              currentView="graph"
              onViewChange={(view: ViewMode) => {
                if (view === 'table') {
                  router.push('/table');
                }
              }}
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
                  {[...(currentNode.src_lemmas || []), ...(currentNode.lemmas || [])][0] || currentNode.id} ({currentNode.id})
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
                    disabled
                    className="flex items-center gap-1 px-3 py-1 text-sm font-medium border rounded-md transition-colors text-gray-400 bg-gray-100 border-gray-200 cursor-not-allowed"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 2H21l-3 6 3 6h-8.5l-1-2H5a2 2 0 00-2 2zm9-13.5V9" />
                    </svg>
                    {currentNode.flagged ? 'Unflag' : 'Flag'}
                  </button>
                  <button
                    disabled
                    className="flex items-center gap-1 px-3 py-1 text-sm font-medium border rounded-md transition-colors text-gray-400 bg-gray-100 border-gray-200 cursor-not-allowed"
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
                      const allLemmas = [...(currentNode.src_lemmas || []), ...(currentNode.lemmas || [])];
                      return allLemmas.length > 0 ? (
                        <p className="text-gray-900 text-sm font-medium">
                          {allLemmas.join('; ')}
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
                          {[...(parent.src_lemmas || []), ...(parent.lemmas || [])].join(', ') || parent.id}
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
                          {[...(child.src_lemmas || []), ...(child.lemmas || [])].join(', ') || child.id}
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
                          {[...(cause.src_lemmas || []), ...(cause.lemmas || [])].join(', ') || cause.id}
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
                          {[...(entail.src_lemmas || []), ...(entail.lemmas || [])].join(', ') || entail.id}
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
                          {[...(similar.src_lemmas || []), ...(similar.lemmas || [])].join(', ') || similar.id}
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
              {/* Breadcrumbs */}
              <div className="mb-4">
                <Breadcrumbs 
                  items={breadcrumbs} 
                  onNavigate={handleBreadcrumbNavigate}
                  onHomeClick={handleHomeClick}
                />
              </div>
              
              {/* Graph */}
              <div className="flex-1">
                <LexicalGraph 
                  currentNode={currentNode} 
                  onNodeClick={handleNodeClick} 
                />
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
