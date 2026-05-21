import React from 'react';
import { FieldEditorProps, ConceptOption } from './types';

interface ConceptSelectorProps extends FieldEditorProps {
  value: string;
  onChange: (value: string) => void;
  availableConcepts: ConceptOption[];
}

export function ConceptSelector({ value, onChange, availableConcepts, onSave, onCancel, isSaving }: ConceptSelectorProps) {
  return (
    <div className="space-y-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
      >
        <option value="">None</option>
        {availableConcepts.map(concept => (
          <option key={concept.id} value={concept.id}>
            {concept.code?.trim() || concept.label}
          </option>
        ))}
      </select>
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
  );
}

