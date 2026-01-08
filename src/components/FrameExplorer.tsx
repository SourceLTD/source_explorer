'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FrameGraphNode, FrameRecipeData, SearchResult } from '@/lib/types';
import FrameGraph from './FrameGraph';
import FrameRecipeView from './FrameRecipeView';
import SearchBox from './SearchBox';
import ViewToggle, { ViewMode } from './ViewToggle';
import PendingChangesButton from './PendingChangesButton';
import SignOutButton from './SignOutButton';
import CategoryDropdown from './CategoryDropdown';
import { EditOverlay } from './editing/EditOverlay';
import LoadingSpinner from './LoadingSpinner';

interface FrameExplorerProps {
  initialFrameId?: string;
}

export default function FrameExplorer({ initialFrameId }: FrameExplorerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentFrame, setCurrentFrame] = useState<FrameGraphNode | null>(null);
  const [frameRecipeData, setFrameRecipeData] = useState<FrameRecipeData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewMode>('graph');
  const [isEditOverlayOpen, setIsEditOverlayOpen] = useState(false);
  
  // Track last loaded frame to prevent duplicate calls
  const lastLoadedFrameRef = useRef<string | null>(null);

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
      const graphUrl = invalidateCache 
        ? `/api/frames/${frameId}/graph?invalidate=true&t=${Date.now()}`
        : `/api/frames/${frameId}/graph`;
      
      const recipeUrl = invalidateCache
        ? `/api/frames/${frameId}/recipes?t=${Date.now()}`
        : `/api/frames/${frameId}/recipes`;
        
      const [graphResponse, recipeResponse] = await Promise.all([
        fetch(graphUrl, invalidateCache ? { cache: 'no-store' } : {}),
        fetch(recipeUrl, invalidateCache ? { cache: 'no-store' } : {})
      ]);

      if (!graphResponse.ok) {
        throw new Error('Failed to load frame');
      }

      const graphData: FrameGraphNode = await graphResponse.json();
      setCurrentFrame(graphData);

      if (recipeResponse.ok) {
        const recipeData: FrameRecipeData = await recipeResponse.json();
        setFrameRecipeData(recipeData);
      } else {
        setFrameRecipeData(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error loading frame:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleFrameClick = (frameId: string) => {
    // Reset the ref to allow loading the new frame
    lastLoadedFrameRef.current = null;
    updateUrlParam(frameId);
  };

  const handleSearchResult = (result: SearchResult) => {
    // Reset the ref to allow loading the new frame
    lastLoadedFrameRef.current = null;
    updateUrlParam(result.id);
  };

  const handleHomeClick = () => {
    // Clear the current frame and return to home view
    lastLoadedFrameRef.current = null;
    setCurrentFrame(null);
    setFrameRecipeData(null);
    // Remove entry from URL but preserve view
    const params = new URLSearchParams(searchParams);
    params.delete('entry');
    const qs = params.toString();
    router.push(qs ? `/graph/frames?${qs}` : '/graph/frames', { scroll: false });
  };

  const handleRefreshClick = () => {
    if (currentFrame) {
      loadFrame(currentFrame.id, true); // Force cache invalidation
    }
  };

  const handleUpdate = async () => {
    if (currentFrame) {
      lastLoadedFrameRef.current = null;
      await loadFrame(currentFrame.id, true);
    }
  };

  const handleFlagToggle = async () => {
    if (!currentFrame) return;
    try {
      await fetch('/api/frames/moderation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [currentFrame.id],
          flagged: !currentFrame.flagged,
        }),
      });
      await handleUpdate();
    } catch (err) {
      console.error('Error toggling flag:', err);
    }
  };

  const handleForbidToggle = async () => {
    if (!currentFrame) return;
    try {
      await fetch('/api/frames/moderation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [currentFrame.id],
          forbidden: !currentFrame.forbidden,
        }),
      });
      await handleUpdate();
    } catch (err) {
      console.error('Error toggling forbidden:', err);
    }
  };

  // Load frame based on URL params or initial prop and sync view from URL
  useEffect(() => {
    const viewParam = searchParams.get('view');
    if (viewParam === 'graph' || viewParam === 'recipes' || viewParam === 'table') {
      setCurrentView(viewParam as ViewMode);
    }
    const currentFrameId = searchParams.get('entry') || initialFrameId;
    if (currentFrameId) {
      loadFrame(currentFrameId);
    }
  }, [searchParams, initialFrameId, loadFrame]);

  // Convert FrameGraphNode to Frame for EditOverlay
  const frameForEdit = currentFrame ? {
    id: currentFrame.id,
    label: currentFrame.label,
    definition: currentFrame.gloss,
    short_definition: currentFrame.short_definition,
    prototypical_synset: currentFrame.prototypical_synset,
    flagged: currentFrame.flagged,
    flaggedReason: currentFrame.flaggedReason,
    forbidden: currentFrame.forbidden,
    forbiddenReason: currentFrame.forbiddenReason,
    frame_roles: currentFrame.roles?.map(r => ({
      id: r.id,
      description: r.description,
      notes: r.notes,
      main: r.main,
      examples: r.examples,
      role_type: {
        id: r.role_type_id,
        code: r.role_type_code,
        label: r.role_type_label,
        generic_description: '',
      },
    })),
    createdAt: new Date(),
    updatedAt: new Date(),
    pending: currentFrame.pending,
  } : null;

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
              Source Console
            </button>
            <div className="h-6 w-px bg-gray-300"></div>
            <CategoryDropdown currentCategory="frames" currentView="graph" />
            <p className="text-sm text-gray-600">
              Explore frame relationships
            </p>
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
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex">
        {/* Main Graph/Recipe Area */}
        <div className="flex-1 p-6 bg-white">
          {currentFrame && !isLoading ? (
            <div className="h-full flex flex-col">
              {/* Navigation Bar */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleHomeClick}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Home"
                  >
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                  </button>
                  <button
                    onClick={handleRefreshClick}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Refresh"
                  >
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                  <span className="text-lg font-semibold text-gray-900">
                    {currentFrame.label}
                  </span>
                  {currentFrame.flagged && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-800 rounded-full">
                      Flagged
                    </span>
                  )}
                  {currentFrame.forbidden && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                      Forbidden
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
                    onClick={handleForbidToggle}
                    className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${
                      currentFrame.forbidden 
                        ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {currentFrame.forbidden ? 'Allow' : 'Forbid'}
                  </button>
                </div>
              </div>
              
              {/* Graph/Recipe Content */}
              <div className="flex-1">
                {currentView === 'graph' ? (
                  <FrameGraph 
                    currentFrame={currentFrame}
                    onFrameClick={handleFrameClick}
                    onVerbClick={(verbId) => router.push(`/graph?entry=${verbId}`)}
                    onEditClick={() => setIsEditOverlayOpen(true)}
                  />
                ) : (
                  <FrameRecipeView
                    currentFrame={currentFrame}
                    recipeData={frameRecipeData}
                    onFrameClick={handleFrameClick}
                    onVerbClick={(verbId) => router.push(`/graph?entry=${verbId}`)}
                    onEditClick={() => setIsEditOverlayOpen(true)}
                  />
                )}
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
                <div className="text-center text-gray-400">
                  <svg className="h-24 w-24 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p className="text-lg">No frame selected</p>
                  <p className="text-sm mt-2">Search for a frame to view its details</p>
                </div>
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
            onClose={() => setIsEditOverlayOpen(false)}
            onUpdate={handleUpdate}
          />
        )}
      </main>
    </div>
  );
}


