import React from 'react';
import { RoleType } from '@/lib/types';
import { FieldEditorProps, EditableFrameRole } from './types';

interface FrameRoleEditorProps extends FieldEditorProps {
  roles: EditableFrameRole[];
  roleTypes: RoleType[];
  onRoleChange: (clientId: string, field: 'label' | 'description' | 'notes' | 'roleType' | 'main' | 'examples', value: string | boolean | string[]) => void;
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
  const controlBase =
    "w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-[11px] leading-4 text-gray-900 placeholder-gray-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500";
  const selectBase = `${controlBase} appearance-none pr-7 cursor-pointer`;
  const iconButtonBase =
    "inline-flex h-6 w-6 items-center justify-center rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500";

  // Prevent keyboard shortcuts from interfering with textarea input
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Stop propagation for Enter and Escape to prevent parent handlers from interfering
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.stopPropagation();
    }
  };

  return (
    <div className="space-y-2">
      {roles.map((role) => (
        <div
          key={role.clientId}
          className={`rounded-xl border p-2 ${
            role.main ? 'border-blue-200 bg-blue-50/60' : 'border-gray-200 bg-white'
          }`}
        >
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-[10.5rem_9rem_1fr_0.9fr_auto]">
            <div className="relative">
              <select
                value={role.roleType}
                onChange={(e) => onRoleChange(role.clientId, 'roleType', e.target.value)}
                className={selectBase}
              >
                <option value="">Role type…</option>
                {roleTypes.map((rt) => (
                  <option key={rt.id} value={rt.label}>
                    {rt.label}
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            <input
              value={role.label}
              onChange={(e) => onRoleChange(role.clientId, 'label', e.target.value)}
              className={controlBase}
              placeholder="Label…"
            />

            <textarea
              value={role.description}
              onChange={(e) => onRoleChange(role.clientId, 'description', e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              className={`${controlBase} resize-y`}
              rows={1}
              placeholder="Description…"
            />

            <textarea
              value={role.notes}
              onChange={(e) => onRoleChange(role.clientId, 'notes', e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              className={`${controlBase} resize-y`}
              rows={1}
              placeholder="Notes…"
            />

            <div className="flex items-center justify-between gap-2 lg:justify-end lg:pt-0.5">
              <label className="inline-flex select-none items-center gap-1 text-[11px] leading-4 text-gray-700">
                <input
                  type="checkbox"
                  checked={role.main}
                  onChange={(e) => onRoleChange(role.clientId, 'main', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Main</span>
              </label>

              <button
                type="button"
                onClick={() => onRoleRemove(role.clientId)}
                className={`${iconButtonBase} text-red-600 hover:bg-red-50`}
                aria-label="Remove role"
                title="Remove role"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <textarea
            value={role.examples.join('\n')}
            onChange={(e) => {
              // Split by newlines but don't filter yet - allow empty lines while typing
              const examples = e.target.value.split('\n');
              onRoleChange(role.clientId, 'examples', examples);
            }}
            onKeyDown={handleTextareaKeyDown}
            className={`${controlBase} resize-y mt-2`}
            rows={2}
            placeholder="Examples (one per line)…"
          />
        </div>
      ))}
      <div className="flex space-x-2">
        <button
          onClick={() => onRoleAdd(true)}
          className="flex-1 cursor-pointer rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-medium text-blue-700 transition-colors hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          + Add Main Role
        </button>
        <button
          onClick={() => onRoleAdd(false)}
          className="flex-1 cursor-pointer rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          + Add Alt Role
        </button>
      </div>

      <div className="flex space-x-2 pt-3 border-t border-gray-200">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="cursor-pointer inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-1.5 text-[11px] font-semibold text-white transition-colors hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="cursor-pointer inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-1.5 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

