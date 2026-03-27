'use client';

import React, { useMemo } from 'react';
import { RecipeGraph } from '@/lib/types';

interface RecipeGraphOverlayProps {
  recipeGraph: RecipeGraph;
  frameLabel: string;
  onClose: () => void;
}

const NODE_TYPE_STYLES: Record<string, { fill: string; stroke: string; textFill: string }> = {
  entity: { fill: '#dbeafe', stroke: '#3b82f6', textFill: '#1e40af' },
  event: { fill: '#dcfce7', stroke: '#22c55e', textFill: '#166534' },
  attribute: { fill: '#fef3c7', stroke: '#f59e0b', textFill: '#92400e' },
};

const DEFAULT_STYLE = { fill: '#f3f4f6', stroke: '#9ca3af', textFill: '#374151' };

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-green-100 text-green-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-red-100 text-red-800',
};

interface LayoutNode {
  id: string;
  node_type: string;
  description: string;
  keywords: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LayoutEdge {
  source: LayoutNode;
  target: LayoutNode;
  label: string;
}

export default function RecipeGraphOverlay({ recipeGraph, frameLabel, onClose }: RecipeGraphOverlayProps) {
  const layout = useMemo(() => {
    const nodes = recipeGraph.nodes || [];
    const edges = recipeGraph.edges || [];
    if (nodes.length === 0) return { nodes: [], edges: [], width: 400, height: 300 };

    const hGap = 60;
    const vGap = 80;
    const minNodeWidth = 220;
    const nodePadding = 16;

    // Measure each node's required dimensions based on content
    function measureNode(n: { id: string; node_type: string; description: string; keywords: string[] }) {
      const charWidth = 7;
      const descWidth = n.description.length * charWidth + nodePadding * 2;
      const kwText = n.keywords.slice(0, 4).join(' · ');
      const kwWidth = kwText.length * 6.5 + nodePadding * 2;
      const width = Math.max(minNodeWidth, descWidth, kwWidth);

      const descLines = Math.ceil((n.description.length * charWidth) / (width - nodePadding * 2));
      const kwLines = Math.ceil((kwText.length * 6.5) / (width - nodePadding * 2));
      const height = 28 + descLines * 18 + kwLines * 16 + 16;

      return { width, height: Math.max(70, height) };
    }

    const nodeSizes = new Map<string, { width: number; height: number }>();
    nodes.forEach(n => nodeSizes.set(n.id, measureNode(n)));

    const nodeMap = new Map<string, LayoutNode>();
    const inDegree = new Map<string, number>();

    nodes.forEach(n => {
      inDegree.set(n.id, 0);
    });

    edges.forEach(e => {
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    });

    // Simple layered layout: roots (in-degree 0) at top, then BFS layers
    const layers: string[][] = [];
    const placed = new Set<string>();
    const queue: string[] = [];

    nodes.forEach(n => {
      if ((inDegree.get(n.id) || 0) === 0) {
        queue.push(n.id);
      }
    });

    if (queue.length === 0 && nodes.length > 0) {
      queue.push(nodes[0].id);
    }

    while (queue.length > 0) {
      const layer = [...queue];
      layers.push(layer);
      layer.forEach(id => placed.add(id));
      queue.length = 0;

      for (const id of layer) {
        for (const e of edges) {
          if (e.source === id && !placed.has(e.target)) {
            queue.push(e.target);
            placed.add(e.target);
          }
        }
      }
    }

    // Place any remaining unvisited nodes
    nodes.forEach(n => {
      if (!placed.has(n.id)) {
        layers.push([n.id]);
        placed.add(n.id);
      }
    });

    const totalWidth = Math.max(...layers.map(l => {
      let w = 0;
      l.forEach((id, i) => {
        w += nodeSizes.get(id)!.width;
        if (i < l.length - 1) w += hGap;
      });
      return w;
    }));
    const layerHeights = layers.map(l => Math.max(...l.map(id => nodeSizes.get(id)!.height)));
    const totalHeight = layerHeights.reduce((sum, h) => sum + h, 0) + (layers.length - 1) * vGap;

    let cumulativeY = 0;
    layers.forEach((layer, layerIdx) => {
      const layerH = layerHeights[layerIdx];
      let layerWidth = 0;
      layer.forEach((id, i) => {
        layerWidth += nodeSizes.get(id)!.width;
        if (i < layer.length - 1) layerWidth += hGap;
      });
      let currentX = (totalWidth - layerWidth) / 2;
      layer.forEach((nodeId) => {
        const srcNode = nodes.find(n => n.id === nodeId)!;
        const size = nodeSizes.get(nodeId)!;
        nodeMap.set(nodeId, {
          id: srcNode.id,
          node_type: srcNode.node_type,
          description: srcNode.description,
          keywords: srcNode.keywords,
          x: currentX + size.width / 2,
          y: cumulativeY + layerH / 2,
          width: size.width,
          height: size.height,
        });
        currentX += size.width + hGap;
      });
      cumulativeY += layerH + vGap;
    });

    const layoutEdges: LayoutEdge[] = edges
      .map(e => {
        const src = nodeMap.get(e.source);
        const tgt = nodeMap.get(e.target);
        if (!src || !tgt) return null;
        return { source: src, target: tgt, label: e.label };
      })
      .filter(Boolean) as LayoutEdge[];

    const padding = 60;
    return {
      nodes: Array.from(nodeMap.values()),
      edges: layoutEdges,
      width: totalWidth + padding * 2,
      height: totalHeight + padding * 2,
      padding,
    };
  }, [recipeGraph]);

  const pad = layout.padding || 60;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-[90vw] max-h-[90vh] overflow-auto flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">
              Recipe Graph &mdash; {frameLabel}
            </h2>
            {recipeGraph.confidence && (
              <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${CONFIDENCE_COLORS[recipeGraph.confidence] || 'bg-gray-100 text-gray-700'}`}>
                {recipeGraph.confidence}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Graph SVG */}
        <div className="flex-1 overflow-auto p-6">
          {layout.nodes.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
              No nodes in recipe graph
            </div>
          ) : (
            <svg
              width={layout.width}
              height={layout.height}
              className="block mx-auto"
            >
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
                </marker>
              </defs>

              {/* Edges */}
              {layout.edges.map((edge, i) => {
                const sx = edge.source.x + pad;
                const sy = edge.source.y + edge.source.height / 2 + pad;
                const tx = edge.target.x + pad;
                const ty = edge.target.y - edge.target.height / 2 + pad;
                const midY = (sy + ty) / 2;

                return (
                  <g key={`edge-${i}`}>
                    <path
                      d={`M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`}
                      fill="none"
                      stroke="#94a3b8"
                      strokeWidth={2}
                      markerEnd="url(#arrowhead)"
                    />
                    <rect
                      x={(sx + tx) / 2 - edge.label.length * 3.5 - 6}
                      y={midY - 10}
                      width={edge.label.length * 7 + 12}
                      height={20}
                      rx={4}
                      fill="white"
                      stroke="#e2e8f0"
                      strokeWidth={1}
                    />
                    <text
                      x={(sx + tx) / 2}
                      y={midY + 4}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={600}
                      fill="#64748b"
                      fontFamily="system-ui, sans-serif"
                    >
                      {edge.label}
                    </text>
                  </g>
                );
              })}

              {/* Nodes */}
              {layout.nodes.map(node => {
                const style = NODE_TYPE_STYLES[node.node_type] || DEFAULT_STYLE;
                const nx = node.x - node.width / 2 + pad;
                const ny = node.y - node.height / 2 + pad;

                return (
                  <g key={node.id}>
                    <rect
                      x={nx}
                      y={ny}
                      width={node.width}
                      height={node.height}
                      rx={10}
                      fill={style.fill}
                      stroke={style.stroke}
                      strokeWidth={2}
                    />
                    <foreignObject
                      x={nx}
                      y={ny}
                      width={node.width}
                      height={node.height}
                    >
                      <div style={{
                        width: '100%',
                        height: '100%',
                        padding: '8px 12px',
                        boxSizing: 'border-box',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          color: 'white',
                          backgroundColor: style.stroke,
                          padding: '1px 8px',
                          borderRadius: '9px',
                          alignSelf: 'flex-start',
                          textTransform: 'uppercase',
                          fontFamily: 'system-ui, sans-serif',
                        }}>
                          {node.node_type}
                        </span>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: style.textFill,
                          lineHeight: '1.4',
                          wordWrap: 'break-word',
                          fontFamily: 'system-ui, sans-serif',
                        }}>
                          {node.description}
                        </span>
                        <span style={{
                          fontSize: '10px',
                          color: '#94a3b8',
                          lineHeight: '1.4',
                          wordWrap: 'break-word',
                          fontFamily: 'system-ui, sans-serif',
                        }}>
                          {node.keywords.join(' · ')}
                        </span>
                      </div>
                    </foreignObject>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* Footer with reasoning */}
        {recipeGraph.confidence_reasoning && (
          <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 rounded-b-2xl shrink-0">
            <p className="text-xs text-gray-500">
              <span className="font-medium text-gray-600">Reasoning:</span>{' '}
              {recipeGraph.confidence_reasoning}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
