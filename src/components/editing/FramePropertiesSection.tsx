import React from 'react';
import { Frame } from '@/lib/types';
import { EditableField } from './types';
import { OverlaySection } from './OverlaySection';

interface FramePropertiesSectionProps {
  frame: Frame;
  editingField: EditableField | null;
  editValue: string;
  isOpen: boolean;
  onToggle: () => void;
  onStartEdit: (field: EditableField) => void;
  onValueChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

export function FramePropertiesSection({
  frame,
  editingField,
  editValue,
  isOpen,
  onToggle,
  onStartEdit,
  onValueChange,
  onSave,
  onCancel,
  isSaving
}: FramePropertiesSectionProps) {
  return (
    <OverlaySection
      title="Frame Properties"
      icon={
        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
      }
      isOpen={isOpen}
      onToggle={onToggle}
    >
      {/* Frame Name */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">Frame Name</h3>
          {editingField !== 'label' && (
            <button
              onClick={() => onStartEdit('label')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
            >
              Edit
            </button>
          )}
        </div>
        {editingField === 'label' ? (
          <div className="space-y-2">
            <input
              type="text"
              value={editValue}
              onChange={(e) => onValueChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="Frame name"
              autoFocus
            />
            <div className="flex space-x-2">
              <button
                onClick={onSave}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-gray-900 text-sm font-semibold">{frame.label}</p>
        )}
      </div>

      {/* Definition */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">Definition</h3>
          {editingField !== 'definition' && (
            <button
              onClick={() => onStartEdit('definition')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
            >
              Edit
            </button>
          )}
        </div>
        {editingField === 'definition' ? (
          <div className="space-y-2">
            <textarea
              value={editValue}
              onChange={(e) => onValueChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-vertical"
              rows={4}
              placeholder="Frame definition"
              autoFocus
            />
            <div className="flex space-x-2">
              <button
                onClick={onSave}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-gray-900 text-sm">{frame.definition}</p>
        )}
      </div>

      {/* Short Definition */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">Short Definition</h3>
          {editingField !== 'short_definition' && (
            <button
              onClick={() => onStartEdit('short_definition')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
            >
              Edit
            </button>
          )}
        </div>
        {editingField === 'short_definition' ? (
          <div className="space-y-2">
            <textarea
              value={editValue}
              onChange={(e) => onValueChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-vertical"
              rows={2}
              placeholder="Short definition"
              autoFocus
            />
            <div className="flex space-x-2">
              <button
                onClick={onSave}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-gray-900 text-sm">{frame.short_definition}</p>
        )}
      </div>

      {/* Prototypical Synset */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">Prototypical Synset</h3>
          {editingField !== 'prototypical_synset' && (
            <button
              onClick={() => onStartEdit('prototypical_synset')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
            >
              Edit
            </button>
          )}
        </div>
        {editingField === 'prototypical_synset' ? (
          <div className="space-y-2">
            <input
              type="text"
              value={editValue}
              onChange={(e) => onValueChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
              placeholder="Verb ID (e.g., speak.v.01)"
              autoFocus
            />
            <div className="flex space-x-2">
              <button
                onClick={onSave}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-gray-900 text-sm font-mono">{frame.prototypical_synset}</p>
        )}
      </div>
    </OverlaySection>
  );
}

