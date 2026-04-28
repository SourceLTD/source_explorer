'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeftIcon,
  PencilSquareIcon,
  TrashIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';
import {
  Issue,
  IssueStatus,
  IssuePriority,
  IssueWithChangesets,
  ISSUE_STATUSES,
  ISSUE_PRIORITIES,
  ISSUE_STATUS_LABELS,
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_STYLES,
  ISSUE_PRIORITY_STYLES,
} from '@/lib/issues/types';
import LoadingSpinner from '../LoadingSpinner';
import IssueFormModal from './IssueFormModal';
import { ConfirmDialog } from '../ui';

interface IssueDetailPanelProps {
  issueId: string;
  onBack: () => void;
  onUpdated?: (issue: Issue) => void;
  onDeleted?: (id: string) => void;
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

export default function IssueDetailPanel({
  issueId,
  onBack,
  onUpdated,
  onDeleted,
}: IssueDetailPanelProps) {
  const [issue, setIssue] = useState<IssueWithChangesets | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/issues/${issueId}`);
      if (!res.ok) throw new Error('Failed to load issue');
      const data = (await res.json()) as IssueWithChangesets;
      setIssue(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load issue');
    } finally {
      setLoading(false);
    }
  }, [issueId]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateField = async (updates: Partial<{ status: IssueStatus; priority: IssuePriority }>) => {
    try {
      const res = await fetch(`/api/issues/${issueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update');
      const updated = (await res.json()) as Issue;
      setIssue((prev) => (prev ? { ...prev, ...updated } : prev));
      onUpdated?.(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update');
    }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/issues/${issueId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete issue');
      onDeleted?.(issueId);
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete issue');
    }
  };

  const handleUnlinkChangeset = async (changesetId: string) => {
    try {
      const res = await fetch(`/api/changesets/${changesetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue_id: null }),
      });
      if (!res.ok) throw new Error('Failed to unlink');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to unlink');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="p-6 text-center text-gray-600">
        {error ?? 'Issue not found'}
        <div className="mt-4">
          <button
            onClick={onBack}
            className="text-blue-600 hover:underline text-sm"
          >
            Back to issues
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back
          </button>
          <span className="text-gray-300">|</span>
          <span className="text-xs text-gray-500">#{issue.id}</span>
          <h2 className="text-lg font-semibold text-gray-900 truncate">
            {issue.title}
          </h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setEditOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-md bg-white hover:bg-gray-50"
          >
            <PencilSquareIcon className="w-4 h-4" />
            Edit
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-700 border border-red-200 rounded-md bg-white hover:bg-red-50"
          >
            <TrashIcon className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-gray-500">Status</label>
            <select
              value={issue.status}
              onChange={(e) => updateField({ status: e.target.value as IssueStatus })}
              className={`text-xs rounded-full border px-2 py-0.5 font-medium ${ISSUE_STATUS_STYLES[issue.status]}`}
            >
              {ISSUE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ISSUE_STATUS_LABELS[s]}
                </option>
              ))}
            </select>

            <label className="text-xs text-gray-500 ml-4">Priority</label>
            <select
              value={issue.priority}
              onChange={(e) => updateField({ priority: e.target.value as IssuePriority })}
              className={`text-xs rounded-full border px-2 py-0.5 font-medium ${ISSUE_PRIORITY_STYLES[issue.priority]}`}
            >
              {ISSUE_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {ISSUE_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>

            {issue.assignee && (
              <span className="text-xs text-gray-500 ml-4">
                Assigned to <span className="font-medium text-gray-800">{issue.assignee}</span>
              </span>
            )}
          </div>

          {issue.labels.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {issue.labels.map((label) => (
                <Badge
                  key={label}
                  className="bg-gray-100 text-gray-700 border-gray-200"
                >
                  {label}
                </Badge>
              ))}
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Description</h3>
            {issue.description ? (
              <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-sm text-gray-800 whitespace-pre-wrap">
                {issue.description}
              </div>
            ) : (
              <div className="text-sm text-gray-400 italic">No description</div>
            )}
          </div>

          <div className="text-xs text-gray-500">
            Created by <span className="font-medium text-gray-700">{issue.created_by}</span> on{' '}
            {new Date(issue.created_at).toLocaleString()}
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <LinkIcon className="w-4 h-4" />
              Linked Pending Changes
              <span className="text-xs text-gray-500 font-normal">
                ({issue.changesets.length})
              </span>
            </h3>
            {issue.changesets.length === 0 ? (
              <div className="text-sm text-gray-400 italic border border-dashed border-gray-200 rounded-md p-4 text-center">
                No changesets linked to this issue yet.
              </div>
            ) : (
              <div className="border border-gray-200 rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left">ID</th>
                      <th className="px-3 py-2 text-left">Entity</th>
                      <th className="px-3 py-2 text-left">Operation</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Author</th>
                      <th className="px-3 py-2 text-left">Created</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {issue.changesets.map((cs) => (
                      <tr key={cs.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs text-gray-700">#{cs.id}</td>
                        <td className="px-3 py-2 text-gray-800">
                          {cs.entity_type}
                          {cs.entity_id ? ` #${cs.entity_id}` : ''}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{cs.operation}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex px-2 py-0.5 rounded-full border text-xs bg-gray-100 text-gray-700 border-gray-200">
                            {cs.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-700">{cs.created_by}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">
                          {new Date(cs.created_at).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => handleUnlinkChangeset(cs.id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Unlink
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <IssueFormModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={(updated) => {
          setIssue((prev) => (prev ? { ...prev, ...updated } : prev));
          onUpdated?.(updated);
        }}
        issue={issue}
      />

      <ConfirmDialog
        isOpen={confirmDelete}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete Issue"
        message="Are you sure you want to delete this issue? Linked changesets will be unlinked (not deleted)."
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
