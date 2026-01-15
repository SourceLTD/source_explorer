'use client';

import React, { useState, useEffect } from 'react';
import { GraphNode, Frame, RoleType } from '@/lib/types';
import { Mode, OverlaySectionsState, FrameOption } from './types';
import { EditOverlayModal } from './EditOverlayModal';
import { FlagButtons } from './FlagButtons';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { BasicInfoSection } from './BasicInfoSection';
import { LexicalPropertiesSection } from './LexicalPropertiesSection';
import { RelationsSection } from './RelationsSection';
import { FramePropertiesSection } from './FramePropertiesSection';
import { FrameRolesSection } from './FrameRolesSection';
import { useEntryEditor } from '@/hooks/useEntryEditor';
import { useEntryMutations } from '@/hooks/useEntryMutations';
import { PendingEntityBadge } from '@/components/PendingChangeIndicator';
import LoadingSpinner from '@/components/LoadingSpinner';

interface EditOverlayProps {
  node: GraphNode | Frame | null;
  nodeId: string;
  mode: Mode;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => Promise<void>;
}

export function EditOverlay({ node, nodeId, mode, isOpen, onClose, onUpdate }: EditOverlayProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [roleTypes, setRoleTypes] = useState<RoleType[]>([]);
  const [availableFrames, setAvailableFrames] = useState<FrameOption[]>([]);
  const [availableSuperFrames, setAvailableSuperFrames] = useState<FrameOption[]>([]);
  
  // Overlay section expansion state
  const [overlaySections, setOverlaySections] = useState<OverlaySectionsState>({
    basicInfo: true,
    lexicalProperties: false,
    relations: false,
    frameProperties: mode === 'frames',
    frameRoles: false,
  });

  // Use the custom hooks
  const editor = useEntryEditor(node, mode);
  const mutations = useEntryMutations(mode);

  // Fetch role types on mount
  useEffect(() => {
    const fetchRoleTypes = async () => {
      try {
        const response = await fetch('/api/role-types');
        if (response.ok) {
          const data = await response.json();
          setRoleTypes(data);
        }
      } catch (error) {
        console.error('Failed to fetch role types:', error);
      }
    };

    fetchRoleTypes();
  }, []);

  // Fetch frames when overlay opens (lexical units)
  useEffect(() => {
    if (isOpen && (mode === 'lexical_units' || mode === 'verbs' || mode === 'nouns' || mode === 'adjectives' || mode === 'adverbs')) {
      const fetchFrames = async () => {
        try {
          const response = await fetch('/api/frames');
          if (response.ok) {
            const data = await response.json();
            setAvailableFrames(data);
          }
        } catch (error) {
          console.error('Failed to fetch frames:', error);
        }
      };
      fetchFrames();
    }
  }, [isOpen, mode]);

  // Fetch super frames when editing a frame (for changing parent super frame)
  useEffect(() => {
    if (isOpen && mode === 'frames') {
      const fetchSuperFrames = async () => {
        try {
          const response = await fetch('/api/frames/paginated?isSuperFrame=true&limit=500');
          if (response.ok) {
            const data = await response.json();
            // Map the paginated response to FrameOption format
            const superFrames: FrameOption[] = data.data?.map((f: { id: string; label: string; code?: string }) => ({
              id: f.id,
              label: f.label,
              code: f.code,
            })) || [];
            setAvailableSuperFrames(superFrames);
          }
        } catch (error) {
          console.error('Failed to fetch super frames:', error);
        }
      };
      fetchSuperFrames();
    }
  }, [isOpen, mode]);

  // Close edit overlay on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !editor.editingField) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, editor.editingField, onClose]);

  // Helper to compare values for detecting revert-to-original
  const valuesAreEqual = (a: unknown, b: unknown): boolean => {
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;

    const isPlainObject = (v: unknown): v is Record<string, unknown> => {
      if (v === null || typeof v !== 'object') return false;
      const proto = Object.getPrototypeOf(v);
      return proto === Object.prototype || proto === null;
    };

    const normalizeForJson = (v: unknown): unknown => {
      if (v === null || v === undefined) return null;
      if (typeof v === 'bigint') return v.toString();
      if (typeof v === 'number') {
        if (!Number.isFinite(v)) return String(v);
        return v;
      }
      if (typeof v === 'string') {
        // In this system, editing a string field to "" means setting it NULL.
        // Match backend `valuesAreEqual()` semantics for revert-to-original detection.
        if (v === '') return null;
        return v;
      }
      if (typeof v === 'boolean') return v;
      if (v instanceof Date) return v.toISOString();
      if (Array.isArray(v)) return v.map(normalizeForJson);

      const maybeToJson = v as { toJSON?: () => unknown };
      if (!isPlainObject(v) && typeof maybeToJson.toJSON === 'function') {
        try {
          return normalizeForJson(maybeToJson.toJSON());
        } catch {
          // fall through
        }
      }

      const obj = v as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      const out: Record<string, unknown> = {};
      for (const k of keys) out[k] = normalizeForJson(obj[k]);
      return out;
    };

    try {
      return JSON.stringify(normalizeForJson(a)) === JSON.stringify(normalizeForJson(b));
    } catch {
      return false;
    }
  };

  const handleSave = async () => {
    if (!editor.editingField || !node) return;
    
    editor.setIsSaving(true);
    try {
      // Handle code changes
      if (editor.editingField === 'code') {
        editor.setCodeValidationMessage('Finding unique code...');
        const newId = await mutations.updateCode(node.id, editor.editValue);
        editor.setCodeValidationMessage(`✓ Code updated to ${newId}`);
        await onUpdate();
        editor.cancelEditing();
        editor.setCodeValidationMessage('');
        return;
      }

      // Handle hypernym changes
      if (editor.editingField === 'hypernym') {
        if (!editor.editValue) {
          throw new Error('Please select a new hypernym');
        }

        editor.setCodeValidationMessage('Updating relations...');
        // Type guard: only GraphNode has parents property
        const oldHypernym = 'parents' in node ? node.parents[0]?.id : undefined;
        const newHypernym = editor.editValue;
        const hyponymsToMove = Array.from(editor.selectedHyponymsToMove);
        const hyponymsToStay = 'children' in node 
          ? node.children.map(c => c.id).filter(id => !editor.selectedHyponymsToMove.has(id))
          : [];

        await mutations.updateHypernym(node.id, oldHypernym, newHypernym, hyponymsToMove, hyponymsToStay);
        
        editor.setCodeValidationMessage('✓ Hypernym updated successfully');
        await onUpdate();
        editor.cancelEditing();
        editor.setCodeValidationMessage('');
        return;
      }

      // Handle frame_roles
      if (editor.editingField === 'frame_roles') {
        await mutations.updateFrameRoles(node.id, editor.editFrameRoles);
        editor.setCodeValidationMessage('✓ Frame roles updated successfully');
        await onUpdate();
        editor.cancelEditing();
        editor.setCodeValidationMessage('');
        return;
      }

      // Handle other fields
      let value: unknown;
      let fieldName: string = editor.editingField;
      
      switch (editor.editingField) {
        case 'src_lemmas':
          value = editor.editListItems.filter(s => s.trim());
          break;
        case 'gloss':
          value = editor.editValue.trim();
          break;
        case 'examples':
          value = editor.editListItems.filter(s => s.trim());
          break;
        case 'vendler_class':
          value = editor.editValue || null;
          break;
        case 'lexfile':
          value = editor.editValue;
          break;
        case 'frame':
          // Map 'frame' to 'frame_id' for API
          fieldName = 'frame_id';
          value = editor.editValue || null;
          break;
        case 'label':
          value = editor.editValue.trim();
          break;
        case 'definition':
          {
            const trimmed = editor.editValue.trim();
            value = trimmed.length > 0 ? trimmed : null;
          }
          break;
        case 'short_definition':
          {
            const trimmed = editor.editValue.trim();
            value = trimmed.length > 0 ? trimmed : null;
          }
          break;
        case 'super_frame_id':
          value = editor.editValue || null;
          break;
        default:
          return;
      }
      
      // Check if there's a pending change for this field and if we're reverting to original
      const pendingField = node.pending?.pending_fields?.[fieldName];
      if (pendingField) {
        const originalValue = pendingField.old_value;
        if (valuesAreEqual(value, originalValue)) {
          // User is reverting to original - delete the pending change instead of creating new one
          await mutations.deleteFieldChange(pendingField.field_change_id);
          editor.setCodeValidationMessage('✓ Change reverted');
          await onUpdate();
          editor.cancelEditing();
          editor.setCodeValidationMessage('');
          return;
        }
      }
      
      await mutations.updateField(node.id, fieldName, value);
      
      editor.setCodeValidationMessage('✓ Changes saved successfully');
      await onUpdate();
      editor.cancelEditing();
      editor.setCodeValidationMessage('');
    } catch (err) {
      console.error('Error saving changes:', err);
      editor.setCodeValidationMessage('');
    } finally {
      editor.setIsSaving(false);
    }
  };

  const handleFlagToggle = async () => {
    if (!node) return;
    setIsUpdating(true);
    try {
      await mutations.toggleFlag(node.id, node.flagged ?? false);
      await onUpdate();
    } catch (err) {
      console.error('Error toggling flag:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleVerifiableToggle = async () => {
    if (!node) return;
    setIsUpdating(true);
    try {
      await mutations.toggleVerifiable(node.id, node.verifiable ?? true);
      await onUpdate();
    } catch (err) {
      console.error('Error toggling verifiable:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!node) return;
    setIsDeleting(true);
    try {
      await mutations.deleteEntry(node.id);
      setShowDeleteConfirm(false);
      // Trigger table refresh before closing
      await onUpdate();
      onClose();
    } catch (error) {
      console.error('Error deleting entry:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const showSpinner = !node || editor.isSaving || isUpdating;
  const loadingLabel = !node ? 'Loading details...' : (editor.isSaving ? 'Saving changes...' : 'Updating...');

  if (!isOpen) return null;

  return (
    <EditOverlayModal
      isOpen={isOpen}
      onClose={() => {
        if (!editor.editingField && !editor.isSaving && !isUpdating) {
          onClose();
        }
      }}
      nodeId={node?.id || nodeId}
      validationMessage={editor.codeValidationMessage && !editor.isSaving ? editor.codeValidationMessage : ''}
      onDelete={() => setShowDeleteConfirm(true)}
    >
      {showSpinner ? (
        <LoadingSpinner size="page" label={loadingLabel} className="p-12" />
      ) : (
        <>
          {/* Pending Changes Indicator */}
          {node.pending && (
            <div className={`mb-4 p-3 rounded-lg ${
              node.pending.operation === 'create' 
                ? 'bg-gradient-to-r from-green-50 to-green-100 border border-green-200'
                : node.pending.operation === 'delete'
                ? 'bg-gradient-to-r from-red-50 to-red-100 border border-red-200'
                : 'bg-gradient-to-r from-orange-50 to-orange-100 border border-orange-200'
            }`}>
              <div className="flex items-center gap-3">
                <PendingEntityBadge pending={node.pending} size="md" />
                <div className={`text-sm ${
                  node.pending.operation === 'create' ? 'text-green-800' :
                  node.pending.operation === 'delete' ? 'text-red-800' : 'text-orange-800'
                }`}>
                  {node.pending.operation === 'delete' ? (
                    <span className="font-medium">pending</span>
                  ) : (
                    <>
                      <span className="font-medium">
                        {Object.keys(node.pending.pending_fields).length} field{Object.keys(node.pending.pending_fields).length !== 1 ? 's' : ''} pending
                      </span>
                      <span className={`ml-2 ${
                        node.pending.operation === 'create' ? 'text-green-600' : 'text-orange-600'
                      }`}>
                        ({Object.keys(node.pending.pending_fields).join(', ')})
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Flagging Section */}
          <FlagButtons
            flagged={node.flagged ?? false}
            verifiable={node.verifiable ?? true}
            onFlagToggle={handleFlagToggle}
            onVerifiableToggle={handleVerifiableToggle}
          />

          {/* Basic Info Section (for non-frame modes) */}
          {mode !== 'frames' && 'gloss' in node && (
            <BasicInfoSection
              node={node as GraphNode}
              mode={mode}
              editingField={editor.editingField}
              editValue={editor.editValue}
              editListItems={editor.editListItems}
              codeValidationMessage={editor.codeValidationMessage}
              isOpen={overlaySections.basicInfo}
              onToggle={() => setOverlaySections(prev => ({ ...prev, basicInfo: !prev.basicInfo }))}
              onStartEdit={editor.startEditing}
              onValueChange={editor.setEditValue}
              onListItemChange={editor.updateListItem}
              onListItemAdd={editor.addListItem}
              onListItemRemove={editor.removeListItem}
              onSave={handleSave}
              onCancel={editor.cancelEditing}
              isSaving={editor.isSaving}
              pending={node.pending}
            />
          )}

          {/* Frame Properties Section (for frames mode) */}
          {mode === 'frames' && 'label' in node && (
            <FramePropertiesSection
              frame={node as Frame}
              editingField={editor.editingField}
              editValue={editor.editValue}
              isOpen={overlaySections.frameProperties}
              onToggle={() => setOverlaySections(prev => ({ ...prev, frameProperties: !prev.frameProperties }))}
              onStartEdit={editor.startEditing}
              onValueChange={editor.setEditValue}
              onSave={handleSave}
              onCancel={editor.cancelEditing}
              isSaving={editor.isSaving}
              pending={node.pending}
              availableSuperFrames={availableSuperFrames}
            />
          )}

          {/* Lexical Properties Section (for non-frame modes) */}
          {mode !== 'frames' && 'gloss' in node && (
            <LexicalPropertiesSection
              node={node as GraphNode}
              mode={mode}
              editingField={editor.editingField}
              editValue={editor.editValue}
              availableFrames={availableFrames}
              isOpen={overlaySections.lexicalProperties}
              onToggle={() => setOverlaySections(prev => ({ ...prev, lexicalProperties: !prev.lexicalProperties }))}
              onStartEdit={editor.startEditing}
              onValueChange={editor.setEditValue}
              onSave={handleSave}
              onCancel={editor.cancelEditing}
              isSaving={editor.isSaving}
              pending={node.pending}
            />
          )}

          {/* Frame Roles Section (Frames only) */}
          {mode === 'frames' && 'label' in node && (
            <FrameRolesSection
              frame={node as Frame}
              editingField={editor.editingField}
              editFrameRoles={editor.editFrameRoles}
              roleTypes={roleTypes}
              isOpen={overlaySections.frameRoles}
              onToggle={() => setOverlaySections(prev => ({ ...prev, frameRoles: !prev.frameRoles }))}
              onStartEdit={editor.startEditing}
              onFrameRoleChange={editor.updateFrameRole}
              onFrameRoleAdd={editor.addFrameRole}
              onFrameRoleRemove={editor.removeFrameRole}
              onSave={handleSave}
              onCancel={editor.cancelEditing}
              isSaving={editor.isSaving}
              isSuperFrame={!(node as Frame).super_frame_id}
            />
          )}

          {/* Relations Section (non-frames only) */}
          {mode !== 'frames' && 'gloss' in node && (
            <RelationsSection
              node={node as GraphNode}
              mode={mode}
              editingField={editor.editingField}
              editValue={editor.editValue}
              selectedHyponymsToMove={editor.selectedHyponymsToMove}
              codeValidationMessage={editor.codeValidationMessage}
              isOpen={overlaySections.relations}
              onToggle={() => setOverlaySections(prev => ({ ...prev, relations: !prev.relations }))}
              onStartEdit={editor.startEditing}
              onValueChange={editor.setEditValue}
              onHyponymToggle={editor.toggleHyponymSelection}
              onSave={handleSave}
              onCancel={editor.cancelEditing}
              isSaving={editor.isSaving}
            />
          )}

          {/* Delete Confirmation Dialog */}
          <DeleteConfirmDialog
            node={node}
            isOpen={showDeleteConfirm}
            isDeleting={isDeleting}
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        </>
      )}
    </EditOverlayModal>
  );
}

