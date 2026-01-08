'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  XMarkIcon,
  CheckIcon,
  TrashIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

// --- Types ---

interface FieldChange {
  id: string;
  changeset_id: string;
  field_name: string;
  old_value: unknown;
  new_value: unknown;
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
}

interface Changeset {
  id: string;
  entity_type: string;
  entity_id: string | null;
  operation: 'create' | 'update' | 'delete';
  entity_version: number | null;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  status: string;
  created_by: string;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  comment: string | null;
  field_changes: FieldChange[];
}

interface ChangesetsByType {
  entity_type: string;
  count: number;
  changesets: Changeset[];
}

interface Changegroup {
  id: string;
  source: string;
  label: string | null;
  description: string | null;
  llm_job_id: string | null;
  llm_job: {
    id: string;
    label: string | null;
    status: string;
    submitted_by: string | null;
  } | null;
  status: string;
  created_by: string;
  created_at: string;
  committed_by: string | null;
  committed_at: string | null;
  total_changesets: number;
  approved_changesets: number;
  rejected_changesets: number;
  changesets_by_type: ChangesetsByType[];
}

interface PendingChangesData {
  changegroups: Changegroup[];
  ungrouped_changesets_by_type: ChangesetsByType[];
  total_pending_changesets: number;
  total_changegroups: number;
}

// Flat versions for the table
interface FlatFieldChange extends FieldChange {
  entity_type: string;
  entity_id: string | null;
  entity_display: string;
  operation: string;
  group_label: string;
  group_source: string;
  group_id: string | null;
  created_at: string;
  created_by: string;
}

interface FlatChangeset extends Omit<Changeset, 'field_changes'> {
  entity_display: string;
  group_label: string;
  group_source: string;
  group_id: string | null;
  field_count: number;
  field_changes: FieldChange[]; // Keep them for preview
}

type ViewGranularity = 'fields' | 'changesets';

interface PendingChangesListProps {
  onRefresh?: () => void;
}

// --- Helpers ---

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function getEntityDisplayName(changeset: Changeset): string {
  const snapshot = changeset.before_snapshot || changeset.after_snapshot;
  if (snapshot) {
    const name = snapshot.word || snapshot.name || snapshot.code || snapshot.gloss || snapshot.label;
    if (name) return `"${String(name).substring(0, 30)}${String(name).length > 30 ? '...' : ''}"`;
  }
  return changeset.entity_id ? `#${changeset.entity_id}` : 'New';
}

function getOperationColor(operation: string): string {
  switch (operation) {
    case 'create': return 'bg-green-100 text-green-800';
    case 'update': return 'bg-blue-100 text-blue-800';
    case 'delete': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

function formatUserName(user: string | null): string {
  if (!user) return 'unknown';
  if (user === 'current-user') return 'current user';
  if (user === 'system:llm-agent') return 'LLM Agent';
  if (user.includes('@')) return user.split('@')[0];
  return user;
}

// --- Component ---

export default function PendingChangesList({ onRefresh }: PendingChangesListProps) {
  const [data, setData] = useState<PendingChangesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewGranularity>('fields');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/changegroups/pending');
      if (!response.ok) throw new Error('Failed to fetch pending changes');
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- Flattening Logic ---

  const { flatFieldChanges, flatChangesets } = useMemo(() => {
    const fields: FlatFieldChange[] = [];
    const sets: FlatChangeset[] = [];

    if (!data) return { flatFieldChanges: fields, flatChangesets: sets };

    const processChangeset = (cs: Changeset, cg?: Changegroup) => {
      const entityDisplay = getEntityDisplayName(cs);
      const groupLabel = cg ? (cg.label || (cg.llm_job ? cg.llm_job.label || cg.llm_job.id : cg.source)) : 'Manual';
      const groupSource = cg ? cg.source : '';
      const groupId = cg ? cg.id : null;

      // Add to flatChangesets
      sets.push({
        ...cs,
        entity_display: entityDisplay,
        group_label: groupLabel,
        group_source: groupSource,
        group_id: groupId,
        field_count: cs.field_changes.length,
      });

      // Add to flatFieldChanges
      cs.field_changes.forEach(fc => {
        fields.push({
          ...fc,
          entity_type: cs.entity_type,
          entity_id: cs.entity_id,
          entity_display: entityDisplay,
          operation: cs.operation,
          group_label: groupLabel,
          group_source: groupSource,
          group_id: groupId,
          created_at: cs.created_at,
          created_by: cs.created_by,
        });
      });
    };

    // Process Changegroups
    data.changegroups.forEach(cg => {
      cg.changesets_by_type.forEach(et => {
        et.changesets.forEach(cs => processChangeset(cs, cg));
      });
    });

    // Process Ungrouped
    data.ungrouped_changesets_by_type.forEach(et => {
      et.changesets.forEach(cs => processChangeset(cs));
    });

    return { flatFieldChanges: fields, flatChangesets: sets };
  }, [data]);

  // --- Actions ---

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleToggleAll = () => {
    const currentList = view === 'fields' ? flatFieldChanges : flatChangesets;
    if (selectedIds.size === currentList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(currentList.map(item => item.id)));
    }
  };

  const updateFieldStatus = async (fieldChangeId: string, status: 'approved' | 'rejected') => {
    const fc = flatFieldChanges.find(x => x.id === fieldChangeId);
    if (!fc) return;

    // We need the changeset ID for the API call
    let changesetId = fc.changeset_id;

    try {
      const response = await fetch(`/api/changesets/${changesetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_change_id: fieldChangeId, status }),
      });
      if (!response.ok) throw new Error('Failed to update status');
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const commitChangeset = async (changesetId: string) => {
    try {
      const response = await fetch(`/api/changesets/${changesetId}/commit`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to commit');
      return true;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const handleSingleCommit = async (id: string) => {
    setIsCommitting(true);
    if (view === 'fields') {
      const success = await updateFieldStatus(id, 'approved');
      if (success) {
        // Find changeset to commit
        const fc = flatFieldChanges.find(x => x.id === id);
        if (fc) await commitChangeset(fc.changeset_id);
      }
    } else {
      // Approve all in changeset then commit
      try {
        await fetch(`/api/changesets/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve_all' }),
        });
        await commitChangeset(id);
      } catch (err) {
        console.error(err);
      }
    }
    await fetchData();
    setIsCommitting(false);
  };

  const handleBulkCommit = async () => {
    setIsCommitting(true);
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      if (view === 'fields') {
        const fc = flatFieldChanges.find(x => x.id === id);
        if (fc) {
          await updateFieldStatus(id, 'approved');
          await commitChangeset(fc.changeset_id);
        }
      } else {
        await fetch(`/api/changesets/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve_all' }),
        });
        await commitChangeset(id);
      }
    }
    setSelectedIds(new Set());
    await fetchData();
    setIsCommitting(false);
  };

  const handleBulkReject = async () => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      if (view === 'fields') {
        await updateFieldStatus(id, 'rejected');
      } else {
        await fetch(`/api/changesets/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reject_all' }),
        });
      }
    }
    setSelectedIds(new Set());
    await fetchData();
  };

  // --- Render ---

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <ArrowPathIcon className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-24 bg-white rounded-2xl shadow-sm border border-gray-100">
        <p className="text-red-600 mb-4">{error}</p>
        <button onClick={fetchData} className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors">
          Try Again
        </button>
      </div>
    );
  }

  const currentList = view === 'fields' ? flatFieldChanges : flatChangesets;
  const hasPending = data && data.total_pending_changesets > 0;

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pending Changes</h1>
          <p className="text-gray-500 text-sm mt-1">
            {data?.total_pending_changesets || 0} changesets across {data?.total_changegroups || 0} groups
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex bg-gray-100 p-1 rounded-xl border border-gray-200">
            <button
              onClick={() => { setView('fields'); setSelectedIds(new Set()); }}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${view === 'fields' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Field Changes
            </button>
            <button
              onClick={() => { setView('changesets'); setSelectedIds(new Set()); }}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${view === 'changesets' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Changesets
            </button>
          </div>
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="p-2.5 bg-gray-50 text-gray-600 rounded-xl hover:bg-gray-100 border border-gray-200 transition-colors disabled:opacity-50"
          >
            <ArrowPathIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-8 animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-3 border-r border-gray-700 pr-8">
            <span className="bg-blue-500 text-white w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold">
              {selectedIds.size}
            </span>
            <span className="text-sm font-medium">Items selected</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleBulkCommit}
              disabled={isCommitting}
              className="px-5 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <CheckIcon className="w-4 h-4" />
              Commit Selected
            </button>
            <button
              onClick={handleBulkReject}
              className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2"
            >
              <XMarkIcon className="w-4 h-4" />
              Reject Selected
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table Content */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {!hasPending ? (
          <div className="text-center py-24">
            <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900">All Clear!</h3>
            <p className="text-gray-500">No pending changes to review.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="p-4 w-12 text-center">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      checked={selectedIds.size > 0 && selectedIds.size === currentList.length}
                      onChange={handleToggleAll}
                    />
                  </th>
                  <th className="p-4 text-sm font-semibold text-gray-700">Entity</th>
                  <th className="p-4 text-sm font-semibold text-gray-700">Op</th>
                  {view === 'fields' ? (
                    <>
                      <th className="p-4 text-sm font-semibold text-gray-700">Field</th>
                      <th className="p-4 text-sm font-semibold text-gray-700">Old Value</th>
                      <th className="p-4 text-sm font-semibold text-gray-700">New Value</th>
                    </>
                  ) : (
                    <th className="p-4 text-sm font-semibold text-gray-700">Changes</th>
                  )}
                  <th className="p-4 text-sm font-semibold text-gray-700">Source / Job</th>
                  <th className="p-4 text-sm font-semibold text-gray-700">Author</th>
                  <th className="p-4 text-sm font-semibold text-gray-700 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {currentList.map((item) => {
                  const isSelected = selectedIds.has(item.id);
                  return (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-blue-50/30 transition-colors ${isSelected ? 'bg-blue-50/50' : ''}`}
                    >
                      <td className="p-4 text-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(item.id)}
                        />
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{item.entity_type}</span>
                          <span className="text-sm font-medium text-gray-900">{item.entity_display}</span>
                          {item.entity_id && <span className="text-[10px] text-gray-400 font-mono">ID: {item.entity_id}</span>}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${getOperationColor(item.operation)}`}>
                          {item.operation}
                        </span>
                      </td>

                      {view === 'fields' ? (
                        <>
                          <td className="p-4 text-sm font-mono text-blue-600 font-medium">
                            {(item as FlatFieldChange).field_name}
                          </td>
                          <td className="p-4 text-sm text-gray-500 truncate max-w-[150px]" title={formatValue((item as FlatFieldChange).old_value)}>
                            {formatValue((item as FlatFieldChange).old_value)}
                          </td>
                          <td className="p-4 text-sm text-gray-900 font-medium truncate max-w-[150px]" title={formatValue((item as FlatFieldChange).new_value)}>
                            {formatValue((item as FlatFieldChange).new_value)}
                          </td>
                        </>
                      ) : (
                        <td className="p-4">
                          <div className="flex flex-wrap gap-1 max-w-[300px]">
                            {(item as FlatChangeset).field_changes.slice(0, 3).map(fc => (
                              <span key={fc.id} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">
                                {fc.field_name}
                              </span>
                            ))}
                            {(item as FlatChangeset).field_changes.length > 3 && (
                              <span className="text-[10px] text-gray-400">
                                +{(item as FlatChangeset).field_changes.length - 3} more
                              </span>
                            )}
                          </div>
                        </td>
                      )}

                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="text-sm text-gray-700">{(item as FlatFieldChange | FlatChangeset).group_label}</span>
                          {item.group_source && (
                            <span className="text-[10px] text-gray-400 uppercase">{item.group_source}</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="text-sm text-gray-700">{formatUserName(item.created_by)}</span>
                          <span className="text-[10px] text-gray-400">{new Date(item.created_at).toLocaleDateString()}</span>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleSingleCommit(item.id)}
                            disabled={isCommitting}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                            title="Commit"
                          >
                            <CheckIcon className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => { /* Implement single reject */ }}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Reject"
                          >
                            <XMarkIcon className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
