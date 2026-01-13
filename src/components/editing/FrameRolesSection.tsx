import React from 'react';
import { Frame, RoleType, sortRolesByPrecedence } from '@/lib/types';
import { EditableField, EditableFrameRole } from './types';
import { OverlaySection } from './OverlaySection';
import { FrameRoleEditor } from './FrameRoleEditor';

interface FrameRolesSectionProps {
  frame: Frame;
  editingField: EditableField | null;
  editFrameRoles: EditableFrameRole[];
  roleTypes: RoleType[];
  isOpen: boolean;
  onToggle: () => void;
  onStartEdit: (field: EditableField) => void;
  onFrameRoleChange: (clientId: string, field: 'description' | 'notes' | 'roleType' | 'main' | 'examples', value: string | boolean | string[]) => void;
  onFrameRoleAdd: (main: boolean) => void;
  onFrameRoleRemove: (clientId: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

export function FrameRolesSection({
  frame,
  editingField,
  editFrameRoles,
  roleTypes,
  isOpen,
  onToggle,
  onStartEdit,
  onFrameRoleChange,
  onFrameRoleAdd,
  onFrameRoleRemove,
  onSave,
  onCancel,
  isSaving
}: FrameRolesSectionProps) {
  return (
    <OverlaySection
      title="Frame Roles"
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
          {editingField !== 'frame_roles' && (
            <button
              onClick={() => onStartEdit('frame_roles')}
              className="text-xs text-blue-600 hover:text-blue-600 font-medium cursor-pointer"
            >
              Edit
            </button>
          )}
        </div>
        {editingField === 'frame_roles' ? (
          <FrameRoleEditor
            roles={editFrameRoles}
            roleTypes={roleTypes}
            onRoleChange={onFrameRoleChange}
            onRoleAdd={onFrameRoleAdd}
            onRoleRemove={onFrameRoleRemove}
            onSave={onSave}
            onCancel={onCancel}
            isSaving={isSaving}
          />
        ) : (
          <div>
            {frame.frame_roles && frame.frame_roles.length > 0 ? (
              <div className="space-y-2">
                {sortRolesByPrecedence(frame.frame_roles).map((role, index) => (
                  <div key={index} className="text-sm">
                    <span className={`font-medium ${role.main ? 'text-blue-600' : 'text-purple-800'}`}>
                      {role.role_type.label}:
                    </span>{' '}
                    <span className="text-gray-900">{role.description || 'No description'}</span>
                    {role.notes && (
                      <div className="text-xs text-gray-600 italic mt-1">
                        Note: {role.notes}
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

