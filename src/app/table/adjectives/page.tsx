'use client';

import { useState, Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DataTable from '@/components/DataTable';
import SearchBox from '@/components/SearchBox';
import ViewToggle, { ViewMode } from '@/components/ViewToggle';
import SignOutButton from '@/components/SignOutButton';
import { SearchResult, TableEntry, GraphNode } from '@/lib/types';

export default function AdjectiveTableMode() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isEditOverlayOpen, setIsEditOverlayOpen] = useState(false);
  const [currentNode, setCurrentNode] = useState<GraphNode | null>(null);
  
  // Editing state
  const [editingField, setEditingField] = useState<'code' | 'hypernym' | 'src_lemmas' | 'gloss' | 'examples' | 'legal_constraints' | 'lexfile' | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [editListItems, setEditListItems] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [codeValidationMessage, setCodeValidationMessage] = useState<string>('');
  const [selectedHyponymsToMove, setSelectedHyponymsToMove] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Overlay section expansion state
  const [overlaySections, setOverlaySections] = useState({
    basicInfo: true,
    legalConstraints: false,
    relations: false,
  });

  const handleSearchResult = (result: SearchResult) => {
    // Navigate to the graph mode with this entry
    router.push(`/graph/adjectives?entry=${result.id}`);
  };

  const handleSearchQueryChange = (query: string) => {
    setSearchQuery(query);
  };

  const handleEditClick = async (entry: TableEntry) => {
    console.log('handleEditClick called with entry:', entry);
    setIsEditOverlayOpen(true);
    
    // Load full entry data
    try {
      console.log('Fetching entry data for:', entry.id);
      const response = await fetch(`/api/adjectives/${entry.id}/graph`);
      if (!response.ok) {
        throw new Error('Failed to load entry details');
      }
      const graphNode: GraphNode = await response.json();
      console.log('Loaded graph node:', graphNode);
      setCurrentNode(graphNode);
    } catch (err) {
      console.error('Error loading entry details:', err);
    }
  };

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

  const startEditing = (field: 'code' | 'hypernym' | 'src_lemmas' | 'gloss' | 'examples' | 'legal_constraints' | 'lexfile') => {
    if (!currentNode) return;
    
    setEditingField(field);
    setCodeValidationMessage('');
    
    if (field === 'code') {
      // Extract lemma part from id (e.g., "good" from "good.a.01")
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
    } else if (field === 'lexfile') {
      setEditValue(currentNode.lexfile || '');
    }
  };

  const cancelEditing = () => {
    setEditingField(null);
    setEditValue('');
    setEditListItems([]);
    setCodeValidationMessage('');
    setSelectedHyponymsToMove(new Set());
  };

  // Find next available unique code
  const findUniqueCode = async (baseLemma: string, pos: string): Promise<string> => {
    // Start checking from .01
    for (let num = 1; num <= 99; num++) {
      const numStr = num.toString().padStart(2, '0');
      const candidateId = `${baseLemma}.${pos}.${numStr}`;
      
      try {
        const response = await fetch(`/api/adjectives/${candidateId}`);
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
        const response = await fetch(`/api/adjectives/${currentNode.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: newId })
        });

        if (!response.ok) {
          throw new Error('Failed to update code');
        }

        // Reload the entry
        const graphResponse = await fetch(`/api/adjectives/${newId}/graph`);
        if (graphResponse.ok) {
          const updatedNode: GraphNode = await graphResponse.json();
          setCurrentNode(updatedNode);
        }
        
        setEditingField(null);
        setEditValue('');
        
        // Show success message
        setCodeValidationMessage('✓ Code updated successfully');
        setTimeout(() => {
          setCodeValidationMessage('');
        }, 2000);
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

        // Reload the entry
        const graphResponse = await fetch(`/api/adjectives/${currentNode.id}/graph?invalidate=true&t=${Date.now()}`, { cache: 'no-store' });
        if (graphResponse.ok) {
          const updatedNode: GraphNode = await graphResponse.json();
          setCurrentNode(updatedNode);
        }
        
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
        case 'lexfile':
          updateData.lexfile = editValue;
          break;
      }
      
      const response = await fetch(`/api/adjectives/${currentNode.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        throw new Error('Failed to update entry');
      }

      // Reload the entry
      const graphResponse = await fetch(`/api/adjectives/${currentNode.id}/graph?invalidate=true&t=${Date.now()}`, { cache: 'no-store' });
      if (graphResponse.ok) {
        const updatedNode: GraphNode = await graphResponse.json();
        setCurrentNode(updatedNode);
      }
      
      setEditingField(null);
      setEditValue('');
      setEditListItems([]);
      setCodeValidationMessage('');
      
      // Show brief success message
      setCodeValidationMessage('✓ Changes saved successfully');
      setTimeout(() => setCodeValidationMessage(''), 2000);
    } catch (err) {
      console.error('Error saving changes:', err);
      setCodeValidationMessage('');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFlagToggle = async () => {
    if (!currentNode) return;
    
    try {
      const response = await fetch('/api/adjectives/moderation', {
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

      // Reload the entry
      const graphResponse = await fetch(`/api/adjectives/${currentNode.id}/graph?invalidate=true&t=${Date.now()}`, { cache: 'no-store' });
      if (graphResponse.ok) {
        const updatedNode: GraphNode = await graphResponse.json();
        setCurrentNode(updatedNode);
      }
    } catch (err) {
      console.error('Error updating flag status:', err);
    }
  };

  const handleForbidToggle = async () => {
    if (!currentNode) return;
    
    try {
      const response = await fetch('/api/adjectives/moderation', {
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

      // Reload the entry
      const graphResponse = await fetch(`/api/adjectives/${currentNode.id}/graph?invalidate=true&t=${Date.now()}`, { cache: 'no-store' });
      if (graphResponse.ok) {
        const updatedNode: GraphNode = await graphResponse.json();
        setCurrentNode(updatedNode);
      }
    } catch (err) {
      console.error('Error updating forbidden status:', err);
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

  // Delete entry handler
  const handleDeleteEntry = async () => {
    if (!currentNode) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/adjectives/${currentNode.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete entry');
      }

      // Close the delete confirmation and edit overlay
      setShowDeleteConfirm(false);
      setIsEditOverlayOpen(false);
      setCurrentNode(null);

      // Reset editing state
      cancelEditing();
    } catch (error) {
      console.error('Error deleting entry:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  // OverlaySection component
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
  const availableLexfiles = ['adj.all', 'adj.pert', 'adj.ppl'];

  return (
    <div className="h-screen flex flex-col bg-white">
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
              Adjectives
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <SearchBox 
              onSelectResult={handleSearchResult}
              onSearchChange={handleSearchQueryChange}
              placeholder="Search table..."
              mode="adjectives"
            />
            <ViewToggle 
              currentView="table"
              onViewChange={(view: ViewMode) => {
                if (view === 'graph') {
                  router.push('/graph/adjectives?view=graph');
                } else if (view === 'recipes') {
                  // Adjectives don't have recipes, do nothing
                }
              }}
              hideRecipes={true}
            />
            <SignOutButton />
          </div>

        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col bg-white">
        {/* Data Table */}
        <div className="m-6 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading...</div>}>
            <DataTable 
              searchQuery={searchQuery}
              mode="adjectives"
              onEditClick={handleEditClick}
            />
          </Suspense>
        </div>
      </main>

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
            <div className="overflow-y-auto flex-1">
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
                                placeholder="Enter lemma (e.g., good)"
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
                  </div>
                )}
              </div>

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
                            mode="adjectives"
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
    </div>
  );
}

