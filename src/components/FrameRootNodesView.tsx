'use client';

import React, { useEffect, useMemo, useState } from 'react';

interface RootFrame {
  id: string;
  label: string;
}

interface FrameRootNodesViewProps {
  onNodeClick: (nodeId: string) => void;
}

const rootFrames: RootFrame[] = [
  { id: '280229', label: 'Event' },
  { id: '85483', label: 'Entity' },
  { id: '319610', label: 'State' },
  { id: '317158', label: 'Relation' },
];

const auxiliaryFrames: RootFrame[] = [
  { id: '257773', label: 'Measure' },
];

const allRootFrames = [...rootFrames, ...auxiliaryFrames];

function formatHierarchyCount(count: number) {
  return `${count.toLocaleString()} ${count === 1 ? 'frame' : 'frames'} in hierarchy`;
}

export default function FrameRootNodesView({ onNodeClick }: FrameRootNodesViewProps) {
  const [hierarchyCounts, setHierarchyCounts] = useState<Record<string, number>>({});
  const [isLoadingCounts, setIsLoadingCounts] = useState(true);

  const rootIdsQuery = useMemo(
    () => allRootFrames.map(frame => `rootId=${encodeURIComponent(frame.id)}`).join('&'),
    []
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadHierarchyCounts() {
      try {
        setIsLoadingCounts(true);
        const response = await fetch(`/api/frames/hierarchy-counts?${rootIdsQuery}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error('Failed to fetch hierarchy counts');
        }
        const data = await response.json();
        setHierarchyCounts(data.counts ?? {});
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Error loading frame hierarchy counts:', error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingCounts(false);
        }
      }
    }

    loadHierarchyCounts();

    return () => controller.abort();
  }, [rootIdsQuery]);

  return (
    <div className="h-full flex items-center justify-center">
      <div className="max-w-5xl w-full px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">
            Explore Frame Types
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rootFrames.map((frame) => (
            <button
              key={frame.id}
              onClick={() => onNodeClick(frame.id)}
              className="group relative bg-white p-8 rounded-xl transition-all duration-300 transform hover:-translate-y-1 border-2 border-gray-200 hover:border-blue-400 cursor-pointer"
            >
              <div className="flex flex-col items-start text-left">
                <div className="w-full mb-4">
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                      {frame.label}
                    </h3>
                    <p className="text-sm font-medium text-gray-500">
                      {isLoadingCounts
                        ? 'Counting frames...'
                        : formatHierarchyCount(hierarchyCounts[frame.id] ?? 0)}
                    </p>
                  </div>
                </div>
                
                <div className="mt-2 flex items-center text-blue-600 group-hover:text-blue-600 font-medium">
                  <span className="text-sm">Explore this type</span>
                  <svg 
                    className="ml-2 w-5 h-5 transform group-hover:translate-x-1 transition-transform" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M13 7l5 5m0 0l-5 5m5-5H6" 
                    />
                  </svg>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-8">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Auxiliary:
          </p>
          <div className="flex flex-wrap gap-3">
            {auxiliaryFrames.map((frame) => (
              <button
                key={frame.id}
                onClick={() => onNodeClick(frame.id)}
                className="group rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-100"
              >
                <div className="flex items-center gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-blue-900 group-hover:text-blue-700 transition-colors">
                      {frame.label}
                    </h3>
                    <p className="text-xs font-medium text-blue-700">
                      {isLoadingCounts
                        ? 'Counting frames...'
                        : formatHierarchyCount(hierarchyCounts[frame.id] ?? 0)}
                    </p>
                  </div>
                  <svg
                    className="h-4 w-4 text-blue-700 transform group-hover:translate-x-1 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 text-center">
          <div className="inline-flex items-center gap-3 bg-blue-50 px-6 py-3 rounded-full border border-blue-200">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium text-blue-600">
              These are the root frame types from which all frames in the ontology derive
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
