'use client';

import React from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';

export interface NodeCardProps {
  title: string;
  subtitle?: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  children?: React.ReactNode;
  active?: boolean;
  type?: 'origin' | 'destination' | 'focus' | 'sibling';
  className?: string;
  noDivider?: boolean;
  subtitleInline?: boolean;
  subtle?: boolean;
  /**
   * When true, the title and subtitle wrap to multiple lines instead
   * of being truncated with an ellipsis, and the title auto-shrinks
   * to `text-xs` once it crosses a length threshold so unusually long
   * frame labels still fit without overflowing the card. Use this on
   * "hero" cards (the focused frame, its parents) where preserving
   * the full label matters more than a tidy single-line look.
   */
  wrap?: boolean;
  /**
   * Optional escape hatch for the title's size class. Pass a Tailwind
   * size token (e.g. `text-[10px]`) to override the auto-sized title
   * on compact cards where the wrap-mode default (text-sm / text-xs)
   * is still too large. Does not affect colour or weight.
   */
  titleClassName?: string;
}

// Title length above which we drop from text-sm to text-xs in wrap
// mode. Picked empirically for ~280-320px wide cards: shorter labels
// stay punchy at 14px, very long ones (e.g. multi-word phrases) only
// shrink to 12px so they still fit on at most two lines.
const WRAP_TITLE_SHRINK_LEN = 22;

export default function NodeCard({
  title,
  subtitle,
  loading,
  error,
  children,
  active = false,
  type = 'sibling',
  className = '',
  noDivider = false,
  subtitleInline = false,
  subtle = false,
  wrap = false,
  titleClassName,
}: NodeCardProps) {
  const getBorderClass = () => {
    if (subtle) return 'border-transparent bg-transparent shadow-none';
    if (active) return 'border-blue-500 ring-1 ring-blue-500';
    if (type === 'focus') return 'border-blue-600 bg-blue-50/30';
    if (type === 'origin') return 'border-gray-300 opacity-80';
    if (type === 'destination') return 'border-blue-400';
    return 'border-gray-200 hover:border-gray-300';
  };

  const getTitleClass = () => {
    if (type === 'focus') return 'text-blue-900 font-bold';
    return 'text-gray-900 font-semibold';
  };

  const titleSizeClass =
    titleClassName ??
    (wrap && title.length > WRAP_TITLE_SHRINK_LEN ? 'text-xs' : 'text-sm');
  const titleOverflowClass = wrap ? 'break-words' : 'truncate';
  const subtitleOverflowClass = wrap ? 'break-words' : 'truncate';

  return (
    <div 
      className={`p-3 rounded-xl border bg-white transition-all shadow-sm ${getBorderClass()} ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={`min-w-0 ${subtitleInline ? 'flex items-baseline gap-1.5' : ''}`}>
          <div
            className={`${titleSizeClass} ${titleOverflowClass} ${getTitleClass()}`}
            title={wrap ? undefined : title}
          >
            {title}
          </div>
          {subtitle && (
            <div className={`${subtitleInline ? 'text-[10px]' : 'mt-0.5 text-[11px]'} text-gray-500 ${subtitleOverflowClass}`}>
              {subtitleInline ? `(${subtitle})` : subtitle}
            </div>
          )}
        </div>
      </div>

      {(loading || error || children) && (
        <div className={`mt-2 ${noDivider ? '' : 'pt-2 border-t border-gray-100'}`}>
          {loading ? (
            <LoadingSpinner size="sm" noPadding />
          ) : error ? (
            <div className="text-xs text-red-600">{error}</div>
          ) : (
            <div className="text-xs text-gray-700 leading-relaxed">
              {children}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
