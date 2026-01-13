import React from 'react';
import { GraphNode } from '@/lib/types';
import { EditableField, Mode } from './types';
import { OverlaySection } from './OverlaySection';
import { HypernymEditor } from './HypernymEditor';

interface RelationsSectionProps {
  node: GraphNode;
  mode: Mode;
  editingField: EditableField | null;
  editValue: string;
  selectedHyponymsToMove: Set<string>;
  codeValidationMessage: string;
  isOpen: boolean;
  onToggle: () => void;
  onStartEdit: (field: EditableField) => void;
  onValueChange: (value: string) => void;
  onHyponymToggle: (hyponymId: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

export function RelationsSection({
  node,
  mode,
  editingField,
  editValue,
  selectedHyponymsToMove,
  codeValidationMessage,
  isOpen,
  onToggle,
  onStartEdit,
  onValueChange,
  onHyponymToggle,
  onSave,
  onCancel,
  isSaving
}: RelationsSectionProps) {
  return (
    <OverlaySection
      title="Relations (Hypernyms & Hyponyms)"
      icon={
        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      }
      isOpen={isOpen}
      onToggle={onToggle}
    >
      {/* Hypernym */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">Hypernym (Parent)</h3>
          {editingField !== 'hypernym' && (
            <button
              onClick={() => onStartEdit('hypernym')}
              className="text-xs text-blue-600 hover:text-blue-600 font-medium cursor-pointer"
            >
              Change
            </button>
          )}
        </div>
        {editingField === 'hypernym' ? (
          <HypernymEditor
            currentNode={node}
            value={editValue}
            onChange={onValueChange}
            selectedHyponymsToMove={selectedHyponymsToMove}
            onHyponymToggle={onHyponymToggle}
            validationMessage={codeValidationMessage}
            mode={mode}
            onSave={onSave}
            onCancel={onCancel}
            isSaving={isSaving}
          />
        ) : (
          <div>
            <div className="mb-3">
              <h4 className="text-xs font-medium text-gray-700 mb-2">Current Hypernym:</h4>
              {node.parents.length > 0 ? (
                <div className="p-2 bg-green-50 border border-green-200 rounded">
                  <p className="text-sm font-medium text-green-800">{node.parents[0].id}</p>
                  <p className="text-xs text-green-600">{node.parents[0].gloss}</p>
                </div>
              ) : (
                <p className="text-gray-500 text-sm italic">No hypernym (root node)</p>
              )}
            </div>
            <div>
              <h4 className="text-xs font-medium text-gray-700 mb-2">Current Hyponyms ({node.children.length}):</h4>
              {node.children.length > 0 ? (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {node.children.map((child) => (
                    <div key={child.id} className="p-2 bg-yellow-50 border border-yellow-200 rounded">
                      <p className="text-sm font-medium text-yellow-800">{child.id}</p>
                      <p className="text-xs text-yellow-600">{child.gloss}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm italic">No hyponyms</p>
              )}
            </div>
          </div>
        )}
      </div>
    </OverlaySection>
  );
}

