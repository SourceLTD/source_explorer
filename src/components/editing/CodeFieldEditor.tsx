import React from 'react';
import { FieldEditorProps } from './types';

interface CodeFieldEditorProps extends FieldEditorProps {
  currentId: string;
  value: string;
  onChange: (value: string) => void;
  validationMessage: string;
}

export function CodeFieldEditor({ 
  currentId, 
  value, 
  onChange, 
  validationMessage, 
  onSave, 
  onCancel, 
  isSaving 
}: CodeFieldEditorProps) {
  const posMatch = currentId.match(/\.([vnar])\.(\d+)$/);
  const pos = posMatch?.[1] || '';

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
            placeholder="Enter lemma (e.g., good)"
            autoFocus
          />
          <span className="text-gray-500 text-sm font-mono">
            .{pos}.XX
          </span>
        </div>
        {validationMessage && (
          <p className="text-xs text-blue-600 font-medium">
            {validationMessage}
          </p>
        )}
        <p className="text-xs text-gray-600">
          The numeric part (.XX) will be automatically assigned to ensure uniqueness.
        </p>
      </div>
      <div className="flex space-x-2 pt-2">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isSaving ? 'Validating & Saving...' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

