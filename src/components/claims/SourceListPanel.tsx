'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DocumentTextIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
import type { SourceListItem } from '@/app/api/claims/sources/route';

interface SourceListPanelProps {
  selected: string | null;
  onSelect: (id: string) => void;
}

function contentTypeIcon(ct: string | null) {
  if (ct === 'application/pdf') return <DocumentTextIcon className="w-4 h-4 text-red-500" />;
  if (ct === 'text/html') return <GlobeAltIcon className="w-4 h-4 text-blue-500" />;
  return <DocumentTextIcon className="w-4 h-4 text-gray-400" />;
}

export default function SourceListPanel({ selected, onSelect }: SourceListPanelProps) {
  const [sources, setSources] = useState<SourceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const railRef = useRef<HTMLElement>(null);

  useEffect(() => {
    fetch('/api/claims/sources')
      .then((res) => res.json())
      .then((data) => {
        const items: SourceListItem[] = data.sources ?? [];
        setSources(items);
        if (items.length > 0 && !selected) {
          onSelect(items[0].id);
        }
      })
      .catch(() => setSources([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (sources.length > 0 && selected && !sources.find((s) => s.id === selected)) {
      onSelect(sources[0].id);
    }
  }, [sources, selected, onSelect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!['ArrowDown', 'ArrowUp', 'j', 'k'].includes(e.key)) return;
      e.preventDefault();
      const idx = sources.findIndex((s) => s.id === selected);
      const delta = e.key === 'ArrowDown' || e.key === 'j' ? 1 : -1;
      const next = Math.max(0, Math.min(sources.length - 1, idx + delta));
      onSelect(sources[next].id);
    },
    [sources, selected, onSelect],
  );

  return (
    <aside
      ref={railRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="w-[320px] shrink-0 border-r border-gray-200 bg-white overflow-y-auto focus:outline-none"
      aria-label="Source documents"
    >
      <div className="px-3 py-2 border-b border-gray-100 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {loading ? 'Loading...' : `${sources.length} source${sources.length === 1 ? '' : 's'}`}
      </div>
      <ul role="listbox">
        {sources.map((source) => {
          const isSelected = selected === source.id;
          return (
            <li key={source.id}>
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(source.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-gray-100 transition-colors ${
                  isSelected
                    ? 'bg-blue-50 border-l-2 border-l-blue-500'
                    : 'border-l-2 border-l-transparent hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  {contentTypeIcon(source.contentType)}
                  <span className="text-sm font-medium text-gray-900 truncate flex-1">
                    {source.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 ml-6 text-xs text-gray-500">
                  <span>{source.instanceCount} instance{source.instanceCount !== 1 ? 's' : ''}</span>
                  <span>{source.mentionCount} mention{source.mentionCount !== 1 ? 's' : ''}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
