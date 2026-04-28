'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { Modal } from '@/components/ui';
import {
  Issue,
  ISSUE_STATUS_LABELS,
  ISSUE_STATUS_STYLES,
  ISSUE_PRIORITY_LABELS,
  ISSUE_PRIORITY_STYLES,
} from '@/lib/issues/types';
import LoadingSpinner from '../LoadingSpinner';
import IssueFormModal from './IssueFormModal';

interface LinkIssueDialogProps {
  isOpen: boolean;
  onClose: () => void;
  changesetIds: string[];
  currentIssueId?: string | null;
  onLinked?: (issueId: string | null) => void;
}

export default function LinkIssueDialog({
  isOpen,
  onClose,
  changesetIds,
  currentIssueId,
  onLinked,
}: LinkIssueDialogProps) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSearch('');
    setLoading(true);
    (async () => {
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
    })();
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const open = issues.filter((i) => i.status !== 'closed');
    if (!q) return open;
    return open.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        (i.description ?? '').toLowerCase().includes(q) ||
        i.labels.some((l) => l.toLowerCase().includes(q)),
    );
  }, [issues, search]);

  const patchAll = async (issueId: string | null) => {
    // No-op if the user selects the row that's already linked (single selection case).
    if (
      issueId !== null &&
      changesetIds.length === 1 &&
      currentIssueId === issueId
    ) {
      onClose();
      return;
    }

    if (changesetIds.length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    setError(null);

    // Use allSettled so partial failures don't swallow successes — we still
    // want to surface which ones failed without rolling back those that
    // succeeded.
    const results = await Promise.allSettled(
      changesetIds.map((id) =>
        fetch(`/api/changesets/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ issue_id: issueId }),
        }).then(async (res) => {
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `Failed to link changeset ${id}`);
          }
          return id;
        }),
      ),
    );

    const failures = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );

    setSaving(false);

    if (failures.length === 0) {
      onLinked?.(issueId);
      onClose();
      return;
    }

    // At least one succeeded — notify parent so it can refresh — but keep the
    // dialog open so the user can see what went wrong.
    if (failures.length < changesetIds.length) {
      onLinked?.(issueId);
    }

    const firstMessage =
      failures[0].reason instanceof Error
        ? failures[0].reason.message
        : 'Failed to link';
    setError(
      failures.length === changesetIds.length
        ? firstMessage
        : `${failures.length} of ${changesetIds.length} updates failed: ${firstMessage}`,
    );
  };

  const title =
    changesetIds.length === 1
      ? 'Link changeset to issue'
      : `Link ${changesetIds.length} changesets to issue`;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        maxWidth="xl"
        footer={
          <div className="flex items-center justify-between gap-2">
            {currentIssueId && (
              <button
                onClick={() => patchAll(null)}
                disabled={saving}
                className="px-3 py-1.5 text-sm text-red-700 border border-red-200 rounded-md bg-white hover:bg-red-50 disabled:opacity-50"
              >
                <XMarkIcon className="inline w-4 h-4 mr-1" />
                Unlink current issue
              </button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={onClose}
                disabled={saving}
                className="px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        }
      >
        <div className="p-4 space-y-3">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search open issues…"
                className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={() => setFormOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
            >
              <PlusIcon className="w-4 h-4" />
              New
            </button>
          </div>

          {loading ? (
            <div className="py-10 flex justify-center">
              <LoadingSpinner />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-sm text-gray-500 py-10">
              No open issues match. Create one?
            </div>
          ) : (
            <div className="max-h-[50vh] overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
              {filtered.map((iss) => (
                <button
                  key={iss.id}
                  disabled={saving}
                  onClick={() => patchAll(iss.id)}
                  className={`w-full text-left px-3 py-2 hover:bg-gray-50 flex items-start gap-3 ${
                    currentIssueId === iss.id ? 'bg-blue-50' : ''
                  } disabled:opacity-50`}
                >
                  <span className="font-mono text-xs text-gray-500 pt-0.5">
                    #{iss.id}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {iss.title}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      <span
                        className={`inline-flex px-1.5 py-0.5 rounded-full border text-[10px] font-medium ${ISSUE_STATUS_STYLES[iss.status]}`}
                      >
                        {ISSUE_STATUS_LABELS[iss.status]}
                      </span>
                      <span
                        className={`inline-flex px-1.5 py-0.5 rounded-full border text-[10px] font-medium ${ISSUE_PRIORITY_STYLES[iss.priority]}`}
                      >
                        {ISSUE_PRIORITY_LABELS[iss.priority]}
                      </span>
                      {iss.labels.map((l) => (
                        <span
                          key={l}
                          className="inline-flex px-1.5 py-0.5 rounded-full border text-[10px] bg-gray-100 text-gray-700 border-gray-200"
                        >
                          {l}
                        </span>
                      ))}
                    </div>
                  </div>
                  {currentIssueId === iss.id && (
                    <span className="text-xs text-blue-700 font-medium pt-0.5">
                      Current
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <IssueFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={(issue) => {
          setIssues((prev) => [issue, ...prev]);
          void patchAll(issue.id);
        }}
      />
    </>
  );
}
