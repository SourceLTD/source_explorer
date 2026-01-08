import React from 'react';
import { RoleType } from '@/lib/types';
import { FieldEditorProps, EditableFrameRole } from './types';

interface FrameRoleEditorProps extends FieldEditorProps {
  roles: EditableFrameRole[];
  roleTypes: RoleType[];
  onRoleChange: (clientId: string, field: 'description' | 'notes' | 'roleType' | 'main' | 'examples', value: string | boolean | string[]) => void;
  onRoleAdd: (main: boolean) => void;
  onRoleRemove: (clientId: string) => void;
}

export function FrameRoleEditor({ 
  roles,
  roleTypes,
  onRoleChange,
  onRoleAdd,
  onRoleRemove,
  onSave, 
  onCancel, 
  isSaving 
}: FrameRoleEditorProps) {
  // Prevent keyboard shortcuts from interfering with textarea input
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Stop propagation for Enter and Escape to prevent parent handlers from interfering
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.stopPropagation();
    }
  };

  return (
    <div className="space-y-3">
      {roles.map((role) => (
        <div key={role.clientId} className={`p-3 border rounded-xl ${role.main ? 'border-blue-300 bg-blue-50' : 'border-purple-300 bg-purple-50'}`}>
          <div className="flex items-center justify-between mb-2">
            <select
              value={role.roleType}
              onChange={(e) => onRoleChange(role.clientId, 'roleType', e.target.value)}
              className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs bg-white"
            >
              <option value="">Select role type</option>
              {roleTypes.map((rt) => (
                <option key={rt.id} value={rt.label}>{rt.label}</option>
              ))}
            </select>
            <label className="ml-2 flex items-center space-x-1 text-xs">
              <input
                type="checkbox"
                checked={role.main}
                onChange={(e) => onRoleChange(role.clientId, 'main', e.target.checked)}
                className="rounded"
              />
              <span>Main</span>
            </label>
            <button
              onClick={() => onRoleRemove(role.clientId)}
              className="ml-2 p-1 text-red-500 hover:bg-red-100 rounded cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <textarea
            value={role.description}
            onChange={(e) => onRoleChange(role.clientId, 'description', e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white text-gray-900 resize-vertical"
            rows={2}
            placeholder="Role description"
          />
          <textarea
            value={role.notes}
            onChange={(e) => onRoleChange(role.clientId, 'notes', e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white text-gray-900 resize-vertical mt-2"
            rows={1}
            placeholder="Notes (optional)"
          />
          <div className="mt-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Examples (one per line)</label>
            <textarea
              value={role.examples.join('\n')}
              onChange={(e) => {
                // Split by newlines but don't filter yet - allow empty lines while typing
                const examples = e.target.value.split('\n');
                onRoleChange(role.clientId, 'examples', examples);
              }}
              onKeyDown={handleTextareaKeyDown}
              className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white text-gray-900 resize-vertical"
              rows={2}
              placeholder="Example sentences (optional, one per line)"
            />
          </div>
        </div>
      ))}
      <div className="flex space-x-2">
        <button
          onClick={() => onRoleAdd(true)}
          className="flex-1 px-3 py-2 border border-blue-300 rounded-xl text-blue-600 hover:bg-blue-50 text-sm cursor-pointer"
        >
          + Add Main Role
        </button>
        <button
          onClick={() => onRoleAdd(false)}
          className="flex-1 px-3 py-2 border border-purple-300 rounded-xl text-purple-600 hover:bg-purple-50 text-sm cursor-pointer"
        >
          + Add Alt Role
        </button>
      </div>

      <div className="flex space-x-2 pt-2 border-t">
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

