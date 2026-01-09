import React from 'react';
import { GraphNode, PendingChangeInfo } from '@/lib/types';
import { EditableField, Mode } from './types';
import { OverlaySection } from './OverlaySection';
import { CodeFieldEditor } from './CodeFieldEditor';
import { ListFieldEditor } from './ListFieldEditor';
import { GlossEditor } from './GlossEditor';
import { LexfileSelector } from './LexfileSelector';
import { PendingFieldIndicator } from '@/components/PendingChangeIndicator';

interface BasicInfoSectionProps {
  node: GraphNode;
  mode: Mode;
  editingField: EditableField | null;
  editValue: string;
  editListItems: string[];
  codeValidationMessage: string;
  isOpen: boolean;
  onToggle: () => void;
  onStartEdit: (field: EditableField) => void;
  onValueChange: (value: string) => void;
  onListItemChange: (index: number, value: string) => void;
  onListItemAdd: () => void;
  onListItemRemove: (index: number) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  pending?: PendingChangeInfo | null;
}

export function BasicInfoSection({
  node,
  mode,
  editingField,
  editValue,
  editListItems,
  codeValidationMessage,
  isOpen,
  onToggle,
  onStartEdit,
  onValueChange,
  onListItemChange,
  onListItemAdd,
  onListItemRemove,
  onSave,
  onCancel,
  isSaving,
  pending
}: BasicInfoSectionProps) {
  // Helper to check if a field has pending changes
  const hasPendingField = (fieldName: string) => {
    return !!pending?.pending_fields?.[fieldName];
  };

  // Helper to get the display value for a field (pending new_value if exists, otherwise current value)
  const getDisplayValue = <T,>(fieldName: string, currentValue: T): T => {
    const pendingField = pending?.pending_fields?.[fieldName];
    if (pendingField) {
      return pendingField.new_value as T;
    }
    return currentValue;
  };

  return (
    <OverlaySection
      title="Basic Information"
      icon={
        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      }
      isOpen={isOpen}
      onToggle={onToggle}
    >
      {/* Code (ID) - Lemma Part Only */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">
            Entry Code (Lemma Part)
            {hasPendingField('id') && (
              <span className="ml-2 text-xs text-orange-600 font-normal">(pending)</span>
            )}
          </h3>
          {editingField !== 'code' && (
            <button
              onClick={() => onStartEdit('code')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
            >
              Edit
            </button>
          )}
        </div>
        {editingField === 'code' ? (
          <CodeFieldEditor
            currentId={node.id}
            value={editValue}
            onChange={onValueChange}
            validationMessage={codeValidationMessage}
            onSave={onSave}
            onCancel={onCancel}
            isSaving={isSaving}
          />
        ) : (
          <PendingFieldIndicator fieldName="id" pending={pending}>
            <span className="text-sm text-gray-900 font-mono">
              {getDisplayValue('id', node.id)}
            </span>
          </PendingFieldIndicator>
        )}
      </div>

      {/* Src Lemmas */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">
            Source Lemmas
            {hasPendingField('src_lemmas') && (
              <span className="ml-2 text-xs text-orange-600 font-normal">(pending)</span>
            )}
          </h3>
          {editingField !== 'src_lemmas' && (
            <button
              onClick={() => onStartEdit('src_lemmas')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
            >
              Edit
            </button>
          )}
        </div>
        {editingField === 'src_lemmas' ? (
          <ListFieldEditor
            items={editListItems}
            onItemChange={onListItemChange}
            onItemAdd={onListItemAdd}
            onItemRemove={onListItemRemove}
            itemType="text"
            placeholder="Enter lemma"
            addButtonText="+ Add Lemma"
            onSave={onSave}
            onCancel={onCancel}
            isSaving={isSaving}
          />
        ) : (
          <PendingFieldIndicator fieldName="src_lemmas" pending={pending}>
            <div className="text-sm text-gray-900">
              {(() => {
                const srcLemmas = getDisplayValue('src_lemmas', node.src_lemmas);
                return srcLemmas && srcLemmas.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {srcLemmas.map((lemma, idx) => (
                      <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold">
                        {lemma}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm italic">No source lemmas</p>
                );
              })()}
            </div>
          </PendingFieldIndicator>
        )}
      </div>

      {/* Gloss */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">
            Gloss
            {hasPendingField('gloss') && (
              <span className="ml-2 text-xs text-orange-600 font-normal">(pending)</span>
            )}
          </h3>
          {editingField !== 'gloss' && (
            <button
              onClick={() => onStartEdit('gloss')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
            >
              Edit
            </button>
          )}
        </div>
        {editingField === 'gloss' ? (
          <GlossEditor
            value={editValue}
            onChange={onValueChange}
            onSave={onSave}
            onCancel={onCancel}
            isSaving={isSaving}
          />
        ) : (
          <PendingFieldIndicator fieldName="gloss" pending={pending}>
            <span className="text-gray-900 text-sm leading-relaxed">
              {getDisplayValue('gloss', node.gloss)}
            </span>
          </PendingFieldIndicator>
        )}
      </div>

      {/* Examples */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">
            Examples
            {hasPendingField('examples') && (
              <span className="ml-2 text-xs text-orange-600 font-normal">(pending)</span>
            )}
          </h3>
          {editingField !== 'examples' && (
            <button
              onClick={() => onStartEdit('examples')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
            >
              Edit
            </button>
          )}
        </div>
        {editingField === 'examples' ? (
          <ListFieldEditor
            items={editListItems}
            onItemChange={onListItemChange}
            onItemAdd={onListItemAdd}
            onItemRemove={onListItemRemove}
            itemType="textarea"
            placeholder="Enter example sentence"
            addButtonText="+ Add Example"
            onSave={onSave}
            onCancel={onCancel}
            isSaving={isSaving}
          />
        ) : (
          <PendingFieldIndicator fieldName="examples" pending={pending}>
            <div>
              {(() => {
                const examples = getDisplayValue('examples', node.examples);
                return examples && examples.length > 0 ? (
                  <div className="space-y-1">
                    {examples.map((example, index) => (
                      <p key={index} className="text-gray-900 text-sm italic">
                        &quot;{example}&quot;
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm italic">No examples</p>
                );
              })()}
            </div>
          </PendingFieldIndicator>
        )}
      </div>

      {/* Category (Lexfile) - Only for adjectives in basic info */}
      {mode === 'adjectives' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">
              Category
              {hasPendingField('lexfile') && (
                <span className="ml-2 text-xs text-orange-600 font-normal">(pending)</span>
              )}
            </h3>
            {editingField !== 'lexfile' && (
              <button
                onClick={() => onStartEdit('lexfile')}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
              >
                Edit
              </button>
            )}
          </div>
          {editingField === 'lexfile' ? (
            <LexfileSelector
              value={editValue}
              onChange={onValueChange}
              mode={mode}
              onSave={onSave}
              onCancel={onCancel}
              isSaving={isSaving}
            />
          ) : (
            <PendingFieldIndicator fieldName="lexfile" pending={pending}>
              <span className="text-gray-900 text-sm">{getDisplayValue('lexfile', node.lexfile)}</span>
            </PendingFieldIndicator>
          )}
        </div>
      )}
    </OverlaySection>
  );
}

