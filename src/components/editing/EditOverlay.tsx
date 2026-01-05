'use client';

import React, { useState, useEffect } from 'react';
import { GraphNode, Frame, RoleType } from '@/lib/types';
import { Mode, OverlaySectionsState, FrameOption } from './types';
import { EditOverlayModal } from './EditOverlayModal';
import { ModerationButtons } from './ModerationButtons';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { BasicInfoSection } from './BasicInfoSection';
import { VerbPropertiesSection } from './VerbPropertiesSection';
import { RolesSection } from './RolesSection';
import { LegalConstraintsSection } from './LegalConstraintsSection';
import { RelationsSection } from './RelationsSection';
import { FramePropertiesSection } from './FramePropertiesSection';
import { FrameRolesSection } from './FrameRolesSection';
import { useEntryEditor } from '@/hooks/useEntryEditor';
import { useEntryMutations } from '@/hooks/useEntryMutations';

interface EditOverlayProps {
  node: GraphNode | Frame;
  mode: Mode;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => Promise<void>;
}

export function EditOverlay({ node, mode, isOpen, onClose, onUpdate }: EditOverlayProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [roleTypes, setRoleTypes] = useState<RoleType[]>([]);
  const [availableFrames, setAvailableFrames] = useState<FrameOption[]>([]);
  
  // Overlay section expansion state
  const [overlaySections, setOverlaySections] = useState<OverlaySectionsState>({
    basicInfo: true,
    verbProperties: false,
    roles: false,
    legalConstraints: false,
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

  // Fetch frames when overlay opens (verbs only)
  useEffect(() => {
    if (isOpen && mode === 'verbs') {
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

  const handleSave = async () => {
    if (!editor.editingField) return;
    
    editor.setIsSaving(true);
    try {
      // Handle code changes
      if (editor.editingField === 'code') {
        editor.setCodeValidationMessage('Finding unique code...');
        const newId = await mutations.updateCode(node.id, editor.editValue);
        editor.setCodeValidationMessage(`✓ Code updated to ${newId}`);
        editor.cancelEditing();
        setTimeout(async () => {
          editor.setCodeValidationMessage('');
          await onUpdate();
        }, 1000);
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
        editor.cancelEditing();
        setTimeout(async () => {
          editor.setCodeValidationMessage('');
          await onUpdate();
        }, 1000);
        return;
      }

      // Handle roles
      if (editor.editingField === 'roles') {
        await mutations.updateRoles(node.id, editor.editRoles, editor.editRoleGroups);
        editor.setCodeValidationMessage('✓ Roles updated successfully');
        editor.cancelEditing();
        setTimeout(async () => {
          editor.setCodeValidationMessage('');
          await onUpdate();
        }, 1000);
        return;
      }

      // Handle frame_roles
      if (editor.editingField === 'frame_roles') {
        await mutations.updateFrameRoles(node.id, editor.editFrameRoles);
        editor.setCodeValidationMessage('✓ Frame roles updated successfully');
        editor.cancelEditing();
        setTimeout(async () => {
          editor.setCodeValidationMessage('');
          await onUpdate();
        }, 1000);
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
        case 'legal_constraints':
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
        case 'frame_name':
          value = editor.editValue.trim();
          break;
        case 'definition':
          value = editor.editValue.trim();
          break;
        case 'short_definition':
          value = editor.editValue.trim();
          break;
        case 'prototypical_synset':
          value = editor.editValue.trim();
          break;
        default:
          return;
      }
      
      await mutations.updateField(node.id, fieldName, value);
      
      editor.setCodeValidationMessage('✓ Changes saved successfully');
      editor.cancelEditing();
      setTimeout(async () => {
        editor.setCodeValidationMessage('');
        await onUpdate();
      }, 1000);
    } catch (err) {
      console.error('Error saving changes:', err);
      editor.setCodeValidationMessage('');
    } finally {
      editor.setIsSaving(false);
    }
  };

  const handleFlagToggle = async () => {
    try {
      await mutations.toggleFlag(node.id, node.flagged ?? false);
      await onUpdate();
    } catch (err) {
      console.error('Error toggling flag:', err);
    }
  };

  const handleForbidToggle = async () => {
    try {
      await mutations.toggleForbidden(node.id, node.forbidden ?? false);
      await onUpdate();
    } catch (err) {
      console.error('Error toggling forbidden:', err);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await mutations.deleteEntry(node.id);
      setShowDeleteConfirm(false);
      onClose();
      // Parent component will handle navigation after deletion
    } catch (error) {
      console.error('Error deleting entry:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <EditOverlayModal
      isOpen={isOpen}
      onClose={() => {
        if (!editor.editingField) {
          onClose();
        }
      }}
      nodeId={node.id}
      validationMessage={editor.codeValidationMessage && !editor.isSaving ? editor.codeValidationMessage : ''}
      onDelete={() => setShowDeleteConfirm(true)}
    >
      {/* Moderation Section */}
      <ModerationButtons
        flagged={node.flagged ?? false}
        forbidden={node.forbidden ?? false}
        onFlagToggle={handleFlagToggle}
        onForbidToggle={handleForbidToggle}
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
        />
      )}

      {/* Frame Properties Section (for frames mode) */}
      {mode === 'frames' && 'frame_name' in node && (
        <FramePropertiesSection
          frame={node as Frame}
          editingField={editor.editingField}
          editValue={editor.editValue}
          codeValidationMessage={editor.codeValidationMessage}
          isOpen={overlaySections.frameProperties}
          onToggle={() => setOverlaySections(prev => ({ ...prev, frameProperties: !prev.frameProperties }))}
          onStartEdit={editor.startEditing}
          onValueChange={editor.setEditValue}
          onSave={handleSave}
          onCancel={editor.cancelEditing}
          isSaving={editor.isSaving}
        />
      )}

      {/* Verb Properties Section */}
      {mode === 'verbs' && 'gloss' in node && (
        <VerbPropertiesSection
          node={node as GraphNode}
          editingField={editor.editingField}
          editValue={editor.editValue}
          availableFrames={availableFrames}
          isOpen={overlaySections.verbProperties}
          onToggle={() => setOverlaySections(prev => ({ ...prev, verbProperties: !prev.verbProperties }))}
          onStartEdit={editor.startEditing}
          onValueChange={editor.setEditValue}
          onSave={handleSave}
          onCancel={editor.cancelEditing}
          isSaving={editor.isSaving}
        />
      )}

      {/* Roles Section (Verbs only) */}
      {mode === 'verbs' && 'gloss' in node && (
        <RolesSection
          node={node as GraphNode}
          editingField={editor.editingField}
          editRoles={editor.editRoles}
          editRoleGroups={editor.editRoleGroups}
          roleTypes={roleTypes}
          isOpen={overlaySections.roles}
          onToggle={() => setOverlaySections(prev => ({ ...prev, roles: !prev.roles }))}
          onStartEdit={editor.startEditing}
          onRoleChange={editor.updateRole}
          onRoleAdd={editor.addRole}
          onRoleRemove={editor.removeRole}
          onRoleGroupAdd={editor.addRoleGroup}
          onRoleGroupRemove={editor.removeRoleGroup}
          onRoleGroupChange={editor.updateRoleGroup}
          onToggleRoleInGroup={editor.toggleRoleInGroup}
          onSave={handleSave}
          onCancel={editor.cancelEditing}
          isSaving={editor.isSaving}
        />
      )}

      {/* Frame Roles Section (Frames only) */}
      {mode === 'frames' && 'frame_name' in node && (
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
        />
      )}

      {/* Legal Constraints Section (non-frames only) */}
      {mode !== 'frames' && 'gloss' in node && (
        <LegalConstraintsSection
          node={node as GraphNode}
          editingField={editor.editingField}
          editListItems={editor.editListItems}
          isOpen={overlaySections.legalConstraints}
          onToggle={() => setOverlaySections(prev => ({ ...prev, legalConstraints: !prev.legalConstraints }))}
          onStartEdit={editor.startEditing}
          onListItemChange={editor.updateListItem}
          onListItemAdd={editor.addListItem}
          onListItemRemove={editor.removeListItem}
          onSave={handleSave}
          onCancel={editor.cancelEditing}
          isSaving={editor.isSaving}
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
    </EditOverlayModal>
  );
}

