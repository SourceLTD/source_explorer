import React from 'react';
import { GraphNode } from '@/lib/types';
import { EditableField } from './types';
import { OverlaySection } from './OverlaySection';
import { ListFieldEditor } from './ListFieldEditor';

interface LegalConstraintsSectionProps {
  node: GraphNode;
  editingField: EditableField | null;
  editListItems: string[];
  isOpen: boolean;
  onToggle: () => void;
  onStartEdit: (field: EditableField) => void;
  onListItemChange: (index: number, value: string) => void;
  onListItemAdd: () => void;
  onListItemRemove: (index: number) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

export function LegalConstraintsSection({
  node,
  editingField,
  editListItems,
  isOpen,
  onToggle,
  onStartEdit,
  onListItemChange,
  onListItemAdd,
  onListItemRemove,
  onSave,
  onCancel,
  isSaving
}: LegalConstraintsSectionProps) {
  return (
    <OverlaySection
      title="Legal Constraints"
      icon={
        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      }
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">Legal Constraints</h3>
          {editingField !== 'legal_constraints' && (
            <button
              onClick={() => onStartEdit('legal_constraints')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
            >
              Edit
            </button>
          )}
        </div>
        {editingField === 'legal_constraints' ? (
          <ListFieldEditor
            items={editListItems}
            onItemChange={onListItemChange}
            onItemAdd={onListItemAdd}
            onItemRemove={onListItemRemove}
            itemType="text"
            placeholder="Enter legal constraint"
            addButtonText="+ Add Constraint"
            onSave={onSave}
            onCancel={onCancel}
            isSaving={isSaving}
          />
        ) : (
          <div>
            {node.legal_constraints && node.legal_constraints.length > 0 ? (
              <div className="space-y-1">
                {node.legal_constraints.map((constraint, index) => (
                  <p key={index} className="text-gray-900 text-sm">
                    {constraint}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm italic">No legal constraints</p>
            )}
          </div>
        )}
      </div>
    </OverlaySection>
  );
}

