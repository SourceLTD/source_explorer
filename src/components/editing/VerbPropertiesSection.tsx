import React from 'react';
import { GraphNode } from '@/lib/types';
import { EditableField, FrameOption } from './types';
import { OverlaySection } from './OverlaySection';
import { VendlerClassSelector } from './VendlerClassSelector';
import { FrameSelector } from './FrameSelector';
import { LexfileSelector } from './LexfileSelector';

interface VerbPropertiesSectionProps {
  node: GraphNode;
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
}

export function VerbPropertiesSection({
  node,
  editingField,
  editValue,
  availableFrames,
  isOpen,
  onToggle,
  onStartEdit,
  onValueChange,
  onSave,
  onCancel,
  isSaving
}: VerbPropertiesSectionProps) {
  return (
    <OverlaySection
      title="Verb Properties"
      icon={
        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      }
      isOpen={isOpen}
      onToggle={onToggle}
    >
      {/* Vendler Class */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">Vendler Class</h3>
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
          <p className="text-gray-900 text-sm">
            {node.vendler_class || <span className="text-gray-500 italic">None</span>}
          </p>
        )}
      </div>

      {/* Frame */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">Frame</h3>
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
          <p className="text-gray-900 text-sm">
            {node.frame?.frame_name || <span className="text-gray-500 italic">None</span>}
          </p>
        )}
      </div>

      {/* Category (Lexfile) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">Category</h3>
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
            mode="verbs"
            onSave={onSave}
            onCancel={onCancel}
            isSaving={isSaving}
          />
        ) : (
          <p className="text-gray-900 text-sm">{node.lexfile}</p>
        )}
      </div>
    </OverlaySection>
  );
}

