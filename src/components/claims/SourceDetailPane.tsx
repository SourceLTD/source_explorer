'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import HighlightedDocument, { MENTION_COLORS } from './HighlightedDocument';
import InstanceDetailPanel from './InstanceDetailPanel';
import type { SourceDetail, SourceInstance } from '@/app/api/claims/sources/[id]/route';

interface SourceDetailPaneProps {
  sourceId: string | null;
}

function ContentTypeBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const label = type === 'application/pdf' ? 'PDF' : type === 'text/html' ? 'HTML' : type;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
      {label}
    </span>
  );
}

function InstanceLegend({
  instances,
  hoveredInstanceId,
  selectedInstanceId,
  onHover,
  onClick,
}: {
  instances: SourceInstance[];
  hoveredInstanceId: string | null;
  selectedInstanceId: string | null;
  onHover: (id: string | null) => void;
  onClick: (id: string) => void;
}) {
  return (
    <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
        Instances ({instances.length})
      </h3>
      <ul className="space-y-1.5">
        {instances.map((inst, idx) => {
          const color = MENTION_COLORS[idx % MENTION_COLORS.length];
          const isHovered = hoveredInstanceId === inst.id;
          const isSelected = selectedInstanceId === inst.id;
          return (
            <li key={inst.id}>
              <button
                type="button"
                className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                  isSelected
                    ? 'bg-white shadow-sm ring-2 ring-blue-300'
                    : isHovered
                      ? 'bg-white shadow-sm ring-1 ring-gray-200'
                      : 'hover:bg-white'
                }`}
                onMouseEnter={() => onHover(inst.id)}
                onMouseLeave={() => onHover(null)}
                onClick={() => onClick(inst.id)}
              >
                <span className={`w-3 h-3 rounded-sm shrink-0 ${color.bg}`} />
                <span className="truncate font-medium text-gray-800">{inst.label}</span>
                <span className="ml-auto text-xs text-gray-400">
                  {inst.mentions.length} mention{inst.mentions.length !== 1 ? 's' : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function SourceDetailPane({ sourceId }: SourceDetailPaneProps) {
  const [detail, setDetail] = useState<SourceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoveredInstanceId, setHoveredInstanceId] = useState<string | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    setSelectedInstanceId(null);
    fetch(`/api/claims/sources/${sourceId}`)
      .then((res) => res.json())
      .then((data) => setDetail(data))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [sourceId]);

  const handleClickInstance = useCallback((id: string) => {
    setSelectedInstanceId((prev) => (prev === id ? null : id));
  }, []);

  if (!sourceId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Select a source to view
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Loading...
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Source not found
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-w-0 overflow-hidden">
      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="px-4 py-3 border-b border-gray-200 bg-white shrink-0">
          <div className="flex items-center gap-2">
            <ContentTypeBadge type={detail.contentType} />
            <h2 className="text-sm font-semibold text-gray-900 truncate">
              {detail.sourceUri ?? `Source ${detail.id}`}
            </h2>
            {detail.artifactUri && (
              <a
                href={detail.artifactUri}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-gray-400 hover:text-blue-500 shrink-0"
                title="Open original"
              >
                <ArrowTopRightOnSquareIcon className="w-4 h-4" />
              </a>
            )}
          </div>
        </header>

        {/* Document body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <HighlightedDocument
            content={detail.content}
            instances={detail.instances}
            hoveredInstanceId={hoveredInstanceId}
            onHoverInstance={setHoveredInstanceId}
            onClickInstance={handleClickInstance}
          />
        </div>

        {/* Instance legend */}
        {detail.instances.length > 0 && (
          <InstanceLegend
            instances={detail.instances}
            hoveredInstanceId={hoveredInstanceId}
            selectedInstanceId={selectedInstanceId}
            onHover={setHoveredInstanceId}
            onClick={handleClickInstance}
          />
        )}
      </div>

      {/* Instance detail side panel */}
      {selectedInstanceId && (
        <aside className="w-80 shrink-0 bg-white border-l border-gray-200 flex flex-col min-h-0">
          <InstanceDetailPanel
            instanceId={selectedInstanceId}
            onClose={() => setSelectedInstanceId(null)}
          />
        </aside>
      )}
    </div>
  );
}
