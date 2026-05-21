'use client';

import { useEffect, useMemo, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';

interface FrameRoleMapping {
  id: string;
  parent_role_label: string;
  child_role_label: string | null;
  is_absorbed: boolean | null;
  incorporated_value: string | null;
  model: string | null;
  run_id: string;
  created_at: string;
}

interface MappingResponse {
  parent: { id: string; label: string };
  child: { id: string; label: string };
  mappings: FrameRoleMapping[];
}

interface FrameRoleMappingModalProps {
  parents: { id: string; label: string }[];
  childId: string;
  childLabel: string;
  onClose: () => void;
}

type RowFate = 'identical' | 'renamed' | 'merged' | 'incorporated' | 'absorbed' | 'dropped';

interface DisplayRow {
  key: string;
  parentRoles: string[];
  childRoleLabel: string | null;
  fate: RowFate;
  incorporatedValue: string | null;
}

function classifyMapping(
  m: FrameRoleMapping,
  isMerged: boolean
): RowFate {
  if (m.incorporated_value != null) return 'incorporated';
  if (m.child_role_label == null) {
    return m.is_absorbed ? 'absorbed' : 'dropped';
  }
  if (isMerged) return 'merged';
  if (m.parent_role_label === m.child_role_label) return 'identical';
  return 'renamed';
}

const FATE_ORDER: Record<RowFate, number> = {
  identical: 0,
  renamed: 1,
  merged: 2,
  incorporated: 3,
  absorbed: 4,
  dropped: 5,
};

export default function FrameRoleMappingModal({
  parents,
  childId,
  childLabel,
  onClose,
}: FrameRoleMappingModalProps) {
  const [selectedParentId, setSelectedParentId] = useState<string>(parents[0]?.id ?? '');
  const [data, setData] = useState<MappingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedParentId) return;
    
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(
      `/api/frame-role-mappings?parent_id=${encodeURIComponent(selectedParentId)}&child_id=${encodeURIComponent(childId)}`,
      { cache: 'no-store', signal: controller.signal }
    )
      .then(async resp => {
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body.error || `Request failed: ${resp.status}`);
        }
        return resp.json() as Promise<MappingResponse>;
      })
      .then(json => setData(json))
      .catch(err => {
        if (err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Unknown error');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [selectedParentId, childId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const rows: DisplayRow[] = useMemo(() => {
    if (!data) return [];

    const childRoleCounts = new Map<string, number>();
    for (const m of data.mappings) {
      if (m.child_role_label != null && m.incorporated_value == null) {
        childRoleCounts.set(
          m.child_role_label,
          (childRoleCounts.get(m.child_role_label) ?? 0) + 1
        );
      }
    }

    const mergedGroups = new Map<string, FrameRoleMapping[]>();
    const standalone: FrameRoleMapping[] = [];

    for (const m of data.mappings) {
      const count =
        m.child_role_label != null && m.incorporated_value == null
          ? (childRoleCounts.get(m.child_role_label) ?? 0)
          : 0;
      if (count > 1 && m.child_role_label != null) {
        const key = m.child_role_label;
        const list = mergedGroups.get(key) ?? [];
        list.push(m);
        mergedGroups.set(key, list);
      } else {
        standalone.push(m);
      }
    }

    const displayRows: DisplayRow[] = [];

    for (const m of standalone) {
      const fate = classifyMapping(m, false);
      displayRows.push({
        key: `single-${m.id}`,
        parentRoles: [m.parent_role_label],
        childRoleLabel: m.child_role_label,
        fate,
        incorporatedValue: m.incorporated_value,
      });
    }

    for (const [childRoleLabel, group] of mergedGroups.entries()) {
      const parentRoles = group
        .map(g => g.parent_role_label)
        .sort((a, b) => a.localeCompare(b));
      displayRows.push({
        key: `merged-${childRoleLabel}`,
        parentRoles,
        childRoleLabel,
        fate: 'merged',
        incorporatedValue: null,
      });
    }

    displayRows.sort((a, b) => {
      const fateDiff = FATE_ORDER[a.fate] - FATE_ORDER[b.fate];
      if (fateDiff !== 0) return fateDiff;
      return a.parentRoles[0].localeCompare(b.parentRoles[0]);
    });

    return displayRows;
  }, [data]);

  const resolvedParentLabel = data?.parent.label ?? parents.find(p => p.id === selectedParentId)?.label ?? '';
  const resolvedChildLabel = data?.child.label ?? childLabel;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[60]">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}
        onClick={onClose}
      />

      <div
        className="bg-white rounded-xl w-[90vw] max-w-2xl mx-4 max-h-[72vh] overflow-hidden relative z-10 flex flex-col shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Role Mapping
            </h2>
            <div className="flex items-center gap-2 mt-1">
              {parents.length > 1 ? (
                <select
                  value={selectedParentId}
                  onChange={e => setSelectedParentId(e.target.value)}
                  className="text-sm font-medium text-gray-900 bg-white border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {parents.map(p => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              ) : (
                <span className="text-sm font-medium text-gray-900">{resolvedParentLabel}</span>
              )}
              <span className="text-gray-400 text-sm">&rarr;</span>
              <span className="text-sm font-medium text-gray-900">{resolvedChildLabel}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
            title="Close (Esc)"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <main className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <LoadingSpinner />
            </div>
          ) : error ? (
            <div className="max-w-md mx-auto mt-8 px-4 py-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
              {error}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <p className="text-sm">
                No role mappings recorded for this parent-child edge.
              </p>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto">
              <div className="grid grid-cols-[1fr_44px_1fr] gap-x-3 mb-3 px-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 text-right">
                  {resolvedParentLabel}
                </div>
                <div />
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 text-left">
                  {resolvedChildLabel}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                {rows.map(row => (
                  <MappingRow key={row.key} row={row} />
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function MappingRow({ row }: { row: DisplayRow }) {
  const { fate, parentRoles, childRoleLabel, incorporatedValue } = row;

  const right = (() => {
    switch (fate) {
      case 'identical':
      case 'renamed':
      case 'merged':
        return (
          <span className="font-mono text-sm font-semibold text-gray-900">
            {childRoleLabel}
          </span>
        );
      case 'incorporated':
        return (
          <div className="flex flex-col items-start gap-0.5">
            <span className="font-mono text-sm font-semibold text-gray-900">
              {childRoleLabel}
            </span>
            <span className="text-xs text-amber-800">
              fixed to <span className="font-mono font-semibold">{incorporatedValue}</span>
            </span>
          </div>
        );
      case 'absorbed':
        return (
          <span className="italic text-sm text-gray-500">
            absorbed into word
          </span>
        );
      case 'dropped':
        return (
          <span className="italic text-sm text-red-600">
            dropped
          </span>
        );
    }
  })();

  return (
    <div className="grid grid-cols-[1fr_44px_1fr] items-center gap-x-3 px-2 py-1.5 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-colors">
      <div className="flex flex-col items-end gap-1">
        {parentRoles.map(r => (
          <span
            key={r}
            className="font-mono text-sm font-semibold text-gray-900"
          >
            {r}
          </span>
        ))}
      </div>

      <MappingArrows count={parentRoles.length} />

      <div className="flex items-center">{right}</div>
    </div>
  );
}

function MappingArrows({ count }: { count: number }) {
  const roleCount = Math.max(1, count);
  const rowHeight = 24;
  const height = Math.max(18, roleCount * rowHeight);
  const targetY = height / 2;
  const sourceYs = Array.from(
    { length: roleCount },
    (_, index) => rowHeight / 2 + index * rowHeight
  );

  return (
    <svg
      width={44}
      height={height}
      viewBox={`0 0 44 ${height}`}
      className="text-gray-400"
      aria-hidden="true"
    >
      {sourceYs.map((sourceY, index) => (
        <g key={index}>
          <line
            x1={2}
            y1={sourceY}
            x2={34}
            y2={targetY}
            stroke="currentColor"
            strokeWidth={1.5}
          />
          <polyline
            points={`${30},${targetY - 4} ${34},${targetY} ${30},${targetY + 4}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      ))}
    </svg>
  );
}
