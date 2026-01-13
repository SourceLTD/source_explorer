import React from 'react';
import { GraphNode, RoleType, sortRolesByPrecedence } from '@/lib/types';
import { EditableField, EditableRole, EditableRoleGroup } from './types';
import { OverlaySection } from './OverlaySection';

interface RolesSectionProps {
  node: GraphNode;
  editingField: EditableField | null;
  editRoles: EditableRole[];
  editRoleGroups: EditableRoleGroup[];
  roleTypes: RoleType[];
  isOpen: boolean;
  onToggle: () => void;
  onStartEdit: (field: EditableField) => void;
  onRoleChange: (clientId: string, field: 'description' | 'roleType' | 'exampleSentence' | 'main', value: string | boolean) => void;
  onRoleAdd: (main: boolean) => void;
  onRoleRemove: (clientId: string) => void;
  onRoleGroupAdd: () => void;
  onRoleGroupRemove: (index: number) => void;
  onRoleGroupChange: (index: number, field: 'description' | 'role_ids', value: string | string[]) => void;
  onToggleRoleInGroup: (groupIndex: number, roleId: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

export function RolesSection({
  node,
  editingField,
  editRoles,
  editRoleGroups,
  roleTypes,
  isOpen,
  onToggle,
  onStartEdit,
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
}: RolesSectionProps) {
  const isEditing = editingField === 'roles';

  return (
    <OverlaySection
      title="Verb Roles"
      icon={
        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      }
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="space-y-6">
        {/* Roles Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">Thematic Roles</h3>
            {!isEditing && (
              <button
                onClick={() => onStartEdit('roles')}
                className="text-xs text-blue-600 hover:text-blue-600 font-medium cursor-pointer"
              >
                Edit
              </button>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-4">
              {editRoles.map((role) => (
                <div key={role.clientId} className={`p-3 border rounded-xl ${role.main ? 'border-blue-300 bg-blue-50' : 'border-purple-300 bg-purple-50'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <select
                      value={role.roleType}
                      onChange={(e) => onRoleChange(role.clientId, 'roleType', e.target.value)}
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs bg-white text-gray-900"
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
                        className="rounded border-gray-300"
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
                    className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white text-gray-900 resize-vertical"
                    rows={2}
                    placeholder="Role description"
                  />
                  <input
                    type="text"
                    value={role.exampleSentence}
                    onChange={(e) => onRoleChange(role.clientId, 'exampleSentence', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-xs bg-white text-gray-900 mt-2"
                    placeholder="Example sentence"
                  />
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

              {/* Role Groups Section within Editor */}
              <div className="mt-6 pt-6 border-t">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-gray-700">Role Groups (OR constraints)</h4>
                  <button
                    onClick={onRoleGroupAdd}
                    className="text-xs text-blue-600 hover:text-blue-600 font-medium cursor-pointer"
                  >
                    + Add Group
                  </button>
                </div>
                <div className="space-y-3">
                  {editRoleGroups.map((group, groupIndex) => (
                    <div key={group.id} className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <input
                          type="text"
                          value={group.description}
                          onChange={(e) => onRoleGroupChange(groupIndex, 'description', e.target.value)}
                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs bg-white text-gray-900"
                          placeholder="Group description"
                        />
                        <button
                          onClick={() => onRoleGroupRemove(groupIndex)}
                          className="ml-2 p-1 text-red-500 hover:bg-red-100 rounded cursor-pointer"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {editRoles.map(role => (
                          <button
                            key={role.clientId}
                            onClick={() => onToggleRoleInGroup(groupIndex, role.clientId)}
                            className={`px-2 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                              group.role_ids.includes(role.clientId)
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                          >
                            {role.roleType || 'Unnamed Role'}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex space-x-2 pt-4 border-t">
                <button
                  onClick={onSave}
                  disabled={isSaving}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
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
            <div className="space-y-4">
              {node.roles && node.roles.length > 0 ? (
                <div className="space-y-2">
                  {sortRolesByPrecedence(node.roles).map((role, index) => (
                    <div key={index} className="text-sm">
                      <span className={`font-medium ${role.main ? 'text-blue-600' : 'text-purple-800'}`}>
                        {role.role_type.label}:
                      </span>{' '}
                      <span className="text-gray-900">{role.description || 'No description'}</span>
                      {role.examples && role.examples.length > 0 && (
                        <div className="text-xs text-gray-600 italic mt-0.5 ml-2">
                          e.g., "{role.examples[0]}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm italic">No roles defined</p>
              )}

              {/* Display Role Groups */}
              {node.role_groups && node.role_groups.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Role Groups</h4>
                  <div className="space-y-2">
                    {node.role_groups.map((group, index) => {
                      const rolesInGroup = node.roles?.filter(r => group.role_ids.includes(r.id)) || [];
                      return (
                        <div key={index} className="p-2 bg-blue-50 border border-blue-100 rounded-lg text-xs">
                          <div className="font-medium text-blue-600 mb-1">{group.description || 'Unnamed Group'}</div>
                          <div className="flex flex-wrap gap-1">
                            {rolesInGroup.map((r, i) => (
                              <span key={i} className="px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded">
                                {r.role_type.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </OverlaySection>
  );
}
