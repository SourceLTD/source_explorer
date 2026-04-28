import React from 'react';
import { GraphNode, PendingChangeInfo } from '@/lib/types';
import { Mode, EditableField, FrameOption } from './types';
import { OverlaySection } from './OverlaySection';
import { VendlerClassSelector } from './VendlerClassSelector';
import { LexfileSelector } from './LexfileSelector';
import { PendingFieldIndicator } from '@/components/PendingChangeIndicator';
import { SenseFrameWarning } from '@/components/ui';

interface LexicalPropertiesSectionProps {
  node: GraphNode;
  mode: Mode;
  editingField: EditableField | null;
  editValue: string;
  availableFrames: FrameOption[];
  isOpen: boolean;
  onToggle: () => void;
  onStartEdit: (field: EditableField) => void;
  onValueChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  pending?: PendingChangeInfo | null;
}

export function LexicalPropertiesSection({
  node,
  mode,
  editingField,
  editValue,
  availableFrames,
  isOpen,
  onToggle,
  onStartEdit,
  onValueChange,
  onSave,
  onCancel,
  isSaving,
  pending
}: LexicalPropertiesSectionProps) {
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

  // availableFrames is kept in the prop API for backward compatibility but is no
  // longer used: frames are now read via `node.senses`.
  void availableFrames;

  const getTitle = () => {
    switch (mode) {
      case 'verbs': return 'Verb Properties';
      case 'nouns': return 'Noun Properties';
      case 'adjectives': return 'Adjective Properties';
      case 'adverbs': return 'Adverb Properties';
      case 'lexical_units': return 'Properties';
      default: return 'Properties';
    }
  };

  return (
    <OverlaySection
      title={getTitle()}
      icon={
        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      }
      isOpen={isOpen}
      onToggle={onToggle}
    >
      {/* Vendler Class - Only for verbs */}
      {(mode === 'verbs' || (mode === 'lexical_units' && node.pos === 'verb')) && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">
              Vendler Class
              {hasPendingField('vendler_class') && (
                <span className="ml-2 text-xs text-orange-600 font-normal">(pending)</span>
              )}
            </h3>
            {editingField !== 'vendler_class' && (
              <button
                onClick={() => onStartEdit('vendler_class')}
                className="text-xs text-blue-600 hover:text-blue-600 font-medium cursor-pointer"
              >
                Edit
              </button>
            )}
          </div>
          {editingField === 'vendler_class' ? (
            <VendlerClassSelector
              value={editValue}
              onChange={onValueChange}
              onSave={onSave}
              onCancel={onCancel}
              isSaving={isSaving}
            />
          ) : (
            <PendingFieldIndicator fieldName="vendler_class" pending={pending}>
              <span className="text-gray-900 text-sm">
                {getDisplayValue('vendler_class', node.vendler_class) || <span className="text-gray-500 italic">None</span>}
              </span>
            </PendingFieldIndicator>
          )}
        </div>
      )}

      {/* Senses — each sense carries its own frame link. Frames are no longer
          edited directly on the lexical unit; edit via the sense API. */}
      {(mode === 'lexical_units' || mode === 'verbs' || mode === 'nouns' || mode === 'adjectives' || mode === 'adverbs') && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">
              Senses
              <span className="ml-1 text-xs text-gray-400 font-normal">
                ({node.senses?.length ?? 0})
              </span>
            </h3>
          </div>
          {!node.senses || node.senses.length === 0 ? (
            <div className="text-sm text-gray-500 italic">
              No senses attached — use the sense API to create one.
            </div>
          ) : (
            <div className="space-y-2">
              {node.senses.map(sense => {
                const warning = sense.frameWarning;
                return (
                  <div
                    key={sense.id}
                    className={`rounded-lg border px-3 py-2 ${
                      warning
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-semibold uppercase bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                        {sense.pos}
                      </span>
                      <span className="text-[10px] font-medium uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                        {sense.frame_type}
                      </span>
                      <SenseFrameWarning
                        warning={warning}
                        frameCount={sense.frames.length}
                        senseLabel={sense.definition?.slice(0, 32) ?? undefined}
                      />
                      <span className="text-xs text-gray-500 ml-auto">
                        {warning === null && sense.frame ? (
                          <>→ <span className="font-medium text-gray-700">{sense.frame.label}</span></>
                        ) : warning === 'multiple' ? (
                          <span>{sense.frames.length} frames</span>
                        ) : null}
                      </span>
                    </div>
                    {sense.definition && (
                      <p className="text-sm text-gray-800 mt-1 leading-snug">
                        {sense.definition}
                      </p>
                    )}
                    {sense.lemmas && sense.lemmas.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {sense.lemmas.map((lemma, i) => (
                          <span
                            key={`${lemma}-${i}`}
                            className="text-xs text-gray-600 bg-gray-200/50 px-2 py-0.5 rounded-full border border-gray-200"
                          >
                            {lemma}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Category (Lexfile) */}
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
              className="text-xs text-blue-600 hover:text-blue-600 font-medium cursor-pointer"
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
    </OverlaySection>
  );
}

