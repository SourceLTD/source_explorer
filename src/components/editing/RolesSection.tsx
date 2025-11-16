import React from 'react';
import { GraphNode, RoleType, sortRolesByPrecedence } from '@/lib/types';
import { EditableField, EditableRole, EditableRoleGroup } from './types';
import { OverlaySection } from './OverlaySection';
import { RoleEditor } from './RoleEditor';

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
  return (
    <OverlaySection
      title="Roles"
      icon={
        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      }
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">Thematic Roles</h3>
          {editingField !== 'roles' && (
            <button
              onClick={() => onStartEdit('roles')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
            >
              Edit
            </button>
          )}
        </div>
        {editingField === 'roles' ? (
          <RoleEditor
            roles={editRoles}
            roleGroups={editRoleGroups}
            roleTypes={roleTypes}
            onRoleChange={onRoleChange}
            onRoleAdd={onRoleAdd}
            onRoleRemove={onRoleRemove}
            onRoleGroupAdd={onRoleGroupAdd}
            onRoleGroupRemove={onRoleGroupRemove}
            onRoleGroupChange={onRoleGroupChange}
            onToggleRoleInGroup={onToggleRoleInGroup}
            onSave={onSave}
            onCancel={onCancel}
            isSaving={isSaving}
          />
        ) : (
          <div>
            {node.roles && node.roles.length > 0 ? (
              <div className="space-y-2">
                {sortRolesByPrecedence(node.roles).map((role, index) => (
                  <div key={index} className="text-sm">
                    <span className={`font-medium ${role.main ? 'text-blue-800' : 'text-purple-800'}`}>
                      {role.role_type.label}:
                    </span>{' '}
                    <span className="text-gray-900">{role.description || 'No description'}</span>
                    {role.example_sentence && (
                      <div className="text-xs text-gray-600 italic mt-1">
                        &quot;{role.example_sentence}&quot;
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm italic">No roles</p>
            )}
          </div>
        )}
      </div>
    </OverlaySection>
  );
}

