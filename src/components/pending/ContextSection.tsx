import React from 'react';
import FrameReallocationContext from '@/components/pending/context/FrameReallocationContext';
import LexicalUnitReallocationContext from '@/components/pending/context/LexicalUnitReallocationContext';

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

const META_KEYS = new Set([
  'id',
  'created_at',
  'updated_at',
  'version',
  'deleted',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isIntLikeString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^-?\d+$/.test(value.trim());
}

function normalizeIntLike(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return /^-?\d+$/.test(trimmed) ? trimmed : null;
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) return null;
    return String(value);
  }
  if (typeof value === 'bigint') return value.toString();
  return null;
}

function truncateText(input: string, maxLen: number): string {
  const s = input.trim();
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '…';
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'string') return value.trim() === '' ? '""' : truncateText(value, 280);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const allStrings = value.every(v => typeof v === 'string');
    if (allStrings) {
      const items = (value as string[]).slice(0, 8).map(v => truncateText(v, 48));
      const more = value.length > 8 ? `, …(+${value.length - 8})` : '';
      return `[${items.join(', ')}${more}]`;
    }
    const items = value.slice(0, 4).map(v => truncateText(JSON.stringify(v), 80));
    const more = value.length > 4 ? `, …(+${value.length - 4})` : '';
    return `[${items.join(', ')}${more}]`;
  }

  try {
    return truncateText(JSON.stringify(value), 320);
  } catch {
    return String(value);
  }
}

function getPreferredKeys(entityType: string): string[] {
  switch (entityType) {
    case 'frame':
      return ['label', 'code', 'short_definition', 'definition', 'super_frame_id'];
    case 'lexical_unit':
      return ['code', 'pos', 'lemmas', 'gloss', 'frame_id', 'lexfile', 'is_mwe'];
    case 'lexical_unit_relation':
      return ['type', 'source_id', 'target_id', 'properties'];
    case 'frame_role':
      return ['label', 'role_type_id', 'description', 'notes', 'main', 'examples'];
    case 'frame_relation':
      return ['type', 'source_frame_id', 'target_frame_id', 'notes', 'properties'];
    case 'recipe':
      return ['label', 'description', 'notes'];
    default:
      return ['label', 'code', 'gloss', 'short_definition', 'definition'];
  }
}

function listDisplayPairs(entityType: string, snapshot: JsonRecord): Array<{ key: string; value: string; raw: unknown }> {
  const preferred = getPreferredKeys(entityType);
  const keys = Object.keys(snapshot).filter(k => !META_KEYS.has(k));
  const rest = keys.filter(k => !preferred.includes(k)).sort((a, b) => a.localeCompare(b));
  const ordered = [...preferred.filter(k => k in snapshot), ...rest];
  const limited = ordered.slice(0, 10);
  return limited.map(key => ({ key, value: formatValue(snapshot[key]), raw: snapshot[key] }));
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
    // Ignore nested keys like frame_roles.*; generic context focuses on top-level scalar-ish fields.
    if (fc.field_name.includes('.')) continue;
    preview[fc.field_name] = fc.new_value;
  }

  return { current, preview };
}

function renderSnapshotCard(opts: {
  title: string;
  subtitle?: string;
  entityType: string;
  snapshot: JsonRecord;
}) {
  const pairs = listDisplayPairs(opts.entityType, opts.snapshot);
  return (
    <div className="p-4 rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">{opts.title}</div>
          {opts.subtitle && <div className="text-xs text-gray-500 mt-0.5">{opts.subtitle}</div>}
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {pairs.map(({ key, value, raw }) => (
          <div key={key} className="flex items-start gap-3 text-sm">
            <div className="w-40 flex-shrink-0 font-mono text-xs text-gray-500 truncate" title={key}>
              {key}
            </div>
            <div className="flex-1 min-w-0 text-gray-900 break-words" title={typeof raw === 'string' ? raw : undefined}>
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Context section shown in the Pending Changes detail modal.
 *
 * This section shows a generic snapshot-based summary for all changesets.
 * Specialized reallocation contexts are added in subsequent tasks.
 */
export default function ContextSection(props: PendingChangesContextSectionProps) {
  const fieldChanges = props.fieldChanges ?? [];
  const { current, preview } = applyPreviewSnapshot(
    props.operation,
    props.beforeSnapshot,
    props.afterSnapshot,
    fieldChanges
  );

  const superFrameIdChange = fieldChanges.find(fc => fc.field_name === 'super_frame_id');
  const shouldShowSuperFrameReallocation =
    props.entityType === 'frame' &&
    props.operation === 'update' &&
    Boolean(props.entityId) &&
    Boolean(superFrameIdChange) &&
    superFrameIdChange?.status !== 'rejected';

  const hasEntityId = typeof props.entityId === 'string' && props.entityId.trim() !== '';

  const frameIdChange = fieldChanges.find(fc => fc.field_name === 'frame_id');
  const shouldShowLexicalUnitReallocation =
    props.entityType === 'lexical_unit' &&
    props.operation === 'update' &&
    Boolean(props.entityId) &&
    Boolean(frameIdChange) &&
    frameIdChange?.status !== 'rejected';

  const isSpecialized = shouldShowSuperFrameReallocation || shouldShowLexicalUnitReallocation;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Context</div>
          <div className="mt-1 text-sm text-gray-600">
            <span className="font-mono text-xs text-gray-500">{props.entityType}</span>
            <span className="text-gray-300 mx-2">•</span>
            <span className="text-xs font-semibold text-gray-500 uppercase">{props.operation}</span>
            {props.entityId && (
              <>
                <span className="text-gray-300 mx-2">•</span>
                <span className="text-xs text-gray-500">#{props.entityId}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {shouldShowSuperFrameReallocation && props.entityId && (
        <FrameReallocationContext
          frameId={props.entityId}
          oldSuperFrameRef={normalizeIntLike(superFrameIdChange?.old_value)}
          newSuperFrameRef={normalizeIntLike(superFrameIdChange?.new_value)}
        />
      )}

      {shouldShowLexicalUnitReallocation && props.entityId && (
        <LexicalUnitReallocationContext
          lexicalUnitId={props.entityId}
          oldFrameRef={normalizeIntLike(frameIdChange?.old_value)}
          newFrameRef={normalizeIntLike(frameIdChange?.new_value)}
          snapshot={preview}
        />
      )}

      {!isSpecialized && (
        <>
          {props.operation === 'update' && preview ? (
            renderSnapshotCard({
              title: 'Entity summary',
              entityType: props.entityType,
              snapshot: preview,
            })
          ) : props.operation === 'create' && preview ? (
            renderSnapshotCard({
              title: 'Entity summary',
              entityType: props.entityType,
              snapshot: preview,
            })
          ) : props.operation === 'delete' && current ? (
            renderSnapshotCard({
              title: 'Entity summary',
              entityType: props.entityType,
              snapshot: current,
            })
          ) : (
            <div className="p-4 rounded-xl border border-gray-200 bg-white text-sm text-gray-500">
              No snapshot data available for this changeset.
            </div>
          )}
        </>
      )}
    </div>
  );
}

