'use client';

import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';
import ConceptInfoCard from './ConceptInfoCard';
import PlanContextPanel from './PlanContextPanel';
import {
  fetchProperties,
  getCachedProperties,
  isRealConceptId,
  type ConceptPropertyRow,
  type ConceptPropertiesPayload,
} from './propertiesCache';

/**
 * Snapshot of a single frame_role row, as captured on a pending
 * changeset's `before_snapshot` / `after_snapshot`. All fields are
 * optional so the panel can be defensive when the snapshot is partial
 * or stale.
 */
export interface RoleSnapshot {
  id?: string | null;
  label?: string | null;
  description?: string | null;
  notes?: string | null;
  main?: boolean | null;
  examples?: string[] | null;
}

export interface PropertyPanelProps {
  /** Real concept id from `snapshot.concept_id`. */
  conceptId: string | null;
  /** Used while the concept loads, and as the title for missing ids. */
  conceptLabelFallback?: string;
  /** Operation on the role row itself. */
  operation: 'create' | 'update' | 'delete';
  /** Snapshot of the property before the change. `null` for create. */
  before: RoleSnapshot | null;
  /** Snapshot of the property after the change. `null` for delete. */
  after: RoleSnapshot | null;
  /**
   * Stable id of the property row (matches one of the entries in
   * `ConceptPropertiesPayload.roles[].id`). For create ops on a not-yet-
   * committed property this can be null — we fall back to matching by
   * label, and otherwise just append the synthetic property.
   */
  propertyId: string | null;
}

/**
 * Always-visible rich panel for `entity_type='frame_role'` loose
 * changesets. Mirrors the visual language of the merge / move-sense
 * panels: a single `ConceptInfoCard` for the parent concept on top, and a
 * Before/After `PlanContextPanel` underneath listing every property on
 * the parent concept so the reviewer can see the change in context
 * (e.g. "did renaming this property accidentally collide with a sibling?").
 *
 * The edited property is highlighted green in the After column for create
 * / update, and red in the Before column for delete. Every other property
 * renders identically on both sides so the visual diff is purely
 * about the affected row.
 */
export default function PropertyPanel({
  conceptId,
  conceptLabelFallback,
  operation,
  before,
  after,
  propertyId,
}: PropertyPanelProps) {
  const [payload, setPayload] = useState<ConceptPropertiesPayload | null>(() =>
    getCachedProperties(conceptId),
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!conceptId || !isRealConceptId(conceptId)) {
      setPayload(null);
      return;
    }
    const cached = getCachedProperties(conceptId);
    if (cached) {
      setPayload(cached);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    void fetchProperties(conceptId, ac.signal).then((data) => {
      if (ac.signal.aborted) return;
      if (data) setPayload(data);
      setLoading(false);
    });
    return () => ac.abort();
  }, [conceptId]);

  const { beforeProperties, afterProperties, beforeCount, afterCount } = useMemo(
    () => deriveDiffedProperties({ payload, operation, before, after, propertyId }),
    [payload, operation, before, after, propertyId],
  );

  return (
    <div className="space-y-3">
      <ConceptInfoCard
        conceptId={conceptId}
        fallbackLabel={conceptLabelFallback}
        emphasis="focus"
        withPopover={false}
        hideSenses
      />

      {loading && !payload ? (
        <div className="flex items-center gap-2 text-[11px] text-gray-500 px-3 py-2">
          <LoadingSpinner size="sm" noPadding />
          Loading properties…
        </div>
      ) : (
        <PlanContextPanel
          beforeLabel={`Current properties (${beforeCount})`}
          afterLabel={`Proposed properties (${afterCount})`}
          beforeContent={<PropertyList rows={beforeProperties} />}
          afterContent={<PropertyList rows={afterProperties} />}
        />
      )}
    </div>
  );
}

// =====================================================================
// Diff derivation
// =====================================================================

type DiffMark = 'unchanged' | 'updated' | 'added' | 'removed';

interface DiffedPropertyRow extends ConceptPropertyRow {
  mark: DiffMark;
}

interface DeriveArgs {
  payload: ConceptPropertiesPayload | null;
  operation: 'create' | 'update' | 'delete';
  before: RoleSnapshot | null;
  after: RoleSnapshot | null;
  propertyId: string | null;
}

interface DerivedProperties {
  beforeProperties: DiffedPropertyRow[];
  afterProperties: DiffedPropertyRow[];
  beforeCount: number;
  afterCount: number;
}

/**
 * Build the Before/After role lists by walking the cached roles list
 * (which still contains the unmodified role row, since the changeset
 * is pending) and overlaying the snapshot edits.
 *
 * For `create` we synthesise a row from `after` and append it to the
 * After column. For `update` we merge the after-snapshot fields onto
 * the cached base row so unchanged fields (description, examples,
 * notes, …) still appear in the proposed column even if the writer
 * only stamped the changed field on the snapshot. For `delete` we
 * drop the matching row from After and mark the same row as
 * `removed` in Before.
 */
function deriveDiffedProperties({
  payload,
  operation,
  before,
  after,
  propertyId,
}: DeriveArgs): DerivedProperties {
  const baseProperties: ConceptPropertyRow[] = payload?.roles ?? [];

  const findPropertyIndex = (
    ...snapshots: (RoleSnapshot | null | undefined)[]
  ): number => {
    if (propertyId) {
      const i = baseProperties.findIndex((r) => r.id === propertyId);
      if (i >= 0) return i;
    }
    for (const snap of snapshots) {
      const label = snap?.label;
      if (typeof label === 'string' && label) {
        const i = baseProperties.findIndex((r) => r.label === label);
        if (i >= 0) return i;
      }
    }
    return -1;
  };

  const beforeUnchanged: DiffedPropertyRow[] = baseProperties.map((r) => ({
    ...r,
    mark: 'unchanged',
  }));
  const afterUnchanged: DiffedPropertyRow[] = baseProperties.map((r) => ({
    ...r,
    mark: 'unchanged',
  }));

  if (operation === 'create') {
    const synthetic = propertyFromSnapshot(after, propertyId, after?.label ?? '(new property)');
    afterUnchanged.push({ ...synthetic, mark: 'added' });
    return {
      beforeProperties: beforeUnchanged,
      afterProperties: afterUnchanged,
      beforeCount: beforeUnchanged.length,
      afterCount: afterUnchanged.length,
    };
  }

  if (operation === 'update') {
    const idx = findPropertyIndex(after, before);
    const baseRow = idx >= 0 ? baseProperties[idx] : null;
    const merged = mergePropertyWithBase(after, baseRow, propertyId);
    if (idx >= 0) {
      afterUnchanged[idx] = { ...merged, mark: 'updated' };
    } else {
      afterUnchanged.push({ ...merged, mark: 'updated' });
    }
    return {
      beforeProperties: beforeUnchanged,
      afterProperties: afterUnchanged,
      beforeCount: beforeUnchanged.length,
      afterCount: afterUnchanged.length,
    };
  }

  // delete
  const idx = findPropertyIndex(before);
  if (idx >= 0) {
    beforeUnchanged[idx] = { ...beforeUnchanged[idx], mark: 'removed' };
    afterUnchanged.splice(idx, 1);
  } else {
    const fallback = propertyFromSnapshot(before, propertyId, before?.label ?? '(deleted property)');
    beforeUnchanged.push({ ...fallback, mark: 'removed' });
  }
  return {
    beforeProperties: beforeUnchanged,
    afterProperties: afterUnchanged,
    beforeCount: beforeUnchanged.length,
    afterCount: afterUnchanged.length,
  };
}

/**
 * Synthesise a `ConceptPropertyRow` from a snapshot only — used for create
 * and delete, where there is no cached base row to merge with.
 * Missing fields become null / empty defaults.
 */
function propertyFromSnapshot(
  snap: RoleSnapshot | null,
  fallbackId: string | null,
  fallbackLabel: string,
): ConceptPropertyRow {
  return {
    id: snap?.id ?? fallbackId ?? `synthetic-${fallbackLabel}`,
    label: snap?.label ?? fallbackLabel,
    description: snap?.description ?? null,
    notes: snap?.notes ?? null,
    main: Boolean(snap?.main),
    examples: Array.isArray(snap?.examples)
      ? snap!.examples!.filter((x): x is string => typeof x === 'string')
      : [],
  };
}

/**
 * Build the proposed `ConceptPropertyRow` for an `update`. Fields the
 * writer touched (present on the snapshot — not `undefined`) win;
 * fields the writer didn't touch fall back to the cached base row so
 * the reviewer sees the role's full identity, not just the changed
 * column.
 *
 * `null` on the snapshot still wins over the base value — that means
 * the writer explicitly cleared the field, which is rare for
 * `frame_role` but real (e.g. removing all notes).
 */
function mergePropertyWithBase(
  snap: RoleSnapshot | null,
  baseRow: ConceptPropertyRow | null,
  fallbackId: string | null,
): ConceptPropertyRow {
  const fallbackLabel = baseRow?.label ?? snap?.label ?? '(property)';
  return {
    id: snap?.id ?? baseRow?.id ?? fallbackId ?? `synthetic-${fallbackLabel}`,
    label: snap?.label !== undefined ? (snap.label ?? fallbackLabel) : (baseRow?.label ?? fallbackLabel),
    description: snap?.description !== undefined ? snap.description : (baseRow?.description ?? null),
    notes: snap?.notes !== undefined ? snap.notes : (baseRow?.notes ?? null),
    main: snap?.main !== undefined ? Boolean(snap.main) : Boolean(baseRow?.main),
    examples: snap?.examples !== undefined
      ? (Array.isArray(snap.examples) ? snap.examples : [])
      : (baseRow?.examples ?? []),
  };
}

// =====================================================================
// Property list renderer
// =====================================================================

function PropertyList({ rows }: { rows: DiffedPropertyRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="text-[11px] italic text-gray-500 px-2 py-1.5">
        No properties defined.
      </div>
    );
  }
  return (
    <ul className="space-y-1.5">
      {rows.map((row) => (
        <PropertyCard key={`${row.id}-${row.mark}`} row={row} />
      ))}
    </ul>
  );
}

const MARK_STYLES: Record<DiffMark, { container: string; chip: string; tag: string | null }> = {
  unchanged: {
    container: 'border-gray-200 bg-gray-50/50',
    chip: 'bg-white border-gray-200 text-gray-600',
    tag: null,
  },
  updated: {
    container: 'border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200',
    chip: 'bg-white border-emerald-200 text-emerald-700',
    tag: 'Updated',
  },
  added: {
    container: 'border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200',
    chip: 'bg-white border-emerald-200 text-emerald-700',
    tag: 'New',
  },
  removed: {
    container: 'border-red-300 bg-red-50 ring-1 ring-red-200',
    chip: 'bg-white border-red-200 text-red-700',
    tag: 'Removed',
  },
};

function PropertyCard({ row }: { row: DiffedPropertyRow }) {
  const style = MARK_STYLES[row.mark];
  const label = row.label ?? '(unnamed property)';
  return (
    <li
      className={`rounded-md border px-2 py-1.5 ${style.container}`}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wide ${style.chip}`}
        >
          {label}
        </span>
        {row.main && (
          <span className="text-[9px] font-bold uppercase tracking-wider text-blue-700">
            Main
          </span>
        )}
        {style.tag && (
          <span
            className={`ml-auto text-[9px] font-bold uppercase tracking-wider ${
              row.mark === 'removed' ? 'text-red-700' : 'text-emerald-700'
            }`}
          >
            {style.tag}
          </span>
        )}
      </div>
      {row.description && (
        <p
          className={`mt-1 text-[11px] leading-snug line-clamp-3 ${
            row.mark === 'removed' ? 'text-red-900' : 'text-gray-700'
          }`}
        >
          {row.description}
        </p>
      )}
      {row.notes && (
        <p
          className={`mt-1 text-[10px] italic leading-snug line-clamp-2 ${
            row.mark === 'removed' ? 'text-red-800' : 'text-gray-600'
          }`}
        >
          Note: {row.notes}
        </p>
      )}
      {row.examples.length > 0 && (
        <ul
          className={`mt-1 space-y-0.5 text-[11px] italic leading-snug ${
            row.mark === 'removed' ? 'text-red-800' : 'text-gray-700'
          }`}
        >
          {row.examples.slice(0, 4).map((ex, i) => (
            <li key={i} className="line-clamp-2">
              &ldquo;{renderPropertyExample(ex)}&rdquo;
            </li>
          ))}
          {row.examples.length > 4 && (
            <li className="not-italic text-[10px] text-gray-400">
              +{row.examples.length - 4} more
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

/**
 * Role examples wrap their highlighted filler in `<<…>>` (matching
 * `DEFAULT_CHEVRON_PATTERN` in the health-check rules). Render the
 * wrapped span as bold text and strip the literal chevrons so the
 * reviewer sees the filler emphasised, not the markup.
 */
const PROPERTY_EXAMPLE_CHEVRON_RE = /<<([^<>]+)>>/g;
function renderPropertyExample(example: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  PROPERTY_EXAMPLE_CHEVRON_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PROPERTY_EXAMPLE_CHEVRON_RE.exec(example)) !== null) {
    if (match.index > lastIndex) {
      parts.push(example.slice(lastIndex, match.index));
    }
    parts.push(
      <strong key={key++} className="font-semibold">
        {match[1]}
      </strong>,
    );
    lastIndex = PROPERTY_EXAMPLE_CHEVRON_RE.lastIndex;
  }
  if (lastIndex < example.length) {
    parts.push(example.slice(lastIndex));
  }
  return parts;
}
