'use client';

import React, { useState, useCallback } from 'react';

interface RecipesGraphProps {
  recipe: Record<string, unknown> | null;
  className?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isCollapsible(value: unknown): boolean {
  return isObject(value) || isArray(value);
}

function entryCount(value: unknown): number {
  if (isArray(value)) return value.length;
  if (isObject(value)) return Object.keys(value).length;
  return 0;
}

function formatPrimitive(value: unknown): React.ReactNode {
  if (value === null) return <span className="text-gray-400">null</span>;
  if (value === undefined) return <span className="text-gray-400">undefined</span>;
  if (typeof value === 'boolean')
    return <span className="text-amber-600">{value ? 'true' : 'false'}</span>;
  if (typeof value === 'number')
    return <span className="text-blue-600">{String(value)}</span>;
  if (typeof value === 'string')
    return <span className="text-green-700">&quot;{value}&quot;</span>;
  return <span className="text-gray-700">{String(value)}</span>;
}

function JsonNode({ label, value, defaultExpanded = false }: { label?: string; value: unknown; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const toggle = useCallback(() => setExpanded(prev => !prev), []);
  const collapsible = isCollapsible(value);

  if (!collapsible) {
    return (
      <div className="flex items-baseline gap-1 py-0.5 pl-4">
        {label !== undefined && <span className="text-purple-700 font-medium">{label}:</span>}
        {formatPrimitive(value)}
      </div>
    );
  }

  const isArr = isArray(value);
  const entries = isArr ? (value as unknown[]).map((v, i) => [String(i), v] as const) : Object.entries(value as Record<string, unknown>);
  const bracket = isArr ? ['[', ']'] : ['{', '}'];
  const count = entryCount(value);

  return (
    <div className="pl-4">
      <div
        className="flex items-baseline gap-1 py-0.5 cursor-pointer select-none hover:bg-gray-50 rounded"
        onClick={toggle}
      >
        <span className="text-gray-400 w-4 text-center text-xs">{expanded ? '▼' : '▶'}</span>
        {label !== undefined && <span className="text-purple-700 font-medium">{label}:</span>}
        {!expanded && (
          <span className="text-gray-400 text-xs">
            {bracket[0]} {count} {count === 1 ? 'entry' : 'entries'} {bracket[1]}
          </span>
        )}
        {expanded && <span className="text-gray-400 text-xs">{bracket[0]}</span>}
      </div>
      {expanded && (
        <>
          {entries.map(([key, val]) => (
            <JsonNode key={key} label={key} value={val} />
          ))}
          <div className="pl-4 text-gray-400 text-xs py-0.5">{bracket[1]}</div>
        </>
      )}
    </div>
  );
}

export default function RecipesGraph({ recipe, className }: RecipesGraphProps) {
  if (!recipe || Object.keys(recipe).length === 0) {
    return (
      <div className={`w-full h-full flex items-center justify-center ${className ?? ''}`}>
        <div className="text-gray-500">No recipe data</div>
      </div>
    );
  }

  return (
    <div className={`w-full h-full overflow-auto p-4 font-mono text-sm ${className ?? ''}`}>
      <JsonNode value={recipe} defaultExpanded />
    </div>
  );
}
