'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { Frame, FrameGraphNode, RecipeGraph, SearchResult, BreadcrumbItem } from '@/lib/types';
import FrameGraph, { FrameGraphHandle } from './FrameGraph';
import Breadcrumbs from './Breadcrumbs';
import SearchBox from './SearchBox';
import ViewToggle, { ViewMode } from './ViewToggle';
import PendingChangesButton from './PendingChangesButton';
import SignOutButton from './SignOutButton';
import ChatButton from './ChatButton';
import { EditOverlay } from './editing/EditOverlay';
import LoadingSpinner from './LoadingSpinner';
import FrameRootNodesView from './FrameRootNodesView';
import RecipeGraphOverlay from './RecipeGraphOverlay';

interface FrameExplorerProps {
  initialFrameId?: string;
}

export default function FrameExplorer({ initialFrameId }: FrameExplorerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentFrame, setCurrentFrame] = useState<FrameGraphNode | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewMode>('graph');
  const [isEditOverlayOpen, setIsEditOverlayOpen] = useState(false);
  const [frameForEdit, setFrameForEdit] = useState<Frame | null>(null);
  const [recipeGraphForVisualize, setRecipeGraphForVisualize] = useState<RecipeGraph | null>(null);
  
  // Track last loaded frame to prevent duplicate calls
  const lastLoadedFrameRef = useRef<string | null>(null);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const frameGraphRef = useRef<FrameGraphHandle>(null);

  // Prefetch cache for related nodes
  const prefetchCacheRef = useRef<Map<string, { graph: FrameGraphNode; breadcrumbs: BreadcrumbItem[] }>>(new Map());

  // Transition overlay state: a phantom of the clicked node that expands to become the main node
  const [transitionNode, setTransitionNode] = useState<{
    rect: { top: number; left: number; width: number; height: number };
    targetRect: { top: number; left: number; width: number; height: number };
    label: string;
    color: string;
    direction: 'up' | 'down';
  } | null>(null);
  // Exiting node overlay: the old main node shrinks and moves away
  const [exitingNode, setExitingNode] = useState<{
    rect: { top: number; left: number; width: number; height: number };
    direction: 'up' | 'down';
  } | null>(null);
  const transitionMinTimeRef = useRef<number>(0);
  const overlayWrapperRef = useRef<HTMLDivElement>(null);

  const clearTransition = useCallback(() => {
    setTransitionNode(null);
    setExitingNode(null);
  }, []);

  const prefetchRelatedNodes = useCallback((graphData: FrameGraphNode) => {
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
        fetch(`/api/frames/${id}/graph`),
        fetch(`/api/frames/${id}/breadcrumbs`),
      ]).then(async ([graphRes, bcRes]) => {
        if (graphRes.ok) {
          const graph = await graphRes.json();
          const breadcrumbs = bcRes.ok ? await bcRes.json() : [];
          prefetchCacheRef.current.set(id, { graph, breadcrumbs });
        }
      }).catch(() => {});
    }
  }, []);

  // Helper function to update URL parameters without page reload
  const updateUrlParam = (frameId: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('entry', frameId);
    router.push(`/graph/frames?${params.toString()}`, { scroll: false });
  };

  // Helper to update view in URL
  const updateViewParam = (view: ViewMode) => {
    const params = new URLSearchParams(searchParams);
    params.set('view', view);
    const qs = params.toString();
    router.push(qs ? `/graph/frames?${qs}` : '/graph/frames', { scroll: false });
  };

  const loadFrame = useCallback(async (frameId: string, invalidateCache: boolean = false) => {
    // Prevent duplicate calls for the same frame (unless cache invalidation is requested)
    if (lastLoadedFrameRef.current === frameId && !invalidateCache) {
      return;
    }
    
    lastLoadedFrameRef.current = frameId;
    setIsLoading(true);
    setError(null);
    
    try {
      // Check prefetch cache first
      const cached = !invalidateCache ? prefetchCacheRef.current.get(frameId) : undefined;
      if (cached) {
        prefetchCacheRef.current.delete(frameId);
        setCurrentFrame(cached.graph);
        setBreadcrumbs(cached.breadcrumbs);
        const remaining = Math.max(0, transitionMinTimeRef.current - Date.now());
        if (remaining > 0) {
          setTimeout(() => clearTransition(), remaining);
        } else {
          clearTransition();
        }
        prefetchRelatedNodes(cached.graph);
        return;
      }

      const graphUrl = invalidateCache 
        ? `/api/frames/${frameId}/graph?invalidate=true&t=${Date.now()}`
        : `/api/frames/${frameId}/graph`;

      const breadcrumbUrl = invalidateCache
        ? `/api/frames/${frameId}/breadcrumbs?t=${Date.now()}`
        : `/api/frames/${frameId}/breadcrumbs`;
        
      const [graphResponse, breadcrumbResponse] = await Promise.all([
        fetch(graphUrl, invalidateCache ? { cache: 'no-store' } : {}),
        fetch(breadcrumbUrl, invalidateCache ? { cache: 'no-store' } : {}),
      ]);

      if (!graphResponse.ok) {
        throw new Error('Failed to load frame');
      }

      const graphData: FrameGraphNode = await graphResponse.json();
      setCurrentFrame(graphData);

      if (breadcrumbResponse.ok) {
        const breadcrumbData: BreadcrumbItem[] = await breadcrumbResponse.json();
        setBreadcrumbs(breadcrumbData);
      } else {
        setBreadcrumbs([]);
      }
      const remaining = Math.max(0, transitionMinTimeRef.current - Date.now());
      if (remaining > 0) {
        setTimeout(() => clearTransition(), remaining);
      } else {
        clearTransition();
      }
      prefetchRelatedNodes(graphData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error loading frame:', err);
    } finally {
      setIsLoading(false);
    }
  }, [prefetchRelatedNodes]);

  const handleFrameClick = (frameId: string, clickedNode?: { rect: { top: number; left: number; width: number; height: number }; label: string; color: string; direction: 'up' | 'down' }) => {
    if (clickedNode) {
      // Capture the current main node rect for the exiting animation
      const mainNodeEl = graphContainerRef.current?.querySelector('[data-main-node]');
      const mainRect = mainNodeEl
        ? mainNodeEl.getBoundingClientRect()
        : (() => {
            const c = graphContainerRef.current!.getBoundingClientRect();
            return { top: c.top + 40, left: c.left + (c.width - 600) / 2, width: 600, height: 80 };
          })();
      if (mainNodeEl) {
        setExitingNode({
          rect: { top: mainRect.top, left: mainRect.left, width: mainRect.width, height: mainRect.height },
          direction: clickedNode.direction,
        });
      }
      setTransitionNode({
        ...clickedNode,
        targetRect: { top: mainRect.top, left: mainRect.left, width: mainRect.width, height: mainRect.height },
      });
      transitionMinTimeRef.current = Date.now() + 400;
    }
    lastLoadedFrameRef.current = null;
    updateUrlParam(frameId);
  };

  const handleSearchResult = (result: SearchResult) => {
    clearTransition();
    lastLoadedFrameRef.current = null;
    updateUrlParam(result.id);
  };

  const handleHomeClick = () => {
    clearTransition();
    lastLoadedFrameRef.current = null;
    setCurrentFrame(null);
    setBreadcrumbs([]);
    // Remove entry from URL but preserve view
    const params = new URLSearchParams(searchParams);
    params.delete('entry');
    const qs = params.toString();
    router.push(qs ? `/graph/frames?${qs}` : '/graph/frames', { scroll: false });
  };

  const handleBreadcrumbNavigate = (id: string) => {
    clearTransition();
    lastLoadedFrameRef.current = null;
    updateUrlParam(id);
  };

  const handleRefreshClick = () => {
    if (currentFrame) {
      loadFrame(currentFrame.id, true); // Force cache invalidation
    }
  };

  const loadFrameForEdit = useCallback(async (frameId: string) => {
    try {
      const response = await fetch(`/api/frames/${frameId}?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to load frame details (${response.status}): ${errorText}`);
      }
      const data: Frame = await response.json();
      setFrameForEdit(data);
    } catch (err) {
      console.error('Error loading frame details for edit overlay:', err);
      // Keep overlay open, but it will continue showing the loading spinner.
      // Users can close/reopen if needed.
    }
  }, []);

  const handleUpdate = async () => {
    if (currentFrame) {
      lastLoadedFrameRef.current = null;
      setFrameForEdit(null); // show loading spinner while we refresh
      await loadFrame(currentFrame.id, true);
    }
  };

  const handleFlagToggle = async () => {
    if (!currentFrame) return;
    try {
      await fetch('/api/frames/flag', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [currentFrame.id],
          updates: {
            flagged: !currentFrame.flagged,
          },
        }),
      });
      await handleUpdate();
    } catch (err) {
      console.error('Error toggling flag:', err);
    }
  };

  const handleVerifiableToggle = async () => {
    if (!currentFrame) return;
    try {
      await fetch('/api/frames/flag', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [currentFrame.id],
          updates: {
            verifiable: currentFrame.verifiable === false ? true : false,
          },
        }),
      });
      await handleUpdate();
    } catch (err) {
      console.error('Error toggling verifiable:', err);
    }
  };

  // Prevent all scrolling during transition so the fixed overlay doesn't drift
  useEffect(() => {
    if (!transitionNode) return;
    const frozen: { el: HTMLElement; prev: string }[] = [];
    const freeze = (el: HTMLElement | null) => {
      while (el && el !== document.documentElement) {
        const cs = getComputedStyle(el);
        if (cs.overflow === 'auto' || cs.overflow === 'scroll' ||
            cs.overflowY === 'auto' || cs.overflowY === 'scroll') {
          frozen.push({ el, prev: el.style.overflow });
          el.style.overflow = 'hidden';
        }
        el = el.parentElement;
      }
    };
    freeze(graphContainerRef.current);
    if (graphContainerRef.current) {
      graphContainerRef.current.querySelectorAll('*').forEach((child) => {
        const cs = getComputedStyle(child as HTMLElement);
        if (cs.overflow === 'auto' || cs.overflow === 'scroll' ||
            cs.overflowY === 'auto' || cs.overflowY === 'scroll') {
          frozen.push({ el: child as HTMLElement, prev: (child as HTMLElement).style.overflow });
          (child as HTMLElement).style.overflow = 'hidden';
        }
      });
    }
    const prevBody = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBody;
      for (const { el, prev } of frozen) el.style.overflow = prev;
    };
  }, [transitionNode]);

  // Load frame based on URL params or initial prop and sync view from URL
  useEffect(() => {
    const viewParam = searchParams.get('view');
    if (viewParam === 'graph' || viewParam === 'table') {
      setCurrentView(viewParam as ViewMode);
    }
    const currentFrameId = searchParams.get('entry') || initialFrameId;
    if (currentFrameId) {
      loadFrame(currentFrameId);
    }
  }, [searchParams, initialFrameId, loadFrame]);

  // When opening the overlay, fetch the full Frame payload used by the editor.
  useEffect(() => {
    if (!isEditOverlayOpen) return;
    if (!currentFrame) return;
    setFrameForEdit(null); // show loading spinner inside EditOverlay
    void loadFrameForEdit(currentFrame.id);
  }, [isEditOverlayOpen, currentFrame?.id, currentFrame, loadFrameForEdit]);

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
              <button className="px-4 py-2 text-base font-medium transition-colors relative cursor-pointer text-blue-600 border-b-2 border-blue-600">
                Frames
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-4 flex-1 justify-end">
            <div className="flex-1 max-w-2xl">
              <SearchBox 
                onSelectResult={handleSearchResult}
                onSearchChange={() => {}}
                placeholder="Search frames..."
                mode="frames"
              />
            </div>
            <ViewToggle 
              currentView={currentView}
              onViewChange={(view: ViewMode) => {
                if (view === 'table') {
                  router.push('/table/frames');
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
          {isLoading && currentFrame && (
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
          {currentFrame ? (
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
                  {currentFrame.flagged && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-800 rounded-full">
                      Flagged
                    </span>
                  )}
                  {currentFrame.verifiable === false && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-800 rounded-full">
                      Unverifiable
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleFlagToggle}
                    className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${
                      currentFrame.flagged 
                        ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {currentFrame.flagged ? 'Unflag' : 'Flag'}
                  </button>
                  <button
                    onClick={handleVerifiableToggle}
                    className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${
                      currentFrame.verifiable === false 
                        ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {currentFrame.verifiable === false ? 'Mark Verifiable' : 'Mark Unverifiable'}
                  </button>
                  <button
                    onClick={() => frameGraphRef.current?.openReparentModal()}
                    className="px-3 py-1 text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    Reparent Frame
                  </button>
                </div>
              </div>
              
              {/* Graph Content */}
              <div className="flex-1 overflow-hidden relative" ref={graphContainerRef}>
                <div
                  className="h-full"
                  style={{
                    opacity: transitionNode ? 0 : 1,
                    transition: transitionNode ? 'none' : 'opacity 0.2s ease',
                  }}
                >
                  <FrameGraph 
                    ref={frameGraphRef}
                    currentFrame={currentFrame}
                    onFrameClick={handleFrameClick}
                    onEditClick={() => setIsEditOverlayOpen(true)}
                    onVisualizeRecipeGraph={(rg) => setRecipeGraphForVisualize(rg)}
                    onReparentComplete={() => {
                      if (currentFrame?.id) {
                        lastLoadedFrameRef.current = null;
                        loadFrame(currentFrame.id, true);
                      }
                    }}
                    pendingRelationChanges={(currentFrame as any)?.pendingRelationChanges}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center bg-white rounded-xl">
              {isLoading ? (
                <LoadingSpinner size="page" label="Loading frame..." className="py-12" />
              ) : error ? (
                <div className="text-center text-red-500">
                  <p className="text-lg font-medium">Error</p>
                  <p className="text-sm">{error}</p>
                </div>
              ) : (
              <FrameRootNodesView onNodeClick={handleFrameClick} />
              )}
            </div>
          )}
        </div>

        {/* Edit Overlay */}
        {isEditOverlayOpen && (
          <EditOverlay
            node={frameForEdit}
            nodeId={currentFrame?.id || ""}
            mode="frames"
            isOpen={isEditOverlayOpen}
            onClose={() => {
              setIsEditOverlayOpen(false);
              setFrameForEdit(null);
            }}
            onUpdate={handleUpdate}
          />
        )}

        {/* Recipe Graph Visualization Overlay */}
        {recipeGraphForVisualize && currentFrame && (
          <RecipeGraphOverlay
            recipeGraph={recipeGraphForVisualize}
            frameLabel={currentFrame.label}
            onClose={() => setRecipeGraphForVisualize(null)}
          />
        )}

        {/* Transition overlays — wrapped in a div that compensates for scroll */}
        <div ref={overlayWrapperRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 50 }}>
        <AnimatePresence>
          {transitionNode && (() => {
            const src = transitionNode.rect;
            const tgt = transitionNode.targetRect;
            const initialScaleX = src.width / tgt.width;
            const initialScaleY = src.height / tgt.height;
            const srcCenterX = src.left + src.width / 2;
            const srcCenterY = src.top + src.height / 2;
            const tgtCenterX = tgt.left + tgt.width / 2;
            const tgtCenterY = tgt.top + tgt.height / 2;
            const initialTranslateX = srcCenterX - tgtCenterX;
            const initialTranslateY = srcCenterY - tgtCenterY;
            return (
              <motion.div
                key="transition-overlay"
                className="flex items-center justify-center overflow-hidden pointer-events-none"
                style={{
                  position: 'absolute',
                  top: tgt.top,
                  left: tgt.left,
                  width: tgt.width,
                  height: tgt.height,
                  borderRadius: 12,
                  willChange: 'transform, opacity',
                }}
                initial={{
                  transform: `translate3d(${initialTranslateX}px, ${initialTranslateY}px, 0) scale(${initialScaleX}, ${initialScaleY})`,
                  backgroundColor: transitionNode.color,
                  opacity: 1,
                }}
                animate={{
                  transform: 'translate3d(0px, 0px, 0) scale(1, 1)',
                  backgroundColor: '#bfdbfe',
                  opacity: 1,
                }}
                exit={{
                  opacity: 0,
                  transition: { duration: 0.15, ease: 'easeOut' },
                }}
                transition={{
                  transform: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] },
                  backgroundColor: { duration: 0.35, ease: 'easeOut' },
                }}
              >
                <ArrowPathIcon className="w-6 h-6 text-white animate-spin" />
              </motion.div>
            );
          })()}
          {exitingNode && (() => {
            const src = exitingNode.rect;
            const moveY = exitingNode.direction === 'down' ? -160 : 160;
            return (
              <motion.div
                key="exiting-overlay"
                className="rounded-lg pointer-events-none"
                style={{
                  position: 'absolute',
                  top: src.top,
                  left: src.left,
                  width: src.width,
                  height: src.height,
                  borderRadius: 8,
                  willChange: 'transform, opacity',
                }}
                initial={{
                  transform: 'translate3d(0px, 0px, 0) scale(1, 1)',
                  backgroundColor: '#3b82f6',
                  opacity: 1,
                }}
                animate={{
                  transform: `translate3d(0px, ${moveY}px, 0) scale(0.15, 0.08)`,
                  backgroundColor: exitingNode.direction === 'down' ? '#93c5fd' : '#fbbf24',
                  opacity: 0,
                }}
                transition={{
                  transform: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] },
                  opacity: { duration: 0.3, ease: 'easeOut' },
                  backgroundColor: { duration: 0.3, ease: 'easeOut' },
                }}
              />
            );
          })()}
        </AnimatePresence>
        </div>
        </div>
      </main>
    </div>
  );
}


