'use client';

import type { KnowledgeGraphSummary } from '@/lib/claims/types';

interface GraphSelectorProps {
  graphs: KnowledgeGraphSummary[];
  selectedGraphId: string | null;
  onSelect: (graphId: string) => void;
  loading?: boolean;
}

export default function GraphSelector({
  graphs,
  selectedGraphId,
  onSelect,
  loading = false,
}: GraphSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="graph-select" className="text-sm font-medium text-gray-700 whitespace-nowrap">
        Graph:
      </label>
      <select
        id="graph-select"
        value={selectedGraphId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        disabled={loading || graphs.length === 0}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[200px]"
      >
        {graphs.length === 0 ? (
          <option value="">No graphs available</option>
        ) : (
          graphs.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label} ({g.instanceCount})
            </option>
          ))
        )}
      </select>
    </div>
  );
}
