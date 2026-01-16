import React from 'react';
import FocusEntityCard from '@/components/pending/FocusEntityCard';

type JsonRecord = Record<string, unknown>;

type FieldChangeStatus = 'pending' | 'approved' | 'rejected';

export interface ContextFieldChange {
  field_name: string;
  old_value: unknown;
  new_value: unknown;
  status: FieldChangeStatus;
  old_display?: string;
  new_display?: string;
}

export interface PendingChangesContextSectionProps {
  entityType: string;
  operation: 'create' | 'update' | 'delete';
  entityId: string | null;
  beforeSnapshot: JsonRecord | null;
  afterSnapshot: JsonRecord | null;
  fieldChanges?: ContextFieldChange[];
}

function applyPreviewSnapshot(
  operation: 'create' | 'update' | 'delete',
  beforeSnapshot: JsonRecord | null,
  afterSnapshot: JsonRecord | null,
  fieldChanges: ContextFieldChange[]
): { current: JsonRecord | null; preview: JsonRecord | null } {
  if (operation === 'create') {
    return { current: null, preview: afterSnapshot ? { ...afterSnapshot } : null };
  }
  if (operation === 'delete') {
    return { current: beforeSnapshot ? { ...beforeSnapshot } : null, preview: null };
  }

  const current = beforeSnapshot ? { ...beforeSnapshot } : {};
  const preview: JsonRecord = { ...current };

  for (const fc of fieldChanges) {
    if (fc.status !== 'pending' && fc.status !== 'approved') continue;
    if (fc.field_name.includes('.')) continue;
    preview[fc.field_name] = fc.new_value;
  }

  return { current, preview };
}

/**
 * Context section shown in the Pending Changes detail modal.
 *
 * This section shows a dedicated 'Focus Entity' card at the top.
 */
export default function ContextSection(props: PendingChangesContextSectionProps) {
  const fieldChanges = props.fieldChanges ?? [];
  const { current, preview } = applyPreviewSnapshot(
    props.operation,
    props.beforeSnapshot,
    props.afterSnapshot,
    fieldChanges
  );

  const summarySnapshot = props.operation === 'create' ? preview : current;

  const getEntityLabel = () => {
    switch (props.entityType) {
      case 'frame':
        return 'Frame';
      case 'lexical_unit':
        return 'Lexical Entry';
      default:
        return props.entityType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-lg font-semibold text-gray-900">{getEntityLabel()}</div>
      {summarySnapshot ? (
        <FocusEntityCard
          entityType={props.entityType}
          entityId={props.entityId}
          summarySnapshot={summarySnapshot}
          subtle
          className="shadow-none"
        />
      ) : (
        <div className="p-4 rounded-xl border border-gray-200 bg-white text-sm text-gray-500">
          No details available for this focus entity.
        </div>
      )}
    </div>
  );
}
