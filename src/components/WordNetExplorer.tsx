'use client';

import { useState, useEffect } from 'react';
import { GraphNode, SearchResult, BreadcrumbItem } from '@/lib/types';
import LexicalGraph from './LexicalGraph';
import SearchBox from './SearchBox';
import Breadcrumbs from './Breadcrumbs';

interface WordNetExplorerProps {
  initialEntryId?: string;
}

export default function WordNetExplorer({ initialEntryId }: WordNetExplorerProps) {
  const [currentNode, setCurrentNode] = useState<GraphNode | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGraphNode = async (entryId: string) => {
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
    loadGraphNode(nodeId);
  };

  const handleSearchResult = (result: SearchResult) => {
    loadGraphNode(result.id);
  };

  const handleBreadcrumbNavigate = (id: string) => {
    loadGraphNode(id);
  };

  // Load initial entry
  useEffect(() => {
    if (initialEntryId) {
      loadGraphNode(initialEntryId);
    }
  }, [initialEntryId]);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-gray-900">
              Lexical Explorer
            </h1>
            <Breadcrumbs 
              items={breadcrumbs} 
              onNavigate={handleBreadcrumbNavigate} 
            />
          </div>
          
          <SearchBox onSelectResult={handleSearchResult} />
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
                  {currentNode.lemmas.join(', ') || currentNode.id}
                </h2>
                <span className="inline-block px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                  {getPartOfSpeechLabel(currentNode.pos)}
                </span>
              </div>

              {/* Definition */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Definition</h3>
                <p className="text-gray-900 text-sm leading-relaxed">
                  {currentNode.gloss}
                </p>
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
                          {parent.lemmas.join(', ') || parent.id}
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
                          {child.lemmas.join(', ') || child.id}
                        </div>
                        <div className="text-yellow-600 text-xs mt-1 line-clamp-2">
                          {child.gloss}
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

        {/* Graph Visualization */}
        <div className="flex-1 p-6">
          {currentNode && !isLoading ? (
            <LexicalGraph 
              currentNode={currentNode} 
              onNodeClick={handleNodeClick} 
            />
          ) : (
            <div className="h-full flex items-center justify-center bg-white rounded-lg shadow-sm border">
              {isLoading ? (
                <div className="text-center">
                  <div className="animate-spin h-12 w-12 border-2 border-gray-300 border-t-blue-600 rounded-full mx-auto mb-4"></div>
                  <p className="text-gray-500">Loading graph...</p>
                </div>
              ) : (
                <div className="text-center text-gray-400">
                  <svg className="h-24 w-24 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <p>Select an entry to visualize its relations</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function getPartOfSpeechLabel(pos: string): string {
  const labels: Record<string, string> = {
    'n': 'Noun',
    'v': 'Verb',
    'a': 'Adjective',
    'r': 'Adverb',
    's': 'Adjective Satellite',
  };
  return labels[pos] || pos;
}
