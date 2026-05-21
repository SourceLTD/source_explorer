'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { XMarkIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';
import type { ClaimsInstanceDetail, ClaimsMentionDetail } from '@/lib/claims/types';

interface InstanceDetailPanelProps {
  instanceId: string | null;
  onClose: () => void;
}

/**
 * Render source text content with highlighted mention ranges.
 */
function HighlightedSourceText({
  content,
  mentions,
}: {
  content: string;
  mentions: ClaimsMentionDetail[];
}) {
  const resolved = mentions
    .filter((m) => m.globalStart != null && m.globalEnd != null)
    .map((m) => ({ start: m.globalStart!, end: m.globalEnd!, id: m.id }))
    .sort((a, b) => a.start - b.start);

  if (resolved.length === 0) {
    return <span>{content}</span>;
  }

  const segments: React.ReactNode[] = [];
  let cursor = 0;

  for (const { start, end, id } of resolved) {
    if (start > cursor) {
      segments.push(<span key={`pre-${id}`}>{content.slice(cursor, start)}</span>);
    }
    segments.push(
      <mark
        key={`hl-${id}`}
        className="bg-amber-200 text-amber-900 rounded-sm px-0.5"
      >
        {content.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }

  if (cursor < content.length) {
    segments.push(<span key="tail">{content.slice(cursor)}</span>);
  }

  return <>{segments}</>;
}

export default function InstanceDetailPanel({ instanceId, onClose }: InstanceDetailPanelProps) {
  const [detail, setDetail] = useState<ClaimsInstanceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!instanceId) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/claims/instances/${instanceId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load instance');
        return res.json() as Promise<ClaimsInstanceDetail>;
      })
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error loading instance');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [instanceId]);

  if (!instanceId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm p-6 text-center">
        Click an instance node to view its details
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-900">Instance Detail</h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 text-gray-500"
          aria-label="Close detail panel"
        >
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && <LoadingSpinner />}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {detail && !loading && (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Label</p>
              <p className="text-base font-medium text-gray-900">
                {(detail.metadata?.label as string) ?? `Instance ${detail.id}`}
              </p>
            </div>

            {detail.referentialStatus && detail.referentialStatus !== 'specific' && (
              <div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    detail.referentialStatus === 'generic'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {detail.referentialStatus === 'generic' ? 'Generic' : 'Hypothetical'}
                </span>
              </div>
            )}

            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Concept</p>
              <Link
                href={`/graph/concepts?entry=${detail.conceptId}`}
                className="text-blue-600 hover:underline text-sm font-medium"
              >
                {detail.conceptLabel}
              </Link>
            </div>

            {detail.confidence != null && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Confidence</p>
                <p className="text-sm text-gray-900">{(detail.confidence * 100).toFixed(0)}%</p>
              </div>
            )}

            {detail.mentions.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                  Mentions ({detail.mentions.length})
                </p>
                <ul className="space-y-1.5">
                  {detail.mentions.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
                    >
                      <DocumentTextIcon className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="font-medium text-amber-900">
                          {m.mentionText ?? 'Unknown'}
                        </span>
                        {m.breadcrumb && (
                          <span className="text-amber-700 text-xs ml-2">{m.breadcrumb}</span>
                        )}
                        {m.page != null && (
                          <span className="text-amber-600 text-xs ml-1">
                            (p. {m.page})
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.fillers.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Fillers</p>
                <ul className="space-y-2">
                  {detail.fillers.map((f) => (
                    <li
                      key={f.id}
                      className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-gray-700">{f.propertyLabel ?? 'Property'}:</span>{' '}
                      {f.fillerInstanceLabel ?? f.fillerValue ?? '—'}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.sourceText && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Source Text</p>
                <p className="text-sm text-gray-700 bg-gray-50 rounded-lg border border-gray-200 p-3 leading-relaxed whitespace-pre-wrap">
                  <HighlightedSourceText
                    content={detail.sourceText.content}
                    mentions={detail.mentions}
                  />
                </p>
                {detail.sourceText.sourceUri && (
                  <p className="text-xs text-gray-400 mt-1 truncate">{detail.sourceText.sourceUri}</p>
                )}
                {detail.sourceText.artifactUri && (
                  <p className="text-xs text-blue-500 mt-1 truncate">
                    {detail.sourceText.artifactUri}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
