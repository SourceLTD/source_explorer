'use client';

import React, { useMemo } from 'react';
import type { SourceInstance } from '@/app/api/claims/sources/[id]/route';

export const MENTION_COLORS = [
  { bg: 'bg-amber-200', text: 'text-amber-900', ring: 'ring-amber-400' },
  { bg: 'bg-blue-200', text: 'text-blue-900', ring: 'ring-blue-400' },
  { bg: 'bg-green-200', text: 'text-green-900', ring: 'ring-green-400' },
  { bg: 'bg-purple-200', text: 'text-purple-900', ring: 'ring-purple-400' },
  { bg: 'bg-rose-200', text: 'text-rose-900', ring: 'ring-rose-400' },
  { bg: 'bg-cyan-200', text: 'text-cyan-900', ring: 'ring-cyan-400' },
  { bg: 'bg-orange-200', text: 'text-orange-900', ring: 'ring-orange-400' },
  { bg: 'bg-teal-200', text: 'text-teal-900', ring: 'ring-teal-400' },
];

interface MentionSpan {
  start: number;
  end: number;
  instanceId: string;
  colorIndex: number;
  mentionText: string;
}

interface HighlightedDocumentProps {
  content: string;
  instances: SourceInstance[];
  hoveredInstanceId: string | null;
  onHoverInstance: (id: string | null) => void;
  onClickInstance: (id: string) => void;
}

export default function HighlightedDocument({
  content,
  instances,
  hoveredInstanceId,
  onHoverInstance,
  onClickInstance,
}: HighlightedDocumentProps) {
  const spans = useMemo(() => {
    const allSpans: MentionSpan[] = [];
    instances.forEach((inst, instIdx) => {
      for (const m of inst.mentions) {
        allSpans.push({
          start: m.globalStart,
          end: m.globalEnd,
          instanceId: inst.id,
          colorIndex: instIdx % MENTION_COLORS.length,
          mentionText: m.mentionText,
        });
      }
    });
    allSpans.sort((a, b) => a.start - b.start || b.end - a.end);
    return allSpans;
  }, [instances]);

  const segments = useMemo(() => {
    const result: React.ReactNode[] = [];
    let cursor = 0;

    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      if (span.start < cursor) continue;

      if (span.start > cursor) {
        result.push(
          <span key={`text-${cursor}`} className="text-gray-800">
            {content.slice(cursor, span.start)}
          </span>,
        );
      }

      const color = MENTION_COLORS[span.colorIndex];
      const isHovered = hoveredInstanceId === span.instanceId;

      result.push(
        <mark
          key={`mark-${span.start}-${span.instanceId}`}
          className={`${color.bg} ${color.text} rounded-sm px-0.5 cursor-pointer transition-all ${
            isHovered ? `ring-2 ${color.ring} shadow-sm` : ''
          }`}
          onMouseEnter={() => onHoverInstance(span.instanceId)}
          onMouseLeave={() => onHoverInstance(null)}
          onClick={() => onClickInstance(span.instanceId)}
          title={span.mentionText}
        >
          {content.slice(span.start, span.end)}
        </mark>,
      );
      cursor = span.end;
    }

    if (cursor < content.length) {
      result.push(
        <span key="tail" className="text-gray-800">
          {content.slice(cursor)}
        </span>,
      );
    }

    return result;
  }, [content, spans, hoveredInstanceId, onHoverInstance, onClickInstance]);

  return (
    <div className="text-sm leading-relaxed whitespace-pre-wrap font-serif">
      {segments}
    </div>
  );
}
