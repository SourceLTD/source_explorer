import React from 'react';
import { GraphNode, PendingChangeInfo } from '@/lib/types';
import { Mode, EditableField, FrameOption } from './types';
import { OverlaySection } from './OverlaySection';
import { VendlerClassSelector } from './VendlerClassSelector';
import { FrameSelector } from './FrameSelector';
import { LexfileSelector } from './LexfileSelector';
import { PendingFieldIndicator } from '@/components/PendingChangeIndicator';

interface LexicalPropertiesSectionProps {
  node: GraphNode;
  mode: Mode;
  editingField: EditableField | null;
  editValue: string;
  availableFrames: FrameOption[];
  isOpen: boolean;
  onToggle: () => void;
  onStartEdit: (field: EditableField) => void;
  onValueChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  pending?: PendingChangeInfo | null;
}

export function LexicalPropertiesSection({
  node,
  mode,
  editingField,
  editValue,
  availableFrames,
  isOpen,
  onToggle,
  onStartEdit,
  onValueChange,
  onSave,
  onCancel,
  isSaving,
  pending
}: LexicalPropertiesSectionProps) {
  // Helper to check if a field has pending changes
  const hasPendingField = (fieldName: string) => {
    return !!pending?.pending_fields?.[fieldName];
  };

  // Helper to get the display value for a field (pending new_value if exists, otherwise current value)
  const getDisplayValue = <T,>(fieldName: string, currentValue: T): T => {
    const pendingField = pending?.pending_fields?.[fieldName];
    if (pendingField) {
      return pendingField.new_value as T;
    }
    return currentValue;
  };

  // Helper to get frame label from frame_id (handles pending changes)
  const getFrameLabel = (): string | null => {
    const frameId = getDisplayValue('frame_id', node.frame_id);
    if (!frameId) return null;
    
    // If there's a pending change, look up from availableFrames
    if (hasPendingField('frame_id')) {
      const frame = availableFrames.find(f => f.id === frameId);
      return frame?.label ?? null;
    }
    
    // Otherwise use the current node's frame label
    return node.frame?.label ?? null;
  };

  const getTitle = () => {
    switch (mode) {
      case 'verbs': return 'Verb Properties';
      case 'nouns': return 'Noun Properties';
      case 'adjectives': return 'Adjective Properties';
      case 'adverbs': return 'Adverb Properties';
      default: return 'Properties';
    }
  };

  return (
    <OverlaySection
      title={getTitle()}
      icon={
        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      }
      isOpen={isOpen}
      onToggle={onToggle}
    >
      {/* Vendler Class - Only for verbs */}
      {mode === 'verbs' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">
              Vendler Class
              {hasPendingField('vendler_class') && (
                <span className="ml-2 text-xs text-orange-600 font-normal">(pending)</span>
              )}
            </h3>
            {editingField !== 'vendler_class' && (
              <button
                onClick={() => onStartEdit('vendler_class')}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
              >
                Edit
              </button>
            )}
          </div>
          {editingField === 'vendler_class' ? (
            <VendlerClassSelector
              value={editValue}
              onChange={onValueChange}
              onSave={onSave}
              onCancel={onCancel}
              isSaving={isSaving}
            />
          ) : (
            <PendingFieldIndicator fieldName="vendler_class" pending={pending}>
              <span className="text-gray-900 text-sm">
                {getDisplayValue('vendler_class', node.vendler_class) || <span className="text-gray-500 italic">None</span>}
              </span>
            </PendingFieldIndicator>
          )}
        </div>
      )}

      {/* Frame - For verbs, nouns, adjectives, and adverbs */}
      {(mode === 'verbs' || mode === 'nouns' || mode === 'adjectives' || mode === 'adverbs') && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">
              Frame
              {hasPendingField('frame_id') && (
                <span className="ml-2 text-xs text-orange-600 font-normal">(pending)</span>
              )}
            </h3>
            {editingField !== 'frame' && (
              <button
                onClick={() => onStartEdit('frame')}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
              >
                Edit
              </button>
            )}
          </div>
          {editingField === 'frame' ? (
            <FrameSelector
              value={editValue}
              onChange={onValueChange}
              availableFrames={availableFrames}
              onSave={onSave}
              onCancel={onCancel}
              isSaving={isSaving}
            />
          ) : (
            <PendingFieldIndicator fieldName="frame_id" pending={pending}>
              <span className="text-gray-900 text-sm">
                {getFrameLabel() || <span className="text-gray-500 italic">None</span>}
              </span>
            </PendingFieldIndicator>
          )}
        </div>
      )}

      {/* Category (Lexfile) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">
            Category
            {hasPendingField('lexfile') && (
              <span className="ml-2 text-xs text-orange-600 font-normal">(pending)</span>
            )}
          </h3>
          {editingField !== 'lexfile' && (
            <button
              onClick={() => onStartEdit('lexfile')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
            >
              Edit
            </button>
          )}
        </div>
        {editingField === 'lexfile' ? (
          <LexfileSelector
            value={editValue}
            onChange={onValueChange}
            mode={mode}
            onSave={onSave}
            onCancel={onCancel}
            isSaving={isSaving}
          />
        ) : (
          <PendingFieldIndicator fieldName="lexfile" pending={pending}>
            <span className="text-gray-900 text-sm">{getDisplayValue('lexfile', node.lexfile)}</span>
          </PendingFieldIndicator>
        )}
      </div>
    </OverlaySection>
  );
}

