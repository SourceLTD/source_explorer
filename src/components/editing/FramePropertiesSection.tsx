import React from 'react';
import { Frame, PendingChangeInfo } from '@/lib/types';
import { EditableField, FrameOption } from './types';
import { OverlaySection } from './OverlaySection';
import { PendingFieldIndicator } from '@/components/PendingChangeIndicator';
import { FrameSelector } from './FrameSelector';

interface FramePropertiesSectionProps {
  frame: Frame;
  editingField: EditableField | null;
  editValue: string;
  isOpen: boolean;
  onToggle: () => void;
  onStartEdit: (field: EditableField) => void;
  onValueChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  pending?: PendingChangeInfo | null;
  availableSuperFrames?: FrameOption[];
}

export function FramePropertiesSection({
  frame,
  editingField,
  editValue,
  isOpen,
  onToggle,
  onStartEdit,
  onValueChange,
  onSave,
  onCancel,
  isSaving,
  pending,
  availableSuperFrames = []
}: FramePropertiesSectionProps) {
  const normalizeId = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string') {
      const trimmed = v.trim();
      return trimmed ? trimmed : null;
    }
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'number' && Number.isInteger(v)) return String(v);
    return null;
  };

  const formatFrameRef = (id: string | null, lookup?: (id: string) => { code?: string | null; label?: string | null } | null): string | null => {
    if (!id) return null;
    const idTrimmed = id.trim();
    if (!idTrimmed) return null;

    // Virtual negative IDs (rare here, but supported for consistency)
    if (/^-\d+$/.test(idTrimmed)) {
      return `${idTrimmed} (pending)`;
    }

    if (/^\d+$/.test(idTrimmed)) {
      const info = lookup ? lookup(idTrimmed) : null;
      const name =
        (info?.code && info.code.trim() !== '' ? info.code.trim() : null) ||
        (info?.label && info.label.trim() !== '' ? info.label.trim() : null) ||
        'Unknown';
      return `${name} (#${idTrimmed})`;
    }

    return idTrimmed;
  };

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

  const lookupSuperFrameById = (id: string): { code?: string | null; label?: string | null } | null => {
    // Prefer the currently loaded super_frame relation if it matches
    if (frame.super_frame && frame.super_frame.id === id) {
      return { code: frame.super_frame.code ?? null, label: frame.super_frame.label ?? null };
    }
    const opt = availableSuperFrames.find(f => f.id === id);
    if (!opt) return null;
    return { code: opt.code ?? null, label: opt.label ?? null };
  };

  // Display for super_frame_id (handles pending changes)
  const getSuperFrameDisplay = (): string | null => {
    const superFrameIdRaw = getDisplayValue('super_frame_id', frame.super_frame_id);
    const superFrameId = normalizeId(superFrameIdRaw);
    return formatFrameRef(superFrameId, lookupSuperFrameById);
  };

  // Check if this is a regular frame (not a super frame)
  const isRegularFrame = frame.super_frame_id !== null;

  return (
    <OverlaySection
      title="Frame Properties"
      icon={
        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
      }
      isOpen={isOpen}
      onToggle={onToggle}
    >
      {/* Frame Name */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">
            Frame Name
            {hasPendingField('label') && (
              <span className="ml-2 text-xs text-orange-600 font-normal">(pending)</span>
            )}
          </h3>
          {editingField !== 'label' && (
            <button
              onClick={() => onStartEdit('label')}
              className="text-xs text-blue-600 hover:text-blue-600 font-medium cursor-pointer"
            >
              Edit
            </button>
          )}
        </div>
        {editingField === 'label' ? (
          <div className="space-y-2">
            <input
              type="text"
              value={editValue}
              onChange={(e) => onValueChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="Frame name"
              autoFocus
            />
            <div className="flex space-x-2">
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
        ) : (
          <PendingFieldIndicator fieldName="label" pending={pending}>
            <span className="text-gray-900 text-sm font-semibold">{getDisplayValue('label', frame.label)}</span>
          </PendingFieldIndicator>
        )}
      </div>

      {/* Definition */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">
            Definition
            {hasPendingField('definition') && (
              <span className="ml-2 text-xs text-orange-600 font-normal">(pending)</span>
            )}
          </h3>
          {editingField !== 'definition' && (
            <button
              onClick={() => onStartEdit('definition')}
              className="text-xs text-blue-600 hover:text-blue-600 font-medium cursor-pointer"
            >
              Edit
            </button>
          )}
        </div>
        {editingField === 'definition' ? (
          <div className="space-y-2">
            <textarea
              value={editValue}
              onChange={(e) => onValueChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-vertical"
              rows={4}
              placeholder="Frame definition"
              autoFocus
            />
            <div className="flex space-x-2">
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
        ) : (
          <PendingFieldIndicator fieldName="definition" pending={pending}>
            <span className="text-gray-900 text-sm">{getDisplayValue('definition', frame.definition)}</span>
          </PendingFieldIndicator>
        )}
      </div>

      {/* Short Definition */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">
            Short Definition
            {hasPendingField('short_definition') && (
              <span className="ml-2 text-xs text-orange-600 font-normal">(pending)</span>
            )}
          </h3>
          {editingField !== 'short_definition' && (
            <button
              onClick={() => onStartEdit('short_definition')}
              className="text-xs text-blue-600 hover:text-blue-600 font-medium cursor-pointer"
            >
              Edit
            </button>
          )}
        </div>
        {editingField === 'short_definition' ? (
          <div className="space-y-2">
            <textarea
              value={editValue}
              onChange={(e) => onValueChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-vertical"
              rows={2}
              placeholder="Short definition"
              autoFocus
            />
            <div className="flex space-x-2">
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
        ) : (
          <PendingFieldIndicator fieldName="short_definition" pending={pending}>
            <span className="text-gray-900 text-sm">{getDisplayValue('short_definition', frame.short_definition)}</span>
          </PendingFieldIndicator>
        )}
      </div>

      {/* Parent Super Frame - Only shown for regular frames (not super frames) */}
      {isRegularFrame && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">
              Parent Super Frame
              {hasPendingField('super_frame_id') && (
                <span className="ml-2 text-xs text-orange-600 font-normal">(pending)</span>
              )}
            </h3>
            {editingField !== 'super_frame_id' && (
              <button
                onClick={() => onStartEdit('super_frame_id')}
                className="text-xs text-blue-600 hover:text-blue-600 font-medium cursor-pointer"
              >
                Edit
              </button>
            )}
          </div>
          {editingField === 'super_frame_id' ? (
            <FrameSelector
              value={editValue}
              onChange={onValueChange}
              availableFrames={availableSuperFrames}
              onSave={onSave}
              onCancel={onCancel}
              isSaving={isSaving}
            />
          ) : (
            <PendingFieldIndicator
              fieldName="super_frame_id"
              pending={pending}
              formatTooltipValue={(value) => {
                const id = normalizeId(value);
                return formatFrameRef(id, lookupSuperFrameById);
              }}
            >
              <span className="text-gray-900 text-sm">
                {getSuperFrameDisplay() || <span className="text-gray-500 italic">None</span>}
              </span>
            </PendingFieldIndicator>
          )}
        </div>
      )}

    </OverlaySection>
  );
}

