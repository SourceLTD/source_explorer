'use client';

import React from 'react';

interface RootNode {
  id: string;
  label: string;
  nodeCount?: number;
}

interface RootNodesViewProps {
  onNodeClick: (nodeId: string) => void;
}

const rootNodes: RootNode[] = [
  { id: 'happen.v.01', label: 'happen, hap, go on' },
  { id: 'know.v.02', label: 'know, cognize, cognise' },
  { id: 'have.v.03', label: 'have, have got, hold' },
  { id: 'act.v.06', label: 'act, move' },
  { id: 'exist.v.01', label: 'exist, be, been' },
  { id: 'be.v.03', label: 'be (copula)' },
  { id: 'miss.v.07', label: 'miss, lack' },
  { id: 'refer.v.04', label: 'refer, pertain, relate' },
];

export default function RootNodesView({ onNodeClick }: RootNodesViewProps) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="max-w-5xl w-full px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">
            Explore the Root Verbs
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
          {rootNodes.map((node) => (
            <button
              key={node.id}
              onClick={() => onNodeClick(node.id)}
              className="group relative bg-white p-8 rounded-xl transition-all duration-300 transform hover:-translate-y-1 border-2 border-gray-200 hover:border-blue-400 cursor-pointer"
            >
              <div className="flex flex-col items-start text-left">
                <div className="w-full mb-4">
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                      {node.label}
                    </h3>
                    <p className="text-sm text-gray-500 font-mono">
                      {node.id}
                    </p>
                  </div>
                </div>
                
                <div className="mt-2 flex items-center text-blue-600 group-hover:text-blue-700 font-medium">
                  <span className="text-sm">Explore this concept</span>
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

        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-3 bg-blue-50 px-6 py-3 rounded-full border border-blue-200">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-medium text-blue-900">
              These are the foundational verb concepts from which all other verbs in WordNet derive
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}



