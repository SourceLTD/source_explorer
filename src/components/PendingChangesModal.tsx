'use client';

import { useState, useEffect } from 'react';
import {
  XMarkIcon,
  ChevronRightIcon,
  CheckIcon,
  XCircleIcon,
  TrashIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

// Types for the pending changes data
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

interface PendingChangesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

// Helper to format values for display
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// Helper to get entity display name
function getEntityDisplayName(changeset: Changeset): string {
  const snapshot = changeset.before_snapshot || changeset.after_snapshot;
  if (snapshot) {
    const name = snapshot.word || snapshot.name || snapshot.code || snapshot.gloss;
    if (name) return `"${String(name).substring(0, 30)}${String(name).length > 30 ? '...' : ''}"`;
  }
  return changeset.entity_id ? `#${changeset.entity_id}` : 'New';
}

// Helper to get operation badge color
function getOperationColor(operation: string): string {
  switch (operation) {
    case 'create':
      return 'bg-green-100 text-green-800';
    case 'update':
      return 'bg-blue-100 text-blue-800';
    case 'delete':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

// Field Change Row Component
function FieldChangeRow({
  fieldChange,
  onCommit,
  onReject,
  isCommitting,
}: {
  fieldChange: FieldChange;
  onCommit: (id: string) => void;
  onReject: (id: string) => void;
  isCommitting: boolean;
}) {
  const isPending = fieldChange.status === 'pending';
  const isCommitted = fieldChange.status === 'approved'; // 'approved' means committed now
  const isRejected = fieldChange.status === 'rejected';

  return (
    <div className={`flex items-center justify-between py-2 px-3 rounded-xl ${
      isCommitted ? 'bg-green-50' : isRejected ? 'bg-red-50' : 'bg-gray-50'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium text-gray-700">
            {fieldChange.field_name}
          </span>
          {isCommitted && (
            <CheckCircleIcon className="w-4 h-4 text-green-600" />
          )}
          {isRejected && (
            <XCircleIcon className="w-4 h-4 text-red-600" />
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
          <span className="line-through">{formatValue(fieldChange.old_value)}</span>
          <span className="text-gray-400">→</span>
          <span className="text-gray-900 font-medium">{formatValue(fieldChange.new_value)}</span>
        </div>
      </div>
      
      <div className="flex items-center gap-1 ml-2">
        {isPending && !isCommitting && (
          <>
            <button
              onClick={() => onCommit(fieldChange.id)}
              className="p-1 rounded hover:bg-green-100 text-green-600 hover:text-green-800 transition-colors cursor-pointer"
              title="Commit"
            >
              <CheckIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => onReject(fieldChange.id)}
              className="p-1 rounded hover:bg-red-100 text-red-600 hover:text-red-800 transition-colors cursor-pointer"
              title="Reject"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Changeset Component
function ChangesetItem({
  changeset,
  onFieldCommit,
  onFieldReject,
  onCommitAll,
  onRejectAll,
  isCommitting,
}: {
  changeset: Changeset;
  onFieldCommit: (id: string) => void;
  onFieldReject: (id: string) => void;
  onCommitAll: (changesetId: string) => void;
  onRejectAll: (changesetId: string) => void;
  isCommitting: boolean;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const pendingCount = changeset.field_changes.filter(fc => fc.status === 'pending').length;
  const committedCount = changeset.field_changes.filter(fc => fc.status === 'approved').length;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 bg-white hover:bg-gray-50 transition-colors text-left cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <ChevronRightIcon
            className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          />
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getOperationColor(changeset.operation)}`}>
            {changeset.operation.toUpperCase()}
          </span>
          <span className="text-sm font-medium text-gray-900">
            {getEntityDisplayName(changeset)}
          </span>
          <span className="text-xs text-gray-500">
            ({changeset.field_changes.length} field{changeset.field_changes.length !== 1 ? 's' : ''})
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {committedCount > 0 && (
            <span className="text-xs text-green-600 font-medium">
              {committedCount} committed
            </span>
          )}
          {pendingCount > 0 && (
            <span className="text-xs text-gray-500">
              {pendingCount} pending
            </span>
          )}
        </div>
      </button>
      
      {isOpen && (
        <div className="border-t border-gray-200 bg-gray-50 p-3">
          {/* Changeset actions */}
          <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200">
            <div className="text-xs text-gray-500">
              by {changeset.created_by} · {new Date(changeset.created_at).toLocaleString()}
            </div>
            <div className="flex items-center gap-2">
              {pendingCount > 0 && !isCommitting && (
                <>
                  <button
                    onClick={() => onCommitAll(changeset.id)}
                    className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 transition-colors cursor-pointer"
                  >
                    Commit All
                  </button>
                  <button
                    onClick={() => onRejectAll(changeset.id)}
                    className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 transition-colors cursor-pointer"
                  >
                    Reject All
                  </button>
                </>
              )}
            </div>
          </div>
          
          {/* Field changes */}
          <div className="space-y-2">
            {changeset.field_changes.map(fc => (
              <FieldChangeRow
                key={fc.id}
                fieldChange={fc}
                onCommit={onFieldCommit}
                onReject={onFieldReject}
                isCommitting={isCommitting}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Entity Type Section Component
function EntityTypeSection({
  data,
  onFieldCommit,
  onFieldReject,
  onCommitAllInChangeset,
  onRejectAllInChangeset,
  isCommitting,
}: {
  data: ChangesetsByType;
  onFieldCommit: (id: string) => void;
  onFieldReject: (id: string) => void;
  onCommitAllInChangeset: (changesetId: string) => void;
  onRejectAllInChangeset: (changesetId: string) => void;
  isCommitting: boolean;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 bg-gray-100 hover:bg-gray-200 transition-colors text-left cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <ChevronRightIcon
            className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          />
          <span className="text-sm font-semibold text-gray-900 capitalize">
            {data.entity_type.replace('_', ' ')}s
          </span>
          <span className="text-xs text-gray-500">
            ({data.count})
          </span>
        </div>
      </button>
      
      {isOpen && (
        <div className="p-3 space-y-2">
          {data.changesets.map(cs => (
            <ChangesetItem
              key={cs.id}
              changeset={cs}
              onFieldCommit={onFieldCommit}
              onFieldReject={onFieldReject}
              onCommitAll={onCommitAllInChangeset}
              onRejectAll={onRejectAllInChangeset}
              isCommitting={isCommitting}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Changegroup Section Component
function ChangegroupSection({
  changegroup,
  onFieldCommit,
  onFieldReject,
  onCommitAllInChangeset,
  onRejectAllInChangeset,
  onDiscardChangegroup,
  isCommitting,
}: {
  changegroup: Changegroup;
  onFieldCommit: (id: string) => void;
  onFieldReject: (id: string) => void;
  onCommitAllInChangeset: (changesetId: string) => void;
  onRejectAllInChangeset: (changesetId: string) => void;
  onDiscardChangegroup: (changegroupId: string) => void;
  isCommitting: boolean;
}) {
  const [isOpen, setIsOpen] = useState(true);
  
  const totalChangesets = changegroup.changesets_by_type.reduce(
    (sum, et) => sum + et.count,
    0
  );
  
  const totalCommitted = changegroup.changesets_by_type.reduce((sum, et) => {
    return sum + et.changesets.reduce((csSum, cs) => {
      return csSum + cs.field_changes.filter(fc => fc.status === 'approved').length;
    }, 0);
  }, 0);

  const getLabel = () => {
    if (changegroup.label) return changegroup.label;
    if (changegroup.llm_job) return `LLM Job: ${changegroup.llm_job.label || changegroup.llm_job.id}`;
    return `${changegroup.source} changes`;
  };

  return (
    <div className="border-2 border-gray-300 rounded-xl overflow-hidden bg-white shadow-lg">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-white hover:bg-gray-50 transition-colors text-left cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <ChevronRightIcon
            className={`w-5 h-5 text-gray-500 transition-transform ${isOpen ? 'rotate-90' : ''}`}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-gray-900">
                {getLabel()}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                changegroup.source === 'llm_job' ? 'bg-purple-100 text-purple-800' :
                changegroup.source === 'manual' ? 'bg-blue-100 text-blue-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {changegroup.source}
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {totalChangesets} changeset{totalChangesets !== 1 ? 's' : ''} · by {changegroup.created_by}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {totalCommitted > 0 && (
            <span className="text-sm text-green-600 font-medium">
              {totalCommitted} committed
            </span>
          )}
        </div>
      </button>
      
      {isOpen && (
        <div className="border-t border-gray-200 p-4">
          {/* Changegroup actions */}
          <div className="flex items-center justify-end gap-2 mb-4">
            {!isCommitting && (
              <button
                onClick={() => onDiscardChangegroup(changegroup.id)}
                className="text-sm px-3 py-1.5 rounded border border-red-300 text-red-700 hover:bg-red-50 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <TrashIcon className="w-4 h-4" />
                Discard All
              </button>
            )}
          </div>
          
          {/* Entity type sections */}
          <div className="space-y-3">
            {changegroup.changesets_by_type.map(et => (
              <EntityTypeSection
                key={et.entity_type}
                data={et}
                onFieldCommit={onFieldCommit}
                onFieldReject={onFieldReject}
                onCommitAllInChangeset={onCommitAllInChangeset}
                onRejectAllInChangeset={onRejectAllInChangeset}
                isCommitting={isCommitting}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PendingChangesModal({
  isOpen,
  onClose,
  onRefresh,
}: PendingChangesModalProps) {
  const [data, setData] = useState<PendingChangesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // API call helpers
  const updateFieldChangeStatus = async (
    fieldChangeId: string,
    status: 'approved' | 'rejected' | 'pending'
  ) => {
    let changesetId: string | null = null;
    
    if (data) {
      for (const cg of data.changegroups) {
        for (const et of cg.changesets_by_type) {
          for (const cs of et.changesets) {
            if (cs.field_changes.some(fc => fc.id === fieldChangeId)) {
              changesetId = cs.id;
              break;
            }
          }
          if (changesetId) break;
        }
        if (changesetId) break;
      }
      
      if (!changesetId) {
        for (const et of data.ungrouped_changesets_by_type) {
          for (const cs of et.changesets) {
            if (cs.field_changes.some(fc => fc.id === fieldChangeId)) {
              changesetId = cs.id;
              break;
            }
          }
          if (changesetId) break;
        }
      }
    }
    
    if (!changesetId) {
      console.error('Could not find changeset for field change');
      return;
    }

    try {
      const response = await fetch(`/api/changesets/${changesetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_change_id: fieldChangeId,
          status,
          user_id: 'current-user', // TODO: Get from auth context
        }),
      });
      
      if (!response.ok) throw new Error('Failed to update field change');
      
      await fetchData();
    } catch (err) {
      console.error('Error updating field change:', err);
    }
  };

  // Commit a single field change (approve + commit immediately)
  const handleFieldCommit = async (fieldChangeId: string) => {
    setIsCommitting(true);
    try {
      // First approve the field change
      await updateFieldChangeStatus(fieldChangeId, 'approved');
      
      // Find the changeset for this field change and commit it
      let changesetId: string | null = null;
      if (data) {
        for (const cg of data.changegroups) {
          for (const et of cg.changesets_by_type) {
            for (const cs of et.changesets) {
              if (cs.field_changes.some(fc => fc.id === fieldChangeId)) {
                changesetId = cs.id;
                break;
              }
            }
            if (changesetId) break;
          }
          if (changesetId) break;
        }
        
        if (!changesetId) {
          for (const et of data.ungrouped_changesets_by_type) {
            for (const cs of et.changesets) {
              if (cs.field_changes.some(fc => fc.id === fieldChangeId)) {
                changesetId = cs.id;
                break;
              }
            }
            if (changesetId) break;
          }
        }
      }

      if (changesetId) {
        const commitResponse = await fetch(`/api/changesets/${changesetId}/commit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            committed_by: 'current-user',
          }),
        });
        
        if (!commitResponse.ok) {
          const errorData = await commitResponse.json();
          throw new Error(errorData.error || 'Failed to commit');
        }
      }
      
      await fetchData();
      onRefresh?.();
    } catch (err) {
      console.error('Error committing field change:', err);
      setError(err instanceof Error ? err.message : 'Failed to commit');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleFieldReject = (fieldChangeId: string) => {
    updateFieldChangeStatus(fieldChangeId, 'rejected');
  };

  // Commit all field changes in a changeset (approve all + commit)
  const handleCommitAllInChangeset = async (changesetId: string) => {
    setIsCommitting(true);
    try {
      // First approve all
      const approveResponse = await fetch(`/api/changesets/${changesetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve_all',
          user_id: 'current-user',
        }),
      });
      
      if (!approveResponse.ok) throw new Error('Failed to approve all');
      
      // Then commit
      const commitResponse = await fetch(`/api/changesets/${changesetId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          committed_by: 'current-user',
        }),
      });
      
      if (!commitResponse.ok) {
        const errorData = await commitResponse.json();
        throw new Error(errorData.error || 'Failed to commit');
      }
      
      await fetchData();
      onRefresh?.();
    } catch (err) {
      console.error('Error committing all:', err);
      setError(err instanceof Error ? err.message : 'Failed to commit');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleRejectAllInChangeset = async (changesetId: string) => {
    try {
      const response = await fetch(`/api/changesets/${changesetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject_all',
          user_id: 'current-user',
        }),
      });
      
      if (!response.ok) throw new Error('Failed to reject all');
      
      await fetchData();
    } catch (err) {
      console.error('Error rejecting all:', err);
    }
  };

  const handleDiscardChangegroup = async (changegroupId: string) => {
    if (!confirm('Are you sure you want to discard all changes in this group?')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/changegroups/${changegroupId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Failed to discard changegroup');
      
      await fetchData();
      onRefresh?.();
    } catch (err) {
      console.error('Error discarding changegroup:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
      />
      
      <div className="bg-gray-50 rounded-xl shadow-lg w-full max-w-6xl mx-4 max-h-[90vh] overflow-hidden relative z-10 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            Pending Changes
            {data && data.total_pending_changesets > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({data.total_pending_changesets} changeset{data.total_pending_changesets !== 1 ? 's' : ''})
              </span>
            )}
          </h2>
          
          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              disabled={isLoading}
              className="p-2 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
              title="Refresh"
            >
              <ArrowPathIcon className={`w-5 h-5 text-gray-500 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
            >
              <XMarkIcon className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <ArrowPathIcon className="w-8 h-8 text-gray-400 animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600">{error}</p>
              <button
                onClick={fetchData}
                className="mt-4 text-sm text-blue-600 hover:underline cursor-pointer"
              >
                Try again
              </button>
            </div>
          ) : !data || (data.total_pending_changesets === 0) ? (
            <div className="text-center py-12">
              <CheckCircleIcon className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <p className="text-gray-600">No pending changes</p>
              <p className="text-sm text-gray-400 mt-1">All changes have been committed or discarded</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Determine if we should flatten the hierarchy */}
              {(() => {
                const onlyUngrouped = data.changegroups.length === 0 && data.ungrouped_changesets_by_type.length > 0;
                const singleChangegroup = data.changegroups.length === 1 && data.ungrouped_changesets_by_type.length === 0;

                if (singleChangegroup) {
                  // Single changegroup - show entity types directly without wrapper
                  return data.changegroups[0].changesets_by_type.map(et => (
                    <EntityTypeSection
                      key={et.entity_type}
                      data={et}
                      onFieldCommit={handleFieldCommit}
                      onFieldReject={handleFieldReject}
                      onCommitAllInChangeset={handleCommitAllInChangeset}
                      onRejectAllInChangeset={handleRejectAllInChangeset}
                      isCommitting={isCommitting}
                    />
                  ));
                }

                if (onlyUngrouped) {
                  // Only ungrouped changesets - show entity types directly without wrapper
                  return data.ungrouped_changesets_by_type.map(et => (
                    <EntityTypeSection
                      key={et.entity_type}
                      data={et}
                      onFieldCommit={handleFieldCommit}
                      onFieldReject={handleFieldReject}
                      onCommitAllInChangeset={handleCommitAllInChangeset}
                      onRejectAllInChangeset={handleRejectAllInChangeset}
                      isCommitting={isCommitting}
                    />
                  ));
                }

                // Multiple groups - show full hierarchy
                return (
                  <>
                    {/* Changegroups */}
                    {data.changegroups.map(cg => (
                      <ChangegroupSection
                        key={cg.id}
                        changegroup={cg}
                        onFieldCommit={handleFieldCommit}
                        onFieldReject={handleFieldReject}
                        onCommitAllInChangeset={handleCommitAllInChangeset}
                        onRejectAllInChangeset={handleRejectAllInChangeset}
                        onDiscardChangegroup={handleDiscardChangegroup}
                        isCommitting={isCommitting}
                      />
                    ))}
                    
                    {/* Ungrouped changesets */}
                    {data.ungrouped_changesets_by_type.length > 0 && (
                      <div className="border-2 border-gray-300 rounded-xl overflow-hidden bg-white shadow-lg">
                        <div className="p-4 bg-white border-b border-gray-200">
                          <div className="flex items-center gap-2">
                            <span className="text-base font-semibold text-gray-900">
                              Ungrouped Changes
                            </span>
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                              manual
                            </span>
                          </div>
                        </div>
                        <div className="p-4 space-y-3">
                          {data.ungrouped_changesets_by_type.map(et => (
                            <EntityTypeSection
                              key={et.entity_type}
                              data={et}
                              onFieldCommit={handleFieldCommit}
                              onFieldReject={handleFieldReject}
                              onCommitAllInChangeset={handleCommitAllInChangeset}
                              onRejectAllInChangeset={handleRejectAllInChangeset}
                              isCommitting={isCommitting}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-white shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
