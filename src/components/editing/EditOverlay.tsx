'use client';

import React, { useState, useEffect } from 'react';
import { GraphNode, Concept } from '@/lib/types';
import { Mode, OverlaySectionsState, ConceptOption } from './types';
import { EditOverlayModal } from './EditOverlayModal';
import { FlagButtons } from './FlagButtons';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { BasicInfoSection } from './BasicInfoSection';
import { LexicalPropertiesSection } from './LexicalPropertiesSection';
import { RelationsSection } from './RelationsSection';
import { ConceptPropertiesSection } from './ConceptPropertiesSection';
import { PropertiesSection } from './PropertiesSection';
import { ConceptRelationsSection } from './ConceptRelationsSection';
import { AIRemediationPanel } from './AIRemediationPanel';
import { useEntryEditor } from '@/hooks/useEntryEditor';
import { useEntryMutations } from '@/hooks/useEntryMutations';
import { PendingEntityBadge } from '@/components/PendingChangeIndicator';
import LoadingSpinner from '@/components/LoadingSpinner';
import ClassifierGuidanceModal from '@/components/ClassifierGuidanceModal';

type EditTab = 'ai' | 'manual';

interface EditOverlayProps {
  node: GraphNode | Concept | null;
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
  const [availableConcepts, setAvailableConcepts] = useState<ConceptOption[]>([]);
  const [activeTab, setActiveTab] = useState<EditTab>('ai');
  const [classifierGuidanceOpen, setClassifierGuidanceOpen] = useState(false);
  
  // Overlay section expansion state
  const [overlaySections, setOverlaySections] = useState<OverlaySectionsState>({
    basicInfo: true,
    lexicalProperties: false,
    relations: false,
    conceptProperties: mode === 'concepts',
    properties: false,
    conceptRelations: false,
  });

  // Use the custom hooks
  const editor = useEntryEditor(node, mode);
  const mutations = useEntryMutations(mode);

  // Fetch concepts when overlay opens (lexical units)
  useEffect(() => {
    if (isOpen && (mode === 'lexical_units' || mode === 'verbs' || mode === 'nouns' || mode === 'adjectives' || mode === 'adverbs')) {
      const fetchConcepts = async () => {
        try {
          const response = await fetch('/api/concepts');
          if (response.ok) {
            const data = await response.json();
            setAvailableConcepts(data);
          }
        } catch (error) {
          console.error('Failed to fetch concepts:', error);
        }
      };
      fetchConcepts();
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

      // Handle properties
      if (editor.editingField === 'properties') {
        await mutations.updateProperties(node.id, editor.editProperties);
        editor.setCodeValidationMessage('✓ Properties updated successfully');
        await onUpdate();
        editor.cancelEditing();
        editor.setCodeValidationMessage('');
        return;
      }

      // Handle other fields
      let value: unknown;
      const fieldName: string = editor.editingField;
      
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
        case 'concept':
          editor.setCodeValidationMessage(
            'Concept assignment moved to senses. Use the sense editor.'
          );
          editor.cancelEditing();
          editor.setCodeValidationMessage('');
          return;
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
        case 'subtype':
          {
            const trimmed = editor.editValue.trim();
            value = trimmed.length > 0 ? trimmed : null;
          }
          break;
        case 'archetype':
          {
            const trimmed = editor.editValue.trim();
            value = trimmed.length > 0 ? trimmed : null;
          }
          break;
        case 'state_kind':
          {
            const trimmed = editor.editValue.trim();
            value = trimmed.length > 0 ? trimmed : null;
          }
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
    <>
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

          {/* Tab Bar (concepts mode only) */}
          {mode === 'concepts' && (
            <div className="flex border-b border-gray-200 mb-5 mt-1 mx-1">
              <button
                onClick={() => setActiveTab('ai')}
                className={`px-5 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === 'ai'
                    ? 'text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                AI Mode
                {activeTab === 'ai' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
                )}
              </button>
              <button
                onClick={() => setActiveTab('manual')}
                className={`px-5 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === 'manual'
                    ? 'text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Manual Mode
                {activeTab === 'manual' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />
                )}
              </button>
            </div>
          )}

          {/* AI Remediation Panel (concepts mode, AI tab) */}
          {mode === 'concepts' && activeTab === 'ai' && 'label' in node && (
            <div className="px-2 pb-4">
              <AIRemediationPanel
                concept={node as Concept}
                onUpdate={onUpdate}
              />
            </div>
          )}

          {/* Manual editing content (non-concepts always show; concepts only on manual tab) */}
          {(mode !== 'concepts' || activeTab === 'manual') && (
            <>
              {/* Flagging Section */}
              <FlagButtons
            flagged={node.flagged ?? false}
            verifiable={node.verifiable ?? true}
            onFlagToggle={handleFlagToggle}
            onVerifiableToggle={handleVerifiableToggle}
          />

          {/* Basic Info Section (for non-concept modes) */}
          {mode !== 'concepts' && 'gloss' in node && (
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

          {/* Concept Properties Section (for concepts mode) */}
          {mode === 'concepts' && 'label' in node && (
            <ConceptPropertiesSection
              concept={node as Concept}
              editingField={editor.editingField}
              editValue={editor.editValue}
              isOpen={overlaySections.conceptProperties}
              onToggle={() => setOverlaySections(prev => ({ ...prev, conceptProperties: !prev.conceptProperties }))}
              onStartEdit={editor.startEditing}
              onValueChange={editor.setEditValue}
              onSave={handleSave}
              onCancel={editor.cancelEditing}
              isSaving={editor.isSaving}
              pending={node.pending}
              onToggleDisableHealthcheck={async (next) => {
                await mutations.updateField(node.id, 'disable_healthcheck', next);
                await onUpdate();
              }}
              onShowClassifierGuidance={
                (node as Concept).classifier_guidance
                  ? () => setClassifierGuidanceOpen(true)
                  : undefined
              }
            />
          )}

          {/* Lexical Properties Section (for non-concept modes) */}
          {mode !== 'concepts' && 'gloss' in node && (
            <LexicalPropertiesSection
              node={node as GraphNode}
              mode={mode}
              editingField={editor.editingField}
              editValue={editor.editValue}
              availableFrames={availableConcepts}
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

          {/* Properties Section (Concepts only) */}
          {mode === 'concepts' && 'label' in node && (
            <PropertiesSection
              concept={node as Concept}
              editingField={editor.editingField}
              editProperties={editor.editProperties}
              isOpen={overlaySections.properties}
              onToggle={() => setOverlaySections(prev => ({ ...prev, properties: !prev.properties }))}
              onStartEdit={editor.startEditing}
              onPropertyChange={editor.updateProperty}
              onPropertyAdd={editor.addProperty}
              onPropertyRemove={editor.removeProperty}
              onSave={handleSave}
              onCancel={editor.cancelEditing}
              isSaving={editor.isSaving}
            />
          )}

          {/* Concept Relations Section (Concepts only) */}
          {mode === 'concepts' && 'label' in node && (
            <ConceptRelationsSection
              concept={node as Concept}
              isOpen={overlaySections.conceptRelations}
              onToggle={() => setOverlaySections(prev => ({ ...prev, conceptRelations: !prev.conceptRelations }))}
              onUpdate={onUpdate}
            />
          )}

          {/* Relations Section (non-concepts only) */}
          {mode !== 'concepts' && 'gloss' in node && (
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
            </>
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

      {classifierGuidanceOpen && node && 'classifier_guidance' in node && (node as Concept).classifier_guidance && (
        <ClassifierGuidanceModal
          label={(node as Concept).label}
          guidance={(node as Concept).classifier_guidance!}
          onClose={() => setClassifierGuidanceOpen(false)}
        />
      )}
    </>
  );
}

