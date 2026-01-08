import React from 'react';
import { FieldEditorProps } from './types';

interface VendlerClassSelectorProps extends FieldEditorProps {
  value: string;
  onChange: (value: string) => void;
}

const VENDLER_CLASSES = ['state', 'activity', 'accomplishment', 'achievement'];

export function VendlerClassSelector({ value, onChange, onSave, onCancel, isSaving }: VendlerClassSelectorProps) {
  return (
    <div className="space-y-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
      >
        <option value="">None</option>
        {VENDLER_CLASSES.map(vc => (
          <option key={vc} value={vc}>{vc}</option>
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

