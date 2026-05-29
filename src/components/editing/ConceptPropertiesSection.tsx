import React from 'react';
import { Concept, PendingChangeInfo } from '@/lib/types';
import { EditableField } from './types';
import { OverlaySection } from './OverlaySection';
import { PendingFieldIndicator } from '@/components/PendingChangeIndicator';

const CONCEPT_SUBTYPES = [
  'communication',
  'relation',
  'acquire',
  'assist',
  'attachment',
  'attempt',
  'avoidance',
  'bearing',
  'beginning',
  'body process',
  'characterization',
  'combination',
  'competition',
  'compulsion',
  'concealment',
  'conduct',
  'conflict',
  'consumption',
  'contact',
  'control access',
  'creation',
  'delay',
  'deprivation',
  'emission',
  'ending',
  'enrol',
  'expose',
  'failure',
  'give care',
  'group action',
  'host',
  'legal proceeding',
  'mental process',
  'motion',
  'natural process',
  'officiate',
  'ordering',
  'participation',
  'persistence',
  'prevention',
  'procedure',
  'progress',
  'protection',
  'put',
  'reach',
  'recreation',
  'resumption',
  'separation',
  'sexual intercourse',
  'subtraction',
  'termination',
  'transfer',
  'transformation',
  'work up',
  'quality',
  'configuration',
  'experience',
  'capacity',
  'tendency',
  'susceptibility',
  'status',
] as const;

const CONCEPT_ARCHETYPES = ['Event', 'State', 'Entity', 'Measure'] as const;

const STATE_KINDS = ['dimension', 'grade', 'taxon'] as const;

interface ConceptPropertiesSectionProps {
  concept: Concept;
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
  /**
   * Direct toggle for the boolean `disable_healthcheck` field — bypasses the
   * single-field text editor since the value is binary.
   */
  onToggleDisableHealthcheck?: (next: boolean) => Promise<void> | void;
}

export function ConceptPropertiesSection({
  concept,
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
  onToggleDisableHealthcheck,
}: ConceptPropertiesSectionProps) {
  const [togglingHealthcheck, setTogglingHealthcheck] = React.useState(false);
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
      title="Concept Properties"
      icon={
        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
      }
      isOpen={isOpen}
      onToggle={onToggle}
    >
      {/* Concept Name */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">
            Concept Name
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
              placeholder="Concept name"
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
            <span className="text-gray-900 text-sm font-semibold">{getDisplayValue('label', concept.label)}</span>
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
              placeholder="Concept definition"
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
            <span className="text-gray-900 text-sm">{getDisplayValue('definition', concept.definition)}</span>
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
            <span className="text-gray-900 text-sm">{getDisplayValue('short_definition', concept.short_definition)}</span>
          </PendingFieldIndicator>
        )}
      </div>

      {/* Subtype */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">
            Subtype
            {hasPendingField('subtype') && (
              <span className="ml-2 text-xs text-orange-600 font-normal">(pending)</span>
            )}
          </h3>
          {editingField !== 'subtype' && (
            <button
              onClick={() => onStartEdit('subtype')}
              className="text-xs text-blue-600 hover:text-blue-600 font-medium cursor-pointer"
            >
              Edit
            </button>
          )}
        </div>
        {editingField === 'subtype' ? (
          <div className="space-y-2">
            <select
              value={editValue}
              onChange={(e) => onValueChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              autoFocus
            >
              <option value="">(none)</option>
              {CONCEPT_SUBTYPES.map(st => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
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
          <PendingFieldIndicator fieldName="subtype" pending={pending}>
            {getDisplayValue('subtype', concept.subtype) ? (
              <span className="inline-flex px-2 py-0.5 rounded-full border text-xs font-medium bg-indigo-50 text-indigo-700 border-indigo-200">
                {getDisplayValue('subtype', concept.subtype)}
              </span>
            ) : (
              <span className="text-gray-400 text-sm italic">none</span>
            )}
          </PendingFieldIndicator>
        )}
      </div>

      {/* Archetype */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">
            Archetype
            {hasPendingField('archetype') && (
              <span className="ml-2 text-xs text-orange-600 font-normal">(pending)</span>
            )}
          </h3>
          {editingField !== 'archetype' && (
            <button
              onClick={() => onStartEdit('archetype')}
              className="text-xs text-blue-600 hover:text-blue-600 font-medium cursor-pointer"
            >
              Edit
            </button>
          )}
        </div>
        {editingField === 'archetype' ? (
          <div className="space-y-2">
            <select
              value={editValue}
              onChange={(e) => onValueChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              autoFocus
            >
              <option value="">(none)</option>
              {CONCEPT_ARCHETYPES.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
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
          <PendingFieldIndicator fieldName="archetype" pending={pending}>
            {getDisplayValue('archetype', concept.archetype) ? (
              <span className="inline-flex px-2 py-0.5 rounded-full border text-xs font-medium bg-purple-50 text-purple-700 border-purple-200">
                {getDisplayValue('archetype', concept.archetype)}
              </span>
            ) : (
              <span className="text-gray-400 text-sm italic">none</span>
            )}
          </PendingFieldIndicator>
        )}
      </div>

      {/* State Kind (only relevant for State archetype) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">
            State Kind
            {hasPendingField('state_kind') && (
              <span className="ml-2 text-xs text-orange-600 font-normal">(pending)</span>
            )}
          </h3>
          {editingField !== 'state_kind' && (
            <button
              onClick={() => onStartEdit('state_kind')}
              className="text-xs text-blue-600 hover:text-blue-600 font-medium cursor-pointer"
            >
              Edit
            </button>
          )}
        </div>
        {editingField === 'state_kind' ? (
          <div className="space-y-2">
            <select
              value={editValue}
              onChange={(e) => onValueChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              autoFocus
            >
              <option value="">(none)</option>
              {STATE_KINDS.map(sk => (
                <option key={sk} value={sk}>{sk}</option>
              ))}
            </select>
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
          <PendingFieldIndicator fieldName="state_kind" pending={pending}>
            {getDisplayValue('state_kind', concept.state_kind) ? (
              (() => {
                const value = getDisplayValue('state_kind', concept.state_kind);
                const chipClass =
                  value === 'grade'
                    ? 'bg-orange-50 text-orange-700 border-orange-200'
                    : value === 'dimension'
                      ? 'bg-violet-50 text-violet-700 border-violet-200'
                      : 'bg-gray-50 text-gray-700 border-gray-200';
                return (
                  <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-medium ${chipClass}`}>
                    {value}
                  </span>
                );
              })()
            ) : (
              <span className="text-gray-400 text-sm italic">none</span>
            )}
          </PendingFieldIndicator>
        )}
      </div>

      {/* Disable Health Check */}
      {onToggleDisableHealthcheck && (
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">
              Disable Health Checks
              {hasPendingField('disable_healthcheck') && (
                <span className="ml-2 text-xs text-orange-600 font-normal">(pending)</span>
              )}
            </h3>
          </div>
          <p className="text-xs text-gray-500 mb-2">
            Skip this concept when running health checks.
          </p>
          <PendingFieldIndicator fieldName="disable_healthcheck" pending={pending}>
            <label className="inline-flex items-center cursor-pointer gap-2">
              <input
                type="checkbox"
                checked={Boolean(getDisplayValue('disable_healthcheck', concept.disable_healthcheck))}
                disabled={togglingHealthcheck}
                onChange={async (e) => {
                  setTogglingHealthcheck(true);
                  try {
                    await onToggleDisableHealthcheck(e.target.checked);
                  } finally {
                    setTogglingHealthcheck(false);
                  }
                }}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">
                {getDisplayValue('disable_healthcheck', concept.disable_healthcheck)
                  ? 'Disabled'
                  : 'Enabled'}
              </span>
            </label>
          </PendingFieldIndicator>
        </div>
      )}

    </OverlaySection>
  );
}

