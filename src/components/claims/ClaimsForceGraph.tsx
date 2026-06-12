'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import type { ClaimsGraphPayload, ClaimsNode, ClaimsNodeType, ReferentialStatus } from '@/lib/claims/types';

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  type: ClaimsNodeType;
  label: string;
  conceptLabel?: string;
  matched?: boolean;
  referentialStatus?: ReferentialStatus;
  pendingChangePlanId?: string;
  pendingConceptLabel?: string;
  pendingConceptArchetype?: string;
  fallbackConceptLabel?: string;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  id: string;
  type: 'filler' | 'typed_as';
  propertyLabel?: string;
}

interface ClaimsForceGraphProps {
  data: ClaimsGraphPayload;
  selectedNodeId?: string | null;
  onNodeClick?: (nodeId: string, type: ClaimsNodeType) => void;
  className?: string;
}

const NODE_RADIUS = 22;
const CONCEPT_WIDTH = 100;
const CONCEPT_HEIGHT = 36;
const BASE_LINK_DISTANCE = 85;
const LINK_DISTANCE_PER_CHAR = 5;
const CHARGE_STRENGTH = -260;
const COLLISION_RADIUS = 34;

function linkDistance(l: SimLink): number {
  const labelLen = l.propertyLabel?.length ?? 0;
  return BASE_LINK_DISTANCE + labelLen * LINK_DISTANCE_PER_CHAR;
}

function graphDataKey(data: ClaimsGraphPayload): string {
  const nodePart = data.nodes
    .map((n) => `${n.id}:${n.matched ? 1 : 0}`)
    .sort()
    .join('|');
  const linkPart = data.links
    .map((l) => l.id)
    .sort()
    .join('|');
  return `${nodePart}#${linkPart}`;
}

function applyNodeSelection(
  node: d3.Selection<SVGGElement, SimNode, SVGGElement, unknown>,
  selectedNodeId: string | null | undefined,
) {
  node.each(function (d) {
    const el = d3.select(this);
    const isSelected = selectedNodeId === d.id;
    const shape = el.select('circle, rect');
    const isPendingTBox = d.type === 'instance' && !!d.pendingChangePlanId;
    shape
      .attr(
        'stroke',
        isSelected ? '#1e40af' : isPendingTBox ? '#d97706' : d.type === 'concept' ? '#6366f1' : '#2563eb',
      )
      .attr('stroke-width', isSelected ? 3 : isPendingTBox ? 2.5 : 1.5);
    if (d.type === 'instance') {
      if (isPendingTBox) {
        shape.attr('stroke-dasharray', '4 2');
      } else if (d.referentialStatus === 'generic') {
        shape.attr('stroke-dasharray', '6 3');
      } else if (d.referentialStatus === 'hypothetical') {
        shape.attr('stroke-dasharray', '2 3');
      } else {
        shape.attr('stroke-dasharray', null);
      }
    }
  });
}

export default function ClaimsForceGraph({
  data,
  selectedNodeId,
  onNodeClick,
  className = '',
}: ClaimsForceGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  const nodeSelectionRef = useRef<d3.Selection<SVGGElement, SimNode, SVGGElement, unknown> | null>(null);
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const zoomTransformRef = useRef<d3.ZoomTransform | null>(null);
  const onNodeClickRef = useRef(onNodeClick);
  onNodeClickRef.current = onNodeClick;

  const dataKey = useMemo(() => graphDataKey(data), [data]);

  // Build or rebuild the graph only when data changes.
  useEffect(() => {
    const container = containerRef.current;
    const svgEl = svgRef.current;
    if (!container || !svgEl) return;

    simulationRef.current?.stop();

    const width = container.clientWidth;
    const height = container.clientHeight;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        zoomTransformRef.current = event.transform;
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    if (zoomTransformRef.current) {
      svg.call(zoom.transform, zoomTransformRef.current);
    }

    const hasHighlights = data.nodes.some((n) => n.matched === true);
    const savedPositions = positionsRef.current;

    const nodes: SimNode[] = data.nodes.map((n: ClaimsNode) => {
      const saved = savedPositions.get(n.id);
      return {
        ...n,
        x: saved?.x ?? width / 2 + (Math.random() - 0.5) * 200,
        y: saved?.y ?? height / 2 + (Math.random() - 0.5) * 200,
      };
    });

    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    const links: SimLink[] = data.links
      .filter((l) => nodeById.has(l.source as string) && nodeById.has(l.target as string))
      .map((l) => ({
        ...l,
        source: nodeById.get(l.source as string)!,
        target: nodeById.get(l.target as string)!,
      }));

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(linkDistance))
      .force('charge', d3.forceManyBody().strength(CHARGE_STRENGTH))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(COLLISION_RADIUS));

    simulationRef.current = simulation;

    const linkGroup = g.append('g').attr('class', 'links');
    const link = linkGroup
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', (d) => (d.type === 'typed_as' ? '#cbd5e1' : '#94a3b8'))
      .attr('stroke-width', (d) => (d.type === 'typed_as' ? 1 : 2))
      .attr('stroke-dasharray', (d) => (d.type === 'typed_as' ? '4 4' : null))
      .attr('opacity', (d) => {
        if (!hasHighlights) return 0.7;
        const src = d.source as SimNode;
        const tgt = d.target as SimNode;
        return src.matched || tgt.matched ? 0.9 : 0.15;
      });

    const linkLabel = linkGroup
      .selectAll('text')
      .data(links.filter((l) => l.type === 'filler' && l.propertyLabel))
      .join('text')
      .text((d) => d.propertyLabel ?? '')
      .attr('font-size', 10)
      .attr('fill', '#64748b')
      .attr('text-anchor', 'middle')
      .attr('pointer-events', 'none');

    const dragBehavior = d3
      .drag<SVGGElement, SimNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
        if (d.x != null && d.y != null) {
          positionsRef.current.set(d.id, { x: d.x, y: d.y });
        }
      });

    const nodeGroup = g.append('g').attr('class', 'nodes');
    const node = nodeGroup
      .selectAll<SVGGElement, SimNode>('g')
      .data(nodes, (d) => d.id)
      .join('g')
      .attr('cursor', 'pointer')
      .call(dragBehavior)
      .on('click', (_event, d) => {
        if (d.type === 'instance' && !d.id.startsWith('primitive-')) {
          onNodeClickRef.current?.(d.id, d.type);
        }
      });

    node.each(function (d) {
      const el = d3.select(this);
      const opacity = !hasHighlights || d.matched ? 1 : 0.25;
      const isGeneric = d.referentialStatus === 'generic';
      const isHypothetical = d.referentialStatus === 'hypothetical';

      if (d.type === 'concept') {
        el.append('rect')
          .attr('width', CONCEPT_WIDTH)
          .attr('height', CONCEPT_HEIGHT)
          .attr('x', -CONCEPT_WIDTH / 2)
          .attr('y', -CONCEPT_HEIGHT / 2)
          .attr('rx', 8)
          .attr('fill', '#e0e7ff')
          .attr('opacity', opacity);
      } else {
        const circle = el.append('circle')
          .attr('r', NODE_RADIUS)
          .attr('fill', d.pendingChangePlanId ? '#fed7aa' : isGeneric ? '#c4b5fd' : isHypothetical ? '#fde68a' : d.matched ? '#3b82f6' : '#93c5fd')
          .attr('opacity', opacity);

        if (d.pendingChangePlanId) {
          circle.attr('stroke-dasharray', '4 2');
        } else if (isGeneric) {
          circle.attr('stroke-dasharray', '6 3');
        } else if (isHypothetical) {
          circle.attr('stroke-dasharray', '2 3');
        }
      }

      // For instance nodes show the concept label (what type of thing it is).
      // For concept nodes show their own label.
      const displayLabel =
        d.type === 'instance'
          ? (d.pendingConceptLabel ?? d.conceptLabel ?? d.label)
          : d.label;

      // Shrink font size so the full label fits without truncation.
      // Instance labels sit below the node and can spread wider than the circle.
      // Concept labels must fit inside the pill.
      const maxLabelWidth = d.type === 'concept' ? CONCEPT_WIDTH - 8 : 120;
      const baseFontSize = 11;
      const charsAtBase = Math.floor(maxLabelWidth / (baseFontSize * 0.6));
      const labelFontSize =
        displayLabel.length <= charsAtBase
          ? baseFontSize
          : Math.max(9, Math.floor((maxLabelWidth / displayLabel.length) / 0.6));

      el.append('text')
        .text(displayLabel)
        .attr('text-anchor', 'middle')
        .attr('dy', d.type === 'concept' ? 4 : NODE_RADIUS + 14)
        .attr('font-size', labelFontSize)
        .attr('font-weight', 500)
        .attr('fill', '#1e293b')
        .attr('pointer-events', 'none')
        .attr('opacity', opacity);

      if (d.pendingChangePlanId && d.type === 'instance') {
        el.append('text')
          .text('pending concept')
          .attr('text-anchor', 'middle')
          .attr('dy', -NODE_RADIUS - 6)
          .attr('font-size', 9)
          .attr('font-weight', 700)
          .attr('fill', '#b45309')
          .attr('pointer-events', 'none')
          .attr('opacity', opacity);
      }
    });

    nodeSelectionRef.current = node;
    applyNodeSelection(node, selectedNodeId);

    simulation.on('tick', () => {
      for (const n of nodes) {
        if (n.x != null && n.y != null) {
          positionsRef.current.set(n.id, { x: n.x, y: n.y });
        }
      }

      link
        .attr('x1', (d) => (d.source as SimNode).x ?? 0)
        .attr('y1', (d) => (d.source as SimNode).y ?? 0)
        .attr('x2', (d) => (d.target as SimNode).x ?? 0)
        .attr('y2', (d) => (d.target as SimNode).y ?? 0);

      linkLabel
        .attr('x', (d) => {
          const s = d.source as SimNode;
          const t = d.target as SimNode;
          return ((s.x ?? 0) + (t.x ?? 0)) / 2;
        })
        .attr('y', (d) => {
          const s = d.source as SimNode;
          const t = d.target as SimNode;
          return ((s.y ?? 0) + (t.y ?? 0)) / 2 - 4;
        });

      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      svg.attr('width', w).attr('height', h);
      simulation.force('center', d3.forceCenter(w / 2, h / 2));
      simulation.alpha(0.3).restart();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      simulation.stop();
      simulationRef.current = null;
      nodeSelectionRef.current = null;
    };
  }, [dataKey]); // rebuild only when graph payload changes

  // Update selection highlight without rebuilding the graph.
  useEffect(() => {
    if (nodeSelectionRef.current) {
      applyNodeSelection(nodeSelectionRef.current, selectedNodeId);
    }
  }, [selectedNodeId]);

  return (
    <div ref={containerRef} className={`w-full h-full ${className}`}>
      <svg ref={svgRef} className="w-full h-full bg-white" />
    </div>
  );
}
