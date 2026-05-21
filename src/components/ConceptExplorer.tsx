'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Concept, ConceptGraphNode, RecipeGraph, SearchResult, BreadcrumbItem } from '@/lib/types';
import ConceptGraph, { ConceptGraphHandle } from './ConceptGraph';
import Breadcrumbs from './Breadcrumbs';
import SearchBox from './SearchBox';
import ViewToggle, { ViewMode } from './ViewToggle';
import PendingChangesButton from './PendingChangesButton';
import SignOutButton from './SignOutButton';
import ChatButton from './ChatButton';
import { EditOverlay } from './editing/EditOverlay';
import LoadingSpinner from './LoadingSpinner';
import ConceptRootNodesView from './ConceptRootNodesView';
import RecipeGraphOverlay from './RecipeGraphOverlay';

interface ConceptExplorerProps {
  initialConceptId?: string;
}

export default function ConceptExplorer({ initialConceptId }: ConceptExplorerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentConcept, setCurrentConcept] = useState<ConceptGraphNode | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewMode>('graph');
  const [isEditOverlayOpen, setIsEditOverlayOpen] = useState(false);
  const [conceptForEdit, setConceptForEdit] = useState<Concept | null>(null);
  const [recipeGraphForVisualize, setRecipeGraphForVisualize] = useState<RecipeGraph | null>(null);
  
  const lastLoadedConceptRef = useRef<string | null>(null);
  const conceptGraphRef = useRef<ConceptGraphHandle>(null);

  const prefetchCacheRef = useRef<Map<string, { graph: ConceptGraphNode; breadcrumbs: BreadcrumbItem[] }>>(new Map());

  const prefetchRelatedNodes = useCallback((graphData: ConceptGraphNode) => {
    const MAX_PREFETCH_GROUP = 30;
    const parentIds: string[] = [];
    const childIds: string[] = [];
    for (const rel of graphData.relations) {
      if (rel.direction === 'incoming' && rel.source) parentIds.push(rel.source.id);
      if (rel.direction === 'outgoing' && rel.target) childIds.push(rel.target.id);
    }
    const idsToFetch: string[] = [];
    if (parentIds.length <= MAX_PREFETCH_GROUP) idsToFetch.push(...parentIds);
    if (childIds.length <= MAX_PREFETCH_GROUP) idsToFetch.push(...childIds);
    for (const id of idsToFetch) {
      if (prefetchCacheRef.current.has(id)) continue;
      Promise.all([
        fetch(`/api/concepts/${id}/graph`),
        fetch(`/api/concepts/${id}/breadcrumbs`),
      ]).then(async ([graphRes, bcRes]) => {
        if (graphRes.ok) {
          const graph = await graphRes.json();
          const breadcrumbs = bcRes.ok ? await bcRes.json() : [];
          prefetchCacheRef.current.set(id, { graph, breadcrumbs });
        }
      }).catch(() => {});
    }
  }, []);

  const updateUrlParam = (conceptId: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('entry', conceptId);
    router.push(`/graph/concepts?${params.toString()}`, { scroll: false });
  };

  const updateViewParam = (view: ViewMode) => {
    const params = new URLSearchParams(searchParams);
    params.set('view', view);
    const qs = params.toString();
    router.push(qs ? `/graph/concepts?${qs}` : '/graph/concepts', { scroll: false });
  };

  const loadConcept = useCallback(async (conceptId: string, invalidateCache: boolean = false) => {
    if (lastLoadedConceptRef.current === conceptId && !invalidateCache) {
      return;
    }
    
    lastLoadedConceptRef.current = conceptId;
    setIsLoading(true);
    setError(null);
    
    try {
      const cached = !invalidateCache ? prefetchCacheRef.current.get(conceptId) : undefined;
      if (cached) {
        prefetchCacheRef.current.delete(conceptId);
        setCurrentConcept(cached.graph);
        setBreadcrumbs(cached.breadcrumbs);
        prefetchRelatedNodes(cached.graph);
        return;
      }

      const graphUrl = invalidateCache 
        ? `/api/concepts/${conceptId}/graph?invalidate=true&t=${Date.now()}`
        : `/api/concepts/${conceptId}/graph`;

      const breadcrumbUrl = invalidateCache
        ? `/api/concepts/${conceptId}/breadcrumbs?t=${Date.now()}`
        : `/api/concepts/${conceptId}/breadcrumbs`;
        
      const [graphResponse, breadcrumbResponse] = await Promise.all([
        fetch(graphUrl, invalidateCache ? { cache: 'no-store' } : {}),
        fetch(breadcrumbUrl, invalidateCache ? { cache: 'no-store' } : {}),
      ]);

      if (!graphResponse.ok) {
        throw new Error('Failed to load concept');
      }

      const graphData: ConceptGraphNode = await graphResponse.json();
      setCurrentConcept(graphData);

      if (breadcrumbResponse.ok) {
        const breadcrumbData: BreadcrumbItem[] = await breadcrumbResponse.json();
        setBreadcrumbs(breadcrumbData);
      } else {
        setBreadcrumbs([]);
      }
      prefetchRelatedNodes(graphData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error loading concept:', err);
    } finally {
      setIsLoading(false);
    }
  }, [prefetchRelatedNodes]);

  const handleConceptClick = (conceptId: string) => {
    lastLoadedConceptRef.current = null;
    updateUrlParam(conceptId);
  };

  const handleSearchResult = (result: SearchResult) => {
    lastLoadedConceptRef.current = null;
    updateUrlParam(result.id);
  };

  const handleHomeClick = () => {
    lastLoadedConceptRef.current = null;
    setCurrentConcept(null);
    setBreadcrumbs([]);
    const params = new URLSearchParams(searchParams);
    params.delete('entry');
    const qs = params.toString();
    router.push(qs ? `/graph/concepts?${qs}` : '/graph/concepts', { scroll: false });
  };

  const handleBreadcrumbNavigate = (id: string) => {
    lastLoadedConceptRef.current = null;
    updateUrlParam(id);
  };

  const handleRefreshClick = () => {
    if (currentConcept) {
      loadConcept(currentConcept.id, true);
    }
  };

  const loadConceptForEdit = useCallback(async (conceptId: string) => {
    try {
      const response = await fetch(`/api/concepts/${conceptId}?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to load concept details (${response.status}): ${errorText}`);
      }
      const data: Concept = await response.json();
      setConceptForEdit(data);
    } catch (err) {
      console.error('Error loading concept details for edit overlay:', err);
    }
  }, []);

  const handleUpdate = async () => {
    if (currentConcept) {
      lastLoadedConceptRef.current = null;
      setConceptForEdit(null);
      await loadConcept(currentConcept.id, true);
    }
  };

  const handleFlagToggle = async () => {
    if (!currentConcept) return;
    try {
      await fetch('/api/concepts/flag', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [currentConcept.id],
          updates: {
            flagged: !currentConcept.flagged,
          },
        }),
      });
      await handleUpdate();
    } catch (err) {
      console.error('Error toggling flag:', err);
    }
  };

  const handleVerifiableToggle = async () => {
    if (!currentConcept) return;
    try {
      await fetch('/api/concepts/flag', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [currentConcept.id],
          updates: {
            verifiable: currentConcept.verifiable === false ? true : false,
          },
        }),
      });
      await handleUpdate();
    } catch (err) {
      console.error('Error toggling verifiable:', err);
    }
  };

  useEffect(() => {
    const viewParam = searchParams.get('view');
    if (viewParam === 'graph' || viewParam === 'table') {
      setCurrentView(viewParam as ViewMode);
    }
    const currentConceptId = searchParams.get('entry') || initialConceptId;
    if (currentConceptId) {
      loadConcept(currentConceptId);
    }
  }, [searchParams, initialConceptId, loadConcept]);

  useEffect(() => {
    if (!isEditOverlayOpen) return;
    if (!currentConcept) return;
    setConceptForEdit(null);
    void loadConceptForEdit(currentConcept.id);
  }, [isEditOverlayOpen, currentConcept?.id, currentConcept, loadConceptForEdit]);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/')}
              className="text-xl font-bold text-gray-900 hover:text-gray-700 cursor-pointer shrink-0"
            >
              Source Console
            </button>
            <div className="flex items-center gap-1 ml-2">
              <button
                type="button"
                onClick={() => router.push('/table')}
                className="px-4 py-2 text-base font-medium transition-colors relative cursor-pointer text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              >
                Senses
              </button>
              <button className="px-4 py-2 text-base font-medium transition-colors relative cursor-default text-blue-600 border-b-2 border-blue-600">
                Concepts
              </button>
              <button
                type="button"
                onClick={() => router.push('/claims')}
                className="px-4 py-2 text-base font-medium transition-colors relative cursor-pointer text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              >
                Claims
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-4 flex-1 justify-end">
            <div className="flex-1 max-w-2xl">
              <SearchBox 
                onSelectResult={handleSearchResult}
                onSearchChange={() => {}}
                placeholder="Search concepts..."
                mode="concepts"
              />
            </div>
            <ViewToggle 
              currentView={currentView}
              onViewChange={(view: ViewMode) => {
                if (view === 'table') {
                  router.push('/table/concepts');
                } else {
                  setCurrentView(view);
                  updateViewParam(view);
                }
              }}
            />
            <PendingChangesButton />
            <ChatButton />
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Loading progress bar — flush against header border */}
        <AnimatePresence>
          {isLoading && currentConcept && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="w-full z-10"
            >
              <div className="h-0.5 bg-blue-100 overflow-hidden">
                <div className="h-full w-full bg-blue-500 animate-loading-bar" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 flex">
        {/* Main Graph/Recipe Area */}
        <div className="flex-1 p-6 bg-white">
          {currentConcept ? (
            <div className="h-full flex flex-col relative">

              {/* Breadcrumbs + Badges */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Breadcrumbs
                    items={breadcrumbs}
                    onNavigate={handleBreadcrumbNavigate}
                    onHomeClick={handleHomeClick}
                    onRefreshClick={handleRefreshClick}
                  />
                  {currentConcept.flagged && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-800 rounded-full">
                      Flagged
                    </span>
                  )}
                  {currentConcept.verifiable === false && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-800 rounded-full">
                      Unverifiable
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleFlagToggle}
                    className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${
                      currentConcept.flagged 
                        ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {currentConcept.flagged ? 'Unflag' : 'Flag'}
                  </button>
                  <button
                    onClick={handleVerifiableToggle}
                    className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${
                      currentConcept.verifiable === false 
                        ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {currentConcept.verifiable === false ? 'Mark Verifiable' : 'Mark Unverifiable'}
                  </button>
                  <button
                    onClick={() => conceptGraphRef.current?.openReparentModal()}
                    disabled={conceptGraphRef.current?.isParentRelationLocked()}
                    title={conceptGraphRef.current?.isParentRelationLocked() ? 'Parent relation is locked' : undefined}
                    className="px-3 py-1 text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Reparent Concept
                  </button>
                </div>
              </div>
              
              {/* Graph Content */}
              <div className="flex-1 overflow-hidden relative">
                <div className="h-full">
                  <ConceptGraph 
                    ref={conceptGraphRef}
                    currentConcept={currentConcept}
                    onConceptClick={handleConceptClick}
                    onEditClick={() => setIsEditOverlayOpen(true)}
                    onVisualizeRecipeGraph={(rg) => setRecipeGraphForVisualize(rg)}
                    onReparentComplete={() => {
                      if (currentConcept?.id) {
                        lastLoadedConceptRef.current = null;
                        loadConcept(currentConcept.id, true);
                      }
                    }}
                    pendingRelationChanges={(currentConcept as any)?.pendingRelationChanges}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center bg-white rounded-xl">
              {isLoading ? (
                <LoadingSpinner size="page" label="Loading concept..." className="py-12" />
              ) : error ? (
                <div className="text-center text-red-500">
                  <p className="text-lg font-medium">Error</p>
                  <p className="text-sm">{error}</p>
                </div>
              ) : (
              <ConceptRootNodesView onNodeClick={handleConceptClick} />
              )}
            </div>
          )}
        </div>

        {/* Edit Overlay */}
        {isEditOverlayOpen && (
          <EditOverlay
            node={conceptForEdit}
            nodeId={currentConcept?.id || ""}
            mode="concepts"
            isOpen={isEditOverlayOpen}
            onClose={() => {
              setIsEditOverlayOpen(false);
              setConceptForEdit(null);
            }}
            onUpdate={handleUpdate}
          />
        )}

        {/* Recipe Graph Visualization Overlay */}
        {recipeGraphForVisualize && currentConcept && (
          <RecipeGraphOverlay
            recipeGraph={recipeGraphForVisualize}
            frameLabel={currentConcept.label}
            onClose={() => setRecipeGraphForVisualize(null)}
          />
        )}

        </div>
      </main>
    </div>
  );
}


