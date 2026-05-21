'use client';

import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';
import FrameInfoCard from './FrameInfoCard';
import PlanContextPanel from './PlanContextPanel';
import {
  fetchFrameRoles,
  getCachedFrameRoles,
  isRealFrameId,
  type FrameRoleRow,
  type FrameRolesPayload,
} from './frameRolesCache';

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

export interface FrameRolePanelProps {
  /** Real frame id from `snapshot.frame_id`. */
  frameId: string | null;
  /** Used while the frame loads, and as the title for missing ids. */
  frameLabelFallback?: string;
  /** Operation on the role row itself. */
  operation: 'create' | 'update' | 'delete';
  /** Snapshot of the role before the change. `null` for create. */
  before: RoleSnapshot | null;
  /** Snapshot of the role after the change. `null` for delete. */
  after: RoleSnapshot | null;
  /**
   * Stable id of the role row (matches one of the entries in
   * `FrameRolesPayload.roles[].id`). For create ops on a not-yet-
   * committed role this can be null — we fall back to matching by
   * label, and otherwise just append the synthetic role.
   */
  roleId: string | null;
}

/**
 * Always-visible rich panel for `entity_type='frame_role'` loose
 * changesets. Mirrors the visual language of the merge / move-sense
 * panels: a single `FrameInfoCard` for the parent frame on top, and a
 * Before/After `PlanContextPanel` underneath listing every role on
 * the parent frame so the reviewer can see the change in context
 * (e.g. "did renaming this role accidentally collide with a sibling?").
 *
 * The edited role is highlighted green in the After column for create
 * / update, and red in the Before column for delete. Every other role
 * renders identically on both sides so the visual diff is purely
 * about the affected row.
 */
export default function FrameRolePanel({
  frameId,
  frameLabelFallback,
  operation,
  before,
  after,
  roleId,
}: FrameRolePanelProps) {
  const [payload, setPayload] = useState<FrameRolesPayload | null>(() =>
    getCachedFrameRoles(frameId),
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!frameId || !isRealFrameId(frameId)) {
      setPayload(null);
      return;
    }
    const cached = getCachedFrameRoles(frameId);
    if (cached) {
      setPayload(cached);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    void fetchFrameRoles(frameId, ac.signal).then((data) => {
      if (ac.signal.aborted) return;
      if (data) setPayload(data);
      setLoading(false);
    });
    return () => ac.abort();
  }, [frameId]);

  const { beforeRoles, afterRoles, beforeCount, afterCount } = useMemo(
    () => deriveDiffedRoles({ payload, operation, before, after, roleId }),
    [payload, operation, before, after, roleId],
  );

  return (
    <div className="space-y-3">
      <FrameInfoCard
        frameId={frameId}
        fallbackLabel={frameLabelFallback}
        emphasis="focus"
        withPopover={false}
        hideSenses
      />

      {loading && !payload ? (
        <div className="flex items-center gap-2 text-[11px] text-gray-500 px-3 py-2">
          <LoadingSpinner size="sm" noPadding />
          Loading roles…
        </div>
      ) : (
        <PlanContextPanel
          beforeLabel={`Current roles (${beforeCount})`}
          afterLabel={`Proposed roles (${afterCount})`}
          beforeContent={<RoleList rows={beforeRoles} />}
          afterContent={<RoleList rows={afterRoles} />}
        />
      )}
    </div>
  );
}

// =====================================================================
// Diff derivation
// =====================================================================

type DiffMark = 'unchanged' | 'updated' | 'added' | 'removed';

interface DiffedRoleRow extends FrameRoleRow {
  mark: DiffMark;
}

interface DeriveArgs {
  payload: FrameRolesPayload | null;
  operation: 'create' | 'update' | 'delete';
  before: RoleSnapshot | null;
  after: RoleSnapshot | null;
  roleId: string | null;
}

interface DerivedRoles {
  beforeRoles: DiffedRoleRow[];
  afterRoles: DiffedRoleRow[];
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
function deriveDiffedRoles({
  payload,
  operation,
  before,
  after,
  roleId,
}: DeriveArgs): DerivedRoles {
  const baseRoles: FrameRoleRow[] = payload?.roles ?? [];

  /**
   * Pick the index of the role this changeset is editing. Prefer
   * matching by id (the stable identifier). Fall back to label match
   * across whichever snapshots the caller offers — `after` first
   * because that's the proposed shape, then `before` so we still
   * find the row when the writer only stamped non-label fields on
   * `after` (e.g. an examples-only update).
   */
  const findRoleIndex = (
    ...snapshots: (RoleSnapshot | null | undefined)[]
  ): number => {
    if (roleId) {
      const i = baseRoles.findIndex((r) => r.id === roleId);
      if (i >= 0) return i;
    }
    for (const snap of snapshots) {
      const label = snap?.label;
      if (typeof label === 'string' && label) {
        const i = baseRoles.findIndex((r) => r.label === label);
        if (i >= 0) return i;
      }
    }
    return -1;
  };

  const beforeUnchanged: DiffedRoleRow[] = baseRoles.map((r) => ({
    ...r,
    mark: 'unchanged',
  }));
  const afterUnchanged: DiffedRoleRow[] = baseRoles.map((r) => ({
    ...r,
    mark: 'unchanged',
  }));

  if (operation === 'create') {
    const synthetic = roleFromSnapshot(after, roleId, after?.label ?? '(new role)');
    afterUnchanged.push({ ...synthetic, mark: 'added' });
    // Before: the create hasn't landed yet, so the parent's current
    // roles list is exactly what we already rendered as `unchanged`.
    return {
      beforeRoles: beforeUnchanged,
      afterRoles: afterUnchanged,
      beforeCount: beforeUnchanged.length,
      afterCount: afterUnchanged.length,
    };
  }

  if (operation === 'update') {
    const idx = findRoleIndex(after, before);
    const baseRow = idx >= 0 ? baseRoles[idx] : null;
    const merged = mergeRoleWithBase(after, baseRow, roleId);
    if (idx >= 0) {
      afterUnchanged[idx] = { ...merged, mark: 'updated' };
    } else {
      // We couldn't find the role in the cached list (probably stale
      // cache or an id mismatch). Append it so the reviewer still
      // sees the proposed shape rather than a silent miss.
      afterUnchanged.push({ ...merged, mark: 'updated' });
    }
    return {
      beforeRoles: beforeUnchanged,
      afterRoles: afterUnchanged,
      beforeCount: beforeUnchanged.length,
      afterCount: afterUnchanged.length,
    };
  }

  // delete
  const idx = findRoleIndex(before);
  if (idx >= 0) {
    beforeUnchanged[idx] = { ...beforeUnchanged[idx], mark: 'removed' };
    afterUnchanged.splice(idx, 1);
  } else {
    // Couldn't find the role in cache; surface what we do know from
    // the before snapshot so the reviewer isn't staring at "nothing
    // changed" on a delete.
    const fallback = roleFromSnapshot(before, roleId, before?.label ?? '(deleted role)');
    beforeUnchanged.push({ ...fallback, mark: 'removed' });
  }
  return {
    beforeRoles: beforeUnchanged,
    afterRoles: afterUnchanged,
    beforeCount: beforeUnchanged.length,
    // The After list dropped the deleted role, so beforeCount stays
    // the parent's full count and afterCount reflects the projected
    // post-commit count.
    afterCount: afterUnchanged.length,
  };
}

/**
 * Synthesise a `FrameRoleRow` from a snapshot only — used for create
 * and delete, where there is no cached base row to merge with.
 * Missing fields become null / empty defaults.
 */
function roleFromSnapshot(
  snap: RoleSnapshot | null,
  fallbackId: string | null,
  fallbackLabel: string,
): FrameRoleRow {
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
 * Build the proposed `FrameRoleRow` for an `update`. Fields the
 * writer touched (present on the snapshot — not `undefined`) win;
 * fields the writer didn't touch fall back to the cached base row so
 * the reviewer sees the role's full identity, not just the changed
 * column.
 *
 * `null` on the snapshot still wins over the base value — that means
 * the writer explicitly cleared the field, which is rare for
 * `frame_role` but real (e.g. removing all notes).
 */
function mergeRoleWithBase(
  snap: RoleSnapshot | null,
  baseRow: FrameRoleRow | null,
  fallbackId: string | null,
): FrameRoleRow {
  const fallbackLabel = baseRow?.label ?? snap?.label ?? '(role)';
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
// Role list renderer
// =====================================================================

function RoleList({ rows }: { rows: DiffedRoleRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="text-[11px] italic text-gray-500 px-2 py-1.5">
        No roles defined.
      </div>
    );
  }
  return (
    <ul className="space-y-1.5">
      {rows.map((row) => (
        <RoleCard key={`${row.id}-${row.mark}`} row={row} />
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

function RoleCard({ row }: { row: DiffedRoleRow }) {
  const style = MARK_STYLES[row.mark];
  const label = row.label ?? '(unnamed role)';
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
              &ldquo;{renderRoleExample(ex)}&rdquo;
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
const ROLE_EXAMPLE_CHEVRON_RE = /<<([^<>]+)>>/g;
function renderRoleExample(example: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  ROLE_EXAMPLE_CHEVRON_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ROLE_EXAMPLE_CHEVRON_RE.exec(example)) !== null) {
    if (match.index > lastIndex) {
      parts.push(example.slice(lastIndex, match.index));
    }
    parts.push(
      <strong key={key++} className="font-semibold">
        {match[1]}
      </strong>,
    );
    lastIndex = ROLE_EXAMPLE_CHEVRON_RE.lastIndex;
  }
  if (lastIndex < example.length) {
    parts.push(example.slice(lastIndex));
  }
  return parts;
}
