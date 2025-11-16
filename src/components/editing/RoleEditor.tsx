import React from 'react';
import { RoleType } from '@/lib/types';
import { FieldEditorProps, EditableRole, EditableRoleGroup } from './types';

interface RoleEditorProps extends FieldEditorProps {
  roles: EditableRole[];
  roleGroups: EditableRoleGroup[];
  roleTypes: RoleType[];
  onRoleChange: (clientId: string, field: 'description' | 'roleType' | 'exampleSentence' | 'main', value: string | boolean) => void;
  onRoleAdd: (main: boolean) => void;
  onRoleRemove: (clientId: string) => void;
  onRoleGroupAdd: () => void;
  onRoleGroupRemove: (index: number) => void;
  onRoleGroupChange: (index: number, field: 'description' | 'role_ids', value: string | string[]) => void;
  onToggleRoleInGroup: (groupIndex: number, roleId: string) => void;
}

export function RoleEditor({ 
  roles,
  roleGroups,
  roleTypes,
  onRoleChange,
  onRoleAdd,
  onRoleRemove,
  onRoleGroupAdd,
  onRoleGroupRemove,
  onRoleGroupChange,
  onToggleRoleInGroup,
  onSave, 
  onCancel, 
  isSaving 
}: RoleEditorProps) {
  return (
    <div className="space-y-3">
      {roles.map((role) => (
        <div key={role.clientId} className={`p-3 border rounded-lg ${role.main ? 'border-blue-300 bg-blue-50' : 'border-purple-300 bg-purple-50'}`}>
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
              className="ml-2 p-1 text-red-500 hover:bg-red-100 rounded"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <textarea
            value={role.description}
            onChange={(e) => onRoleChange(role.clientId, 'description', e.target.value)}
            className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white text-gray-900 resize-vertical"
            rows={2}
            placeholder="Role description"
          />
          <textarea
            value={role.exampleSentence}
            onChange={(e) => onRoleChange(role.clientId, 'exampleSentence', e.target.value)}
            className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white text-gray-900 resize-vertical mt-2"
            rows={1}
            placeholder="Example sentence (optional)"
          />
        </div>
      ))}
      <div className="flex space-x-2">
        <button
          onClick={() => onRoleAdd(true)}
          className="flex-1 px-3 py-2 border border-blue-300 rounded-md text-blue-600 hover:bg-blue-50 text-sm"
        >
          + Add Main Role
        </button>
        <button
          onClick={() => onRoleAdd(false)}
          className="flex-1 px-3 py-2 border border-purple-300 rounded-md text-purple-600 hover:bg-purple-50 text-sm"
        >
          + Add Alt Role
        </button>
      </div>

      {/* Role Groups */}
      {roles.length > 1 && (
        <div className="pt-4 border-t">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Role Groups (OR constraints)</h4>
          {roleGroups.map((group, groupIndex) => (
            <div key={groupIndex} className="p-3 border border-gray-300 rounded-lg bg-gray-50 mb-2">
              <div className="flex items-start justify-between mb-2">
                <input
                  type="text"
                  value={group.description}
                  onChange={(e) => onRoleGroupChange(groupIndex, 'description', e.target.value)}
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs bg-white text-gray-900"
                  placeholder="Group description (optional)"
                />
                <button
                  onClick={() => onRoleGroupRemove(groupIndex)}
                  className="ml-2 p-1 text-red-500 hover:bg-red-100 rounded"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-1">
                {roles.map((role) => {
                  const roleIdentifier = role.clientId;
                  const isInGroup = group.role_ids.includes(roleIdentifier);
                  return (
                    <label key={roleIdentifier} className="flex items-center space-x-2 text-xs cursor-pointer hover:bg-white p-1 rounded">
                      <input
                        type="checkbox"
                        checked={isInGroup}
                        onChange={() => onToggleRoleInGroup(groupIndex, roleIdentifier)}
                        className="rounded"
                      />
                      <span className={role.main ? 'text-blue-700 font-medium' : 'text-purple-700'}>
                        {role.roleType || '(no type)'}
                      </span>
                      <span className="text-gray-600 truncate">
                        {role.description ? `- ${role.description.substring(0, 30)}${role.description.length > 30 ? '...' : ''}` : ''}
                      </span>
                    </label>
                  );
                })}
              </div>
              {group.role_ids.length < 2 && (
                <p className="text-xs text-red-600 mt-2">⚠️ Group needs at least 2 roles</p>
              )}
            </div>
          ))}
          <button
            onClick={onRoleGroupAdd}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            + Add Role Group
          </button>
        </div>
      )}

      <div className="flex space-x-2 pt-2 border-t">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save'}
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

