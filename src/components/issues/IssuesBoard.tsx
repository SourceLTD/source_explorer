'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
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

interface IssuesBoardProps {
  /** Optional initial issue id to preselect (for deep-linking). */
  initialIssueId?: string | null;
}

const STATUS_FILTER_OPTIONS: Array<{ value: 'all' | IssueStatus; label: string }> = [
  { value: 'all', label: 'All' },
  ...ISSUE_STATUSES.map((s) => ({ value: s as IssueStatus, label: ISSUE_STATUS_LABELS[s] })),
];

const PRIORITY_FILTER_OPTIONS: Array<{ value: 'all' | IssuePriority; label: string }> = [
  { value: 'all', label: 'All' },
  ...ISSUE_PRIORITIES.map((p) => ({ value: p as IssuePriority, label: ISSUE_PRIORITY_LABELS[p] })),
];

export default function IssuesBoard({ initialIssueId = null }: IssuesBoardProps) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | IssueStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | IssuePriority>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialIssueId);

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
                <th className="px-4 py-2 text-left w-16">ID</th>
                <th className="px-4 py-2 text-left">Title</th>
                <th className="px-4 py-2 text-left w-32">Status</th>
                <th className="px-4 py-2 text-left w-28">Priority</th>
                <th className="px-4 py-2 text-left w-32">Assignee</th>
                <th className="px-4 py-2 text-left w-24">Changes</th>
                <th className="px-4 py-2 text-left w-40">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filtered.map((iss) => (
                <tr
                  key={iss.id}
                  onClick={() => setSelectedId(iss.id)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">
                    #{iss.id}
                  </td>
                  <td className="px-4 py-2 text-gray-900">
                    <div className="font-medium truncate max-w-md">{iss.title}</div>
                    {iss.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
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
                  <td className="px-4 py-2 text-gray-700">
                    {iss.assignee ?? <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-2 text-gray-700">
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
    </div>
  );
}
