'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import SignOutButton from '@/components/SignOutButton';
import ChatButton from '@/components/ChatButton';
import PendingChangesButton from '@/components/PendingChangesButton';
import LoadingSpinner from '@/components/LoadingSpinner';
import ClaimsForceGraph from './ClaimsForceGraph';
import GraphSelector from './GraphSelector';
import NLQueryBar from './NLQueryBar';
import InstanceDetailPanel from './InstanceDetailPanel';
import type { ClaimsGraphPayload, ClaimsNodeType, KnowledgeGraphSummary } from '@/lib/claims/types';
import type { ClaimsQueryFilter } from '@/lib/claims/query-schema';

export default function ClaimsExplorer() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [graphs, setGraphs] = useState<KnowledgeGraphSummary[]>([]);
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<ClaimsGraphPayload | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [queryExplanation, setQueryExplanation] = useState<string | null>(null);
  const [queryFilter, setQueryFilter] = useState<ClaimsQueryFilter | null>(null);
  const [loadingGraphs, setLoadingGraphs] = useState(true);
  const [loadingViz, setLoadingViz] = useState(false);
  const [queryLoading, setQueryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGraphs = useCallback(async () => {
    setLoadingGraphs(true);
    try {
      const res = await fetch('/api/claims/graphs');
      if (!res.ok) throw new Error('Failed to load graphs');
      const data = await res.json();
      setGraphs(data.graphs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load graphs');
    } finally {
      setLoadingGraphs(false);
    }
  }, []);

  const loadVisualization = useCallback(async (graphId: string, highlight?: string) => {
    setLoadingViz(true);
    setError(null);
    try {
      const url = highlight
        ? `/api/claims/graphs/${graphId}/visualization?highlight=${encodeURIComponent(highlight)}`
        : `/api/claims/graphs/${graphId}/visualization`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load graph');
      const data = await res.json();
      setGraphData({ nodes: data.nodes, links: data.links });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load visualization');
    } finally {
      setLoadingViz(false);
    }
  }, []);

  const handleNodeClick = useCallback((nodeId: string, type: ClaimsNodeType) => {
    if (type === 'instance') {
      setSelectedInstanceId(nodeId);
    }
  }, []);

  const selectGraph = useCallback(
    (graphId: string) => {
      setSelectedGraphId(graphId);
      setSelectedInstanceId(null);
      setQueryExplanation(null);
      setQueryFilter(null);
      const params = new URLSearchParams(searchParams.toString());
      params.set('graph', graphId);
      router.push(`/claims?${params.toString()}`, { scroll: false });
      void loadVisualization(graphId);
    },
    [router, searchParams, loadVisualization],
  );

  useEffect(() => {
    void loadGraphs();
  }, [loadGraphs]);

  useEffect(() => {
    if (graphs.length === 0) return;
    const graphParam = searchParams.get('graph');
    const initialId = graphParam && graphs.some((g) => g.id === graphParam)
      ? graphParam
      : graphs[0].id;
    if (initialId !== selectedGraphId) {
      setSelectedGraphId(initialId);
      void loadVisualization(initialId);
    }
  }, [graphs, searchParams, selectedGraphId, loadVisualization]);

  const handleQuery = async (query: string) => {
    if (!selectedGraphId) return;
    setQueryLoading(true);
    setQueryExplanation(null);
    setQueryFilter(null);
    setError(null);
    try {
      const res = await fetch('/api/claims/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graphId: selectedGraphId, query }),
      });
      if (!res.ok) throw new Error('Query failed');
      const data = await res.json();
      setGraphData(data.graph);
      setQueryExplanation(data.explanation ?? null);
      setQueryFilter(data.filter ?? null);
      setSelectedInstanceId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setQueryLoading(false);
    }
  };

  const selectedGraph = graphs.find((g) => g.id === selectedGraphId);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
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
              <button
                type="button"
                onClick={() => router.push('/graph/concepts')}
                className="px-4 py-2 text-base font-medium transition-colors relative cursor-pointer text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              >
                Concepts
              </button>
              <button
                type="button"
                className="px-4 py-2 text-base font-medium transition-colors relative cursor-default text-blue-600 border-b-2 border-blue-600"
              >
                Claims
              </button>
            </div>
            <div className="flex items-center gap-1 ml-4 border-l border-gray-200 pl-4">
              <span className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded">
                Graph
              </span>
              <Link
                href="/claims/sources"
                className="px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-50 rounded"
              >
                Sources
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PendingChangesButton />
            <ChatButton />
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-h-0 bg-white">
          <div className="px-6 py-3 flex items-center gap-4 shrink-0">
            <GraphSelector
              graphs={graphs}
              selectedGraphId={selectedGraphId}
              onSelect={selectGraph}
              loading={loadingGraphs}
            />
            {selectedGraph?.description && (
              <p className="text-xs text-gray-500 truncate">
                {selectedGraph.description}
              </p>
            )}
          </div>

          {error && (
            <div className="mx-6 mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700 shrink-0">
              {error}
            </div>
          )}

          <div className="flex-1 relative min-h-0">
            {graphData && graphData.nodes.length > 0 ? (
              <ClaimsForceGraph
                data={graphData}
                selectedNodeId={selectedInstanceId}
                onNodeClick={handleNodeClick}
              />
            ) : !loadingViz && !loadingGraphs ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2 p-6 text-center">
                <p className="text-sm">No instances in this graph yet.</p>
                <p className="text-xs text-gray-400">
                  Run <code className="bg-gray-100 px-1 rounded">npm run db:seed:claims</code> to load demo data.
                </p>
              </div>
            ) : null}
            {(loadingViz || loadingGraphs) && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                <LoadingSpinner />
              </div>
            )}
          </div>

          <NLQueryBar
            onSubmit={handleQuery}
            loading={queryLoading}
            explanation={queryExplanation}
            filter={queryFilter}
            disabled={!selectedGraphId}
          />
        </div>

        <aside className="w-80 shrink-0 bg-white border-l border-gray-200 flex flex-col min-h-0">
          <InstanceDetailPanel
            instanceId={selectedInstanceId}
            onClose={() => setSelectedInstanceId(null)}
          />
        </aside>
      </div>
    </div>
  );
}
