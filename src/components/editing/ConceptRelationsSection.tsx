'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Frame } from '@/lib/types';
import { OverlaySection } from './OverlaySection';
import { FrameSearchSelector } from './FrameSearchSelector';
import LoadingSpinner from '@/components/LoadingSpinner';
import { refreshPendingChangesCount } from '@/hooks/usePendingChangesCount';

interface FrameRelation {
  type: string;
  direction: 'incoming' | 'outgoing';
  source?: { id: string; label: string; short_definition?: string | null };
  target?: { id: string; label: string; short_definition?: string | null };
}

interface PendingRelationChange {
  changeset_id: string;
  operation: 'create' | 'delete';
  source_id: string;
  target_id: string;
  type: string;
  target_label?: string;
  target_short_definition?: string | null;
}

interface FrameRelationsSectionProps {
  frame: Frame;
  isOpen: boolean;
  onToggle: () => void;
  onUpdate: () => Promise<void>;
}

export function FrameRelationsSection({
  frame,
  isOpen,
  onToggle,
  onUpdate,
}: FrameRelationsSectionProps) {
  const [relations, setRelations] = useState<FrameRelation[]>([]);
  const [pendingRelChanges, setPendingRelChanges] = useState<PendingRelationChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchRelations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/frames/${frame.id}/graph`);
      if (!res.ok) return;
      const data = await res.json();
      setRelations(data.relations ?? []);
      setPendingRelChanges(data.pendingRelationChanges ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [frame.id]);

  useEffect(() => {
    if (isOpen) {
      void fetchRelations();
    }
  }, [isOpen, fetchRelations]);

  const parents = relations.filter(
    r => r.direction === 'incoming' && r.type === 'parent_of' && r.source
  );

  const children = relations.filter(
    r => r.direction === 'outgoing' && r.type === 'parent_of' && r.target
  );

  const pendingDeletes = pendingRelChanges.filter(
    p => p.operation === 'delete' && p.type === 'parent_of'
  );
  const pendingCreates = pendingRelChanges.filter(
    p => p.operation === 'create' && p.type === 'parent_of'
  );

  const handleSave = async () => {
    if (!selectedParentId) return;
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await fetch(`/api/frames/${frame.id}/reparent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newParentId: selectedParentId,
          userId: 'user',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to stage reparent');
      }

      const data = await res.json();
      setSuccessMessage(data.message);
      setIsEditing(false);
      setSelectedParentId('');
      refreshPendingChangesCount();
      await fetchRelations();
      await onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stage reparent');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setSelectedParentId('');
    setError(null);
    setSuccessMessage(null);
  };

  const isParentPendingDelete = (parentId: string) =>
    pendingDeletes.some(p => p.source_id === frame.id && p.target_id === parentId);

  return (
    <OverlaySection
      title="Inheritance (DAG)"
      icon={
        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      }
      isOpen={isOpen}
      onToggle={onToggle}
    >
      {loading ? (
        <LoadingSpinner size="sm" noPadding />
      ) : (
        <>
          {/* Parents */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-700">
                Inherits From
                {pendingDeletes.length > 0 || pendingCreates.length > 0 ? (
                  <span className="ml-2 text-xs text-orange-600 font-normal">(pending changes)</span>
                ) : null}
              </h3>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                >
                  Change Parent
                </button>
              )}
            </div>

            {parents.length === 0 && pendingCreates.length === 0 ? (
              <div className="text-sm text-gray-500 italic">No parent frames (root frame)</div>
            ) : (
              <div className="space-y-1.5">
                {parents.map(rel => {
                  const parentId = rel.target!.id;
                  const isPendingDel = isParentPendingDelete(parentId);
                  return (
                    <div
                      key={parentId}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                        isPendingDel
                          ? 'border-red-200 bg-red-50 line-through text-red-600'
                          : 'border-gray-200 bg-gray-50 text-gray-900'
                      }`}
                    >
                      <span className="font-medium">{rel.target!.label}</span>
                      <span className="text-xs text-gray-400">#{parentId}</span>
                      {isPendingDel && (
                        <span className="ml-auto text-xs text-red-500 font-medium">removing</span>
                      )}
                    </div>
                  );
                })}
                {pendingCreates.map(pc => (
                  <div
                    key={pc.changeset_id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-green-200 bg-green-50 text-sm text-green-800"
                  >
                    <span className="font-medium">{pc.target_label || `#${pc.target_id}`}</span>
                    <span className="text-xs text-green-500">#{pc.target_id}</span>
                    <span className="ml-auto text-xs text-green-600 font-medium">pending</span>
                  </div>
                ))}
              </div>
            )}

            {isEditing && (
              <div className="mt-3">
                <FrameSearchSelector
                  value={selectedParentId}
                  onChange={setSelectedParentId}
                  onSave={handleSave}
                  onCancel={handleCancel}
                  isSaving={isSaving}
                  placeholder="Search for new parent frame..."
                />
              </div>
            )}

            {error && (
              <div className="mt-2 text-sm text-red-600">{error}</div>
            )}
            {successMessage && (
              <div className="mt-2 text-sm text-green-600">{successMessage}</div>
            )}
          </div>

          {/* Children */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Inherited By
              <span className="ml-1 text-xs text-gray-400 font-normal">({children.length})</span>
            </h3>
            {children.length === 0 ? (
              <div className="text-sm text-gray-500 italic">No child frames</div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {children.map(rel => (
                  <div
                    key={rel.source!.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm"
                  >
                    <span className="font-medium text-gray-900">{rel.source!.label}</span>
                    <span className="text-xs text-gray-400">#{rel.source!.id}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </OverlaySection>
  );
}
