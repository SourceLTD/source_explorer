import { memo, useMemo } from 'react';
import type { SerializedJob } from '@/lib/llm/types';

export const StatusPill = memo(function StatusPill({ status }: { status: SerializedJob['status'] }) {
  const { label, color } = useMemo(() => {
    switch (status) {
      case 'queued':
        return { label: 'Queued', color: 'bg-yellow-100 text-yellow-800' };
      case 'running':
        return { label: 'Running', color: 'bg-blue-100 text-blue-800' };
      case 'completed':
        return { label: 'Completed', color: 'bg-green-100 text-green-800' };
      case 'failed':
        return { label: 'Failed', color: 'bg-red-100 text-red-800' };
      case 'cancelled':
        return { label: 'Cancelled', color: 'bg-gray-200 text-gray-700' };
      case 'paused':
        return { label: 'Paused', color: 'bg-orange-100 text-orange-700' };
      default:
        return { label: status, color: 'bg-gray-200 text-gray-700' };
    }
  }, [status]);

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${color}`}>
      {label}
    </span>
  );
});

export const Metric = memo(function Metric({ label, value, helper }: { label: string; value: string | JSX.Element; helper?: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-gray-900">{value}</div>
      {helper && <div className="text-[11px] text-gray-500">{helper}</div>}
    </div>
  );
});

export const ItemList = memo(function ItemList({
  title,
  items,
  emptyMessage,
  totalCount,
  onLoadMore,
}: {
  title: string;
  items: SerializedJob['items'];
  emptyMessage: string;
  totalCount: number;
  onLoadMore?: () => void;
}) {
  const hasMore = items.length < totalCount;
  const remaining = totalCount - items.length;
  
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</h5>
        {items.length > 0 && (
          <span className="text-[11px] text-gray-500">Showing {items.length} of {totalCount}</span>
        )}
      </div>
      {items.length === 0 ? (
        <div className="rounded border border-dashed border-gray-200 p-3 text-[11px] text-gray-500">{emptyMessage}</div>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map(item => {
              const getItemColors = () => {
                switch (item.status) {
                  case 'queued':
                  case 'submitting':
                  case 'processing':
                    return 'border-blue-200 bg-blue-50 text-blue-700';
                  case 'succeeded':
                    return 'border-green-200 bg-green-50 text-green-700';
                  case 'failed':
                    return 'border-red-200 bg-red-50 text-red-700';
                  case 'skipped':
                    return 'border-gray-200 bg-gray-50 text-gray-700';
                  default:
                    return 'border-gray-200 bg-gray-50 text-gray-700';
                }
              };
              
              return (
                <li key={item.id} className={`rounded border px-3 py-2 text-[11px] ${getItemColors()}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold">{item.entry.code ?? item.id}</span>
                      <span className="ml-2 uppercase opacity-75">{item.entry.pos}</span>
                    </div>
                    <span className="opacity-75">{item.status}</span>
                  </div>
                  {item.last_error && <div className="mt-1 text-[10px] text-red-600">{item.last_error}</div>}
                  {item.response_payload && item.status === 'succeeded' && (
                    <div className="mt-1 text-[10px] opacity-75">
                      Flagged: {item.flagged ? 'Yes' : 'No'}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {hasMore && onLoadMore && (
            <button
              onClick={onLoadMore}
              className="mt-2 w-full rounded border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Load More ({remaining} remaining)
            </button>
          )}
        </>
      )}
    </div>
  );
});

