'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronUpDownIcon,
} from '@heroicons/react/24/outline';
import {
  Issue,
  IssueStatus,
  IssuePriority,
  ISSUE_STATUSES,
  ISSUE_PRIORITIES,
  ISSUE_STATUS_LABELS,
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_STYLES,
  ISSUE_PRIORITY_STYLES,
} from '@/lib/issues/types';
import LoadingSpinner from '../LoadingSpinner';
import IssueFormModal from './IssueFormModal';
import IssueDetailPanel from './IssueDetailPanel';
import IssueContextMenu, {
  type IssueContextMenuState,
  type IssuePatch,
} from './IssueContextMenu';

interface IssuesBoardProps {
  /** Optional initial issue id to preselect (for deep-linking). */
  initialIssueId?: string | null;
  /**
   * Called whenever the loaded issue list changes (initial load,
   * create, update, or delete). Lets a parent show a live count
   * (e.g. an "Issues" tab badge) without owning the data itself.
   */
  onIssuesChanged?: (issues: Issue[]) => void;
}

const STATUS_FILTER_OPTIONS: Array<{ value: 'all' | IssueStatus; label: string }> = [
  { value: 'all', label: 'All' },
  ...ISSUE_STATUSES.map((s) => ({ value: s as IssueStatus, label: ISSUE_STATUS_LABELS[s] })),
];

const PRIORITY_FILTER_OPTIONS: Array<{ value: 'all' | IssuePriority; label: string }> = [
  { value: 'all', label: 'All' },
  ...ISSUE_PRIORITIES.map((p) => ({ value: p as IssuePriority, label: ISSUE_PRIORITY_LABELS[p] })),
];

type IssueSortField =
  | 'id'
  | 'title'
  | 'status'
  | 'priority'
  | 'rows'
  | 'assignee'
  | 'changes'
  | 'created';

type SortOrder = 'asc' | 'desc';

interface IssueSortState {
  field: IssueSortField;
  order: SortOrder;
}

// Numeric weights so enum columns sort by semantic order rather than
// alphabetically. Indices match ISSUE_STATUSES / ISSUE_PRIORITIES so
// the canonical order in `types.ts` stays the source of truth.
const STATUS_RANK: Record<IssueStatus, number> = ISSUE_STATUSES.reduce(
  (acc, s, idx) => {
    acc[s] = idx;
    return acc;
  },
  {} as Record<IssueStatus, number>,
);

const PRIORITY_RANK: Record<IssuePriority, number> = ISSUE_PRIORITIES.reduce(
  (acc, p, idx) => {
    acc[p] = idx;
    return acc;
  },
  {} as Record<IssuePriority, number>,
);

// Default direction the first time a column is clicked. Numeric / date
// / severity columns feel most useful with the biggest values up top;
// strings sort A→Z by default.
const DEFAULT_SORT_ORDER: Record<IssueSortField, SortOrder> = {
  id: 'asc',
  title: 'asc',
  status: 'asc',
  priority: 'desc',
  rows: 'desc',
  assignee: 'asc',
  changes: 'desc',
  created: 'desc',
};

function compareIssueField(
  a: Issue,
  b: Issue,
  field: IssueSortField,
): number {
  switch (field) {
    case 'id':
      return Number(a.id) - Number(b.id);
    case 'title':
      return a.title.localeCompare(b.title);
    case 'status':
      return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    case 'priority':
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    case 'rows':
      return (a.open_findings_count ?? 0) - (b.open_findings_count ?? 0);
    case 'changes':
      return (a.changesets_count ?? 0) - (b.changesets_count ?? 0);
    case 'assignee':
      // Both rows have a value here — missing values are filtered out
      // upstream in `sortIssues` so unassigned rows always settle at
      // the bottom regardless of direction.
      return a.assignee!.localeCompare(b.assignee!);
    case 'created':
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
  }
}

function sortIssues(issues: Issue[], sort: IssueSortState): Issue[] {
  const arr = [...issues];
  const directionMultiplier = sort.order === 'asc' ? 1 : -1;
  arr.sort((a, b) => {
    // Unassigned rows always sink to the bottom — flipping them with
    // the direction multiplier on descending sort is rarely useful for
    // a "missing" value.
    if (sort.field === 'assignee') {
      const aMissing = !a.assignee;
      const bMissing = !b.assignee;
      if (aMissing && bMissing) {
        return (
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
        );
      }
      if (aMissing) return 1;
      if (bMissing) return -1;
    }

    const primary = compareIssueField(a, b, sort.field) * directionMultiplier;
    if (primary !== 0) return primary;

    // Stable tie-break: most recent first, mirroring the API's default
    // secondary order (`{ created_at: 'desc' }`).
    return (
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  });
  return arr;
}

export default function IssuesBoard({
  initialIssueId = null,
  onIssuesChanged,
}: IssuesBoardProps) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | IssueStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | IssuePriority>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialIssueId);
  const [contextMenu, setContextMenu] = useState<IssueContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    issueId: null,
  });
  // null = no explicit sort; the API order (status asc, created desc)
  // is preserved as the default view so headers don't show stale
  // arrows on first load.
  const [sort, setSort] = useState<IssueSortState | null>(null);

  const loadIssues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/issues');
      if (!res.ok) throw new Error('Failed to load issues');
      const data = (await res.json()) as { issues: Issue[] };
      setIssues(data.issues);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load issues');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadIssues();
  }, [loadIssues]);

  // Notify the parent any time the issues list changes so it can keep
  // a live count in sync (e.g. the Issues tab badge in the modal).
  // Gated on `!loading` so the initial empty `issues=[]` render
  // doesn't flash the parent's badge to 0 before the first fetch
  // resolves — the parent already has its own pre-fetched count.
  useEffect(() => {
    if (loading) return;
    onIssuesChanged?.(issues);
  }, [issues, loading, onIssuesChanged]);

  // Close the right-click menu on any outside click. Mirrors the
  // pattern used by the tabular DataTable's ContextMenu so the two
  // menus feel identical to interact with.
  useEffect(() => {
    if (!contextMenu.isOpen) return;
    const handleClickOutside = () => {
      setContextMenu((prev) => ({ ...prev, isOpen: false, issueId: null }));
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu((prev) => ({ ...prev, isOpen: false, issueId: null }));
      }
    };
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu.isOpen]);

  const handleRowContextMenu = useCallback(
    (e: React.MouseEvent, issueId: string) => {
      e.preventDefault();
      setContextMenu({
        isOpen: true,
        x: e.clientX,
        y: e.clientY,
        issueId,
      });
    },
    [],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu({ isOpen: false, x: 0, y: 0, issueId: null });
  }, []);

  const patchIssue = useCallback(
    async (issue: Issue, patch: IssuePatch) => {
      // Optimistically update so the row reflects the change immediately;
      // we still reconcile with the server response on success.
      setIssues((prev) =>
        prev.map((i) => (i.id === issue.id ? { ...i, ...patch } : i)),
      );
      try {
        const res = await fetch(`/api/issues/${issue.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error('Failed to update issue');
        const updated = (await res.json()) as Issue;
        setIssues((prev) =>
          prev.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)),
        );
      } catch (e) {
        // Roll back the optimistic update by reloading the canonical list.
        setError(e instanceof Error ? e.message : 'Failed to update issue');
        void loadIssues();
      }
    },
    [loadIssues],
  );

  const contextMenuIssue = useMemo(
    () =>
      contextMenu.issueId
        ? issues.find((i) => i.id === contextMenu.issueId) ?? null
        : null,
    [contextMenu.issueId, issues],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return issues.filter((iss) => {
      if (statusFilter !== 'all' && iss.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && iss.priority !== priorityFilter) return false;
      if (!q) return true;
      return (
        iss.title.toLowerCase().includes(q) ||
        (iss.description ?? '').toLowerCase().includes(q) ||
        iss.labels.some((l) => l.toLowerCase().includes(q))
      );
    });
  }, [issues, search, statusFilter, priorityFilter]);

  const sorted = useMemo(
    () => (sort ? sortIssues(filtered, sort) : filtered),
    [filtered, sort],
  );

  const handleSort = useCallback((field: IssueSortField) => {
    setSort((prev) =>
      prev && prev.field === field
        ? { field, order: prev.order === 'asc' ? 'desc' : 'asc' }
        : { field, order: DEFAULT_SORT_ORDER[field] },
    );
  }, []);

  if (selectedId) {
    return (
      <IssueDetailPanel
        issueId={selectedId}
        onBack={() => setSelectedId(null)}
        onUpdated={(updated) => {
          setIssues((prev) =>
            prev.map((i) => (i.id === updated.id ? { ...i, ...updated } : i))
          );
        }}
        onDeleted={(id) => {
          setIssues((prev) => prev.filter((i) => i.id !== id));
        }}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 bg-white flex flex-wrap items-center gap-2 shrink-0">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search issues…"
            className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | IssueStatus)}
          className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              Status: {opt.label}
            </option>
          ))}
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as 'all' | IssuePriority)}
          className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {PRIORITY_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              Priority: {opt.label}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={loadIssues}
            className="p-1.5 rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            title="Refresh"
          >
            <ArrowPathIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setFormOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
          >
            <PlusIcon className="w-4 h-4" />
            New Issue
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-600 text-sm">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-500 text-sm">
            {issues.length === 0
              ? 'No issues yet. Click “New Issue” to create one.'
              : 'No issues match the current filters.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600 uppercase sticky top-0">
              <tr>
                <SortableHeader
                  field="id"
                  label="ID"
                  sort={sort}
                  onSort={handleSort}
                  className="w-16"
                />
                <SortableHeader
                  field="title"
                  label="Title"
                  sort={sort}
                  onSort={handleSort}
                />
                <SortableHeader
                  field="status"
                  label="Status"
                  sort={sort}
                  onSort={handleSort}
                  className="w-32"
                />
                <SortableHeader
                  field="priority"
                  label="Priority"
                  sort={sort}
                  onSort={handleSort}
                  className="w-28"
                />
                <SortableHeader
                  field="rows"
                  label="Rows"
                  sort={sort}
                  onSort={handleSort}
                  align="center"
                  className="w-24"
                  title="Rows currently affected — open health-check findings linked to this issue."
                />
                <SortableHeader
                  field="assignee"
                  label="Assignee"
                  sort={sort}
                  onSort={handleSort}
                  className="w-32"
                />
                <SortableHeader
                  field="changes"
                  label="Changes"
                  sort={sort}
                  onSort={handleSort}
                  align="center"
                  className="w-24"
                />
                <SortableHeader
                  field="created"
                  label="Created"
                  sort={sort}
                  onSort={handleSort}
                  className="w-40"
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {sorted.map((iss) => (
                <tr
                  key={iss.id}
                  onClick={() => setSelectedId(iss.id)}
                  onContextMenu={(e) => handleRowContextMenu(e, iss.id)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">
                    #{iss.id}
                  </td>
                  <td className="px-4 py-2 text-gray-900">
                    <div className="font-medium truncate max-w-md">{iss.title}</div>
                    {(iss.diagnosis_code || iss.labels.length > 0) && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {iss.diagnosis_code && (
                          <span
                            className="inline-flex px-1.5 py-0.5 rounded-full border text-[10px] font-mono bg-purple-100 text-purple-800 border-purple-200"
                            title={iss.diagnosis_code.label}
                          >
                            {iss.diagnosis_code.code}
                          </span>
                        )}
                        {iss.labels.map((label) => (
                          <span
                            key={label}
                            className="inline-flex px-1.5 py-0.5 rounded-full border text-[10px] bg-gray-100 text-gray-700 border-gray-200"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-medium ${ISSUE_STATUS_STYLES[iss.status]}`}
                    >
                      {ISSUE_STATUS_LABELS[iss.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-medium ${ISSUE_PRIORITY_STYLES[iss.priority]}`}
                    >
                      {ISSUE_PRIORITY_LABELS[iss.priority]}
                    </span>
                  </td>
                  <td
                    className="px-4 py-2 text-center text-gray-700 tabular-nums"
                    title={
                      (iss.open_findings_count ?? 0) === 0
                        ? 'No open findings linked'
                        : `${iss.open_findings_count} open finding${
                            iss.open_findings_count === 1 ? '' : 's'
                          } linked`
                    }
                  >
                    {(iss.open_findings_count ?? 0) === 0 ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      iss.open_findings_count
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-700">
                    {iss.assignee ?? <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-2 text-center text-gray-700 tabular-nums">
                    {iss.changesets_count ?? 0}
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {new Date(iss.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <IssueFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={(issue) => {
          setIssues((prev) => [issue, ...prev]);
        }}
      />

      <IssueContextMenu
        contextMenu={contextMenu}
        issue={contextMenuIssue}
        onClose={closeContextMenu}
        onOpen={(iss) => setSelectedId(iss.id)}
        onPatch={patchIssue}
      />
    </div>
  );
}

interface SortableHeaderProps {
  field: IssueSortField;
  label: string;
  sort: IssueSortState | null;
  onSort: (field: IssueSortField) => void;
  align?: 'left' | 'right' | 'center';
  className?: string;
  title?: string;
}

function SortableHeader({
  field,
  label,
  sort,
  onSort,
  align = 'left',
  className = '',
  title,
}: SortableHeaderProps) {
  const isActive = sort?.field === field;
  const order = isActive ? sort!.order : null;
  const ariaSort: React.AriaAttributes['aria-sort'] = isActive
    ? order === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none';
  const tooltip =
    title ??
    (isActive
      ? `Sorted by ${label.toLowerCase()} (${
          order === 'asc' ? 'ascending' : 'descending'
        }). Click to reverse.`
      : `Sort by ${label.toLowerCase()}.`);

  const thAlignClass =
    align === 'right'
      ? 'text-right'
      : align === 'center'
        ? 'text-center'
        : 'text-left';
  // For right-aligned columns we flip the sort arrow to the left so it
  // sits between the column edge and the label, mirroring the
  // tabular-mode DataTable. Centred columns keep the arrow on the
  // right (after the label) so the centred glyph reads consistently.
  const buttonExtraClass = align === 'right' ? 'flex-row-reverse' : '';

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`px-4 py-2 ${thAlignClass} ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        title={tooltip}
        className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-gray-900 ${buttonExtraClass} ${
          isActive ? 'text-gray-900' : 'text-gray-600'
        }`}
      >
        <span>{label}</span>
        {isActive ? (
          order === 'asc' ? (
            <ChevronUpIcon className="w-3 h-3 text-blue-600" />
          ) : (
            <ChevronDownIcon className="w-3 h-3 text-blue-600" />
          )
        ) : (
          <ChevronUpDownIcon className="w-3 h-3 text-gray-300" />
        )}
      </button>
    </th>
  );
}
