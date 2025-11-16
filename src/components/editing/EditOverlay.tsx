'use client';

import React, { useState, useEffect } from 'react';
import { GraphNode, RoleType } from '@/lib/types';
import { Mode, OverlaySectionsState, FrameOption } from './types';
import { EditOverlayModal } from './EditOverlayModal';
import { ModerationButtons } from './ModerationButtons';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { BasicInfoSection } from './BasicInfoSection';
import { VerbPropertiesSection } from './VerbPropertiesSection';
import { RolesSection } from './RolesSection';
import { LegalConstraintsSection } from './LegalConstraintsSection';
import { RelationsSection } from './RelationsSection';
import { useEntryEditor } from '@/hooks/useEntryEditor';
import { useEntryMutations } from '@/hooks/useEntryMutations';

interface EditOverlayProps {
  node: GraphNode;
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
        const oldHypernym = node.parents[0]?.id;
        const newHypernym = editor.editValue;
        const hyponymsToMove = Array.from(editor.selectedHyponymsToMove);
        const hyponymsToStay = node.children
          .map(c => c.id)
          .filter(id => !editor.selectedHyponymsToMove.has(id));

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

      // Handle other fields
      let value: unknown;
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
          value = editor.editValue || null;
          break;
        default:
          return;
      }
      
      await mutations.updateField(node.id, editor.editingField, value);
      
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

      {/* Basic Info Section */}
      <BasicInfoSection
        node={node}
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

      {/* Verb Properties Section */}
      {mode === 'verbs' && (
        <VerbPropertiesSection
          node={node}
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
      {mode === 'verbs' && (
        <RolesSection
          node={node}
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

      {/* Legal Constraints Section */}
      <LegalConstraintsSection
        node={node}
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

      {/* Relations Section */}
      <RelationsSection
        node={node}
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

