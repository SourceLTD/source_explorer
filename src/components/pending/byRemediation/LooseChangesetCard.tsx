'use client';

import { useState } from 'react';
import {
  CheckCircleIcon,
  XCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ArrowTopRightOnSquareIcon,
  PlusCircleIcon,
  PencilSquareIcon,
  TrashIcon,
  ArrowsRightLeftIcon,
  ArrowsPointingInIcon,
} from '@heroicons/react/24/outline';
import LoadingSpinner from '@/components/LoadingSpinner';
import { RevisionButton } from '@/components/editing/RevisionButton';
import { RevisionModal } from '@/components/editing/RevisionModal';
import { RevisionNavigator } from '@/components/editing/RevisionNavigator';
import FrameInfoCard from '@/components/pending/context/FrameInfoCard';
import FrameRefPopover from '@/components/pending/context/FrameRefPopover';
import FrameRolePanel, {
  type RoleSnapshot,
} from '@/components/pending/context/FrameRolePanel';
import PlanContextPanel from '@/components/pending/context/PlanContextPanel';
import {
  formatUserName,
  getEntityDisplayName,
  operationBadgeClass,
  summarizeChangeset,
  formatFieldNameShort,
} from './changesetDisplay';
import type { ByRemediationChangeset } from './types';

export interface LooseChangesetCardProps {
  cs: ByRemediationChangeset;
  isBusy: boolean;
  busyAction: 'commit' | 'reject' | null;
  /** Disable buttons when another row in this bucket is busy. */
  disabled: boolean;
  onCommit: () => void;
  onReject: () => void;
  /** Optional deep-link to the legacy detail modal. */
  onOpen?: () => void;
  /** Called when a revision produces a new changeset (refreshes the list). */
  onRevisionComplete?: (newChangesetId: string) => void;
}

/**
 * Rich, always-visible card for a single loose pending changeset.
 *
 * Mirrors the layout of `PlanCard` so the by-issue inbox reads as
 * one consistent surface regardless of whether the bucket holds an
 * N-step plan (rendered through `PlanCard`) or a one-off field
 * update (rendered here):
 *
 *   - header with operation badge + entity reference + commit/reject CTAs
 *   - a `FrameInfoCard` for entity context (when the entity is a frame
 *     or a frame_relation)
 *   - a `PlanContextPanel` showing the field diff for `update` ops
 *   - a coloured callout for `create`, `delete`, `move` ops
 *   - a "Show raw field changes" expander that surfaces the original
 *     compact field-by-field diff for power users
 */
export default function LooseChangesetCard({
  cs,
  isBusy,
  busyAction,
  disabled,
  onCommit,
  onReject,
  onOpen,
  onRevisionComplete,
}: LooseChangesetCardProps) {
  const [showRaw, setShowRaw] = useState(false);
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const entityDisplay = getEntityDisplayName(cs);
  const summary = summarizeChangeset(cs);

  const pendingFieldChanges = cs.field_changes.filter(
    (f) => f.status === 'pending',
  );

  const opIcon = operationIcon(cs.operation);
  const kindLabel = changesetKindLabel(cs);
  const changeCount =
    cs.operation === 'update'
      ? Math.max(pendingFieldChanges.length, 1)
      : 1;

  return (
    <article className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header mirrors PlanCard exactly: icon · kind label · status pill ·
          #id · N changes — followed by Reject/Commit on the right. */}
      <header className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-gray-600">{opIcon}</span>
            <h3 className="text-sm font-semibold text-gray-900">{kindLabel}</h3>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium capitalize bg-amber-100 text-amber-800 border-amber-200">
              Pending
            </span>
            <span className="text-xs text-gray-500 font-mono">#{cs.id}</span>
            <span className="text-xs text-gray-500">
              {changeCount} change{changeCount === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onOpen && (
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-md bg-white hover:bg-gray-50"
              title="Open in detail view"
            >
              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
            </button>
          )}
          <RevisionButton
            onClick={() => setRevisionModalOpen(true)}
            disabled={isBusy || disabled}
            revisionCount={cs.revision_number}
          />
          <button
            type="button"
            onClick={onReject}
            disabled={isBusy || disabled}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 border border-red-200 rounded-md bg-white hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Reject changeset"
          >
            {isBusy && busyAction === 'reject' ? (
              <LoadingSpinner size="sm" noPadding />
            ) : (
              <XCircleIcon className="w-4 h-4" />
            )}
            Discard
          </button>
          <button
            type="button"
            onClick={onCommit}
            disabled={isBusy || disabled}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Commit changeset"
          >
            {isBusy && busyAction === 'commit' ? (
              <LoadingSpinner size="sm" noPadding />
            ) : (
              <CheckCircleIcon className="w-4 h-4" />
            )}
            Commit change
          </button>
        </div>
      </header>

      <div className="p-4 space-y-3">
        {/* Single-line "subject" strip: the entity reference + summary +
            attribution. Matches the chip-row line that reparent /
            split / merge / etc. render at the top of their bodies. */}
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${operationBadgeClass(
              cs.operation,
            )}`}
          >
            {cs.operation}
          </span>
          <FrameRefPopover
            frameId={cs.entity_type === 'frame' ? cs.entity_id : null}
            fallbackLabel={entityDisplay}
          >
            {onOpen ? (
              <button
                type="button"
                onClick={onOpen}
                className="font-mono px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-800 hover:bg-blue-100 cursor-pointer truncate max-w-[420px]"
                title={entityDisplay}
              >
                {entityDisplay}
              </button>
            ) : (
              <span
                className="font-mono px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-800 truncate max-w-[420px]"
                title={entityDisplay}
              >
                {entityDisplay}
              </span>
            )}
          </FrameRefPopover>
          <span className="text-gray-400">·</span>
          <span className="text-xs text-gray-500">{summary}</span>
          <span className="ml-auto text-[11px] text-gray-400">
            {formatUserName(cs.created_by)} ·{' '}
            {new Date(cs.created_at).toLocaleDateString()}
          </span>
        </div>

        <ChangesetEntityContext cs={cs} />
        <ChangesetBody cs={cs} pendingFieldChanges={pendingFieldChanges} />

        {(cs.revision_number ?? 1) > 1 && (
          <RevisionNavigator
            changesetId={cs.id}
            revisionNumber={cs.revision_number}
            onRequestRevision={() => setRevisionModalOpen(true)}
          />
        )}

        {pendingFieldChanges.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              {showRaw ? (
                <ChevronDownIcon className="w-3.5 h-3.5" />
              ) : (
                <ChevronRightIcon className="w-3.5 h-3.5" />
              )}
              {showRaw ? 'Hide' : 'Show'} {pendingFieldChanges.length} field
              change{pendingFieldChanges.length === 1 ? '' : 's'}
            </button>
            {showRaw && (
              <ul className="mt-2 divide-y divide-gray-100 border border-gray-200 rounded-md bg-white">
                {pendingFieldChanges.map((fc) => (
                  <li
                    key={fc.id}
                    className="px-3 py-2 text-xs flex items-baseline gap-2"
                  >
                    <span className="font-mono text-blue-600 shrink-0">
                      {formatFieldNameShort(fc.field_name)}
                    </span>
                    <span className="text-gray-400 line-through truncate flex-1">
                      {fc.old_display ?? formatLooseValue(fc.old_value)}
                    </span>
                    <span className="text-gray-300 shrink-0">→</span>
                    <span className="text-gray-900 font-medium truncate flex-1">
                      {fc.new_display ?? formatLooseValue(fc.new_value)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <RevisionModal
        changesetId={cs.id}
        entitySummary={`${changesetKindLabel(cs)}: ${entityDisplay}`}
        isOpen={revisionModalOpen}
        onClose={() => setRevisionModalOpen(false)}
        onRevisionComplete={(newId) => {
          setRevisionModalOpen(false);
          onRevisionComplete?.(newId);
        }}
      />
    </article>
  );
}

// =====================================================================
// Entity context: most entity types are already named by the chip +
// popover in the subject strip and (for updates) by the field diff
// below, so rendering an extra identity card would be redundant. Four
// types need richer chrome here:
//   - `frame_relation` has two ends (source / target) the strip can't
//     show, so we render a pair of frame cards with the relation type
//     in the middle.
//   - `frame_role` is a row that lives under a parent frame and only
//     makes sense in the context of its sibling roles, so we render a
//     dedicated `FrameRolePanel` (parent identity + Before/After role
//     diff) and `ChangesetBody` short-circuits the generic field diff.
//   - `frame_sense` is anchored to a single frame via `frame_id`; the
//     subject strip names the sense but not the frame, so we surface
//     a slim parent FrameInfoCard above the field diff.
//   - `frame_role_mapping` ties a parent_of edge to a (parent_role,
//     child_role) pair. We render the parent and child frames at the
//     ends of an inheritance arrow with the role labels stacked on
//     top — same visual language the relation branch uses.
// =====================================================================
function ChangesetEntityContext({ cs }: { cs: ByRemediationChangeset }) {
  if (cs.entity_type === 'frame_relation') {
    const snapshot = cs.before_snapshot ?? cs.after_snapshot ?? {};
    const sourceId = pickIdLike(snapshot.source_id);
    const targetId = pickIdLike(snapshot.target_id);
    const sourceLabel =
      (snapshot.source_label as string | undefined) ??
      `Source ${sourceId ?? '?'}`;
    const targetLabel =
      (snapshot.target_label as string | undefined) ??
      `Target ${targetId ?? '?'}`;
    const relType = (snapshot.type as string | undefined) ?? 'relation';
    return (
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
        <FrameInfoCard
          frameId={sourceId}
          fallbackLabel={sourceLabel}
          emphasis="origin"
          hideSenses
        />
        <div className="flex flex-col items-center justify-center gap-1 px-2">
          <span className="text-[10px] font-mono text-gray-500 px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200">
            {relType}
          </span>
          <span className="text-2xl leading-none text-gray-400">→</span>
        </div>
        <FrameInfoCard
          frameId={targetId}
          fallbackLabel={targetLabel}
          emphasis="destination"
          hideSenses
        />
      </div>
    );
  }

  if (cs.entity_type === 'frame_role') {
    const op = (cs.operation === 'create' || cs.operation === 'delete')
      ? cs.operation
      : 'update';
    const before = readRoleSnapshot(cs.before_snapshot);
    const after = readRoleSnapshot(cs.after_snapshot);
    const frameId =
      pickIdLike(cs.before_snapshot?.frame_id) ??
      pickIdLike(cs.after_snapshot?.frame_id);
    // Snapshots usually carry the role row's own id; the entity_id
    // on the changeset is the same number, so we fall back to it
    // when the snapshot doesn't include it.
    const roleId =
      before?.id ?? after?.id ?? (cs.entity_id ? String(cs.entity_id) : null);
    const frameLabelFallback =
      pickStringLike(cs.before_snapshot?.frame_label) ??
      pickStringLike(cs.after_snapshot?.frame_label) ??
      (frameId ? `Frame #${frameId}` : undefined);
    return (
      <FrameRolePanel
        frameId={frameId}
        frameLabelFallback={frameLabelFallback}
        operation={op}
        before={before}
        after={after}
        roleId={roleId}
      />
    );
  }

  // Senses anchor to a single frame via `frame_id` (see commit.ts
  // CREATE/UPDATE frame_sense). The subject strip already shows the
  // POS + definition snippet; surface the parent frame here so the
  // reviewer can see at a glance "this sense lives in <frame>".
  if (cs.entity_type === 'frame_sense') {
    const snapshot = cs.before_snapshot ?? cs.after_snapshot ?? {};
    const frameId =
      pickIdLike(snapshot.frame_id) ??
      pickIdLike(cs.before_snapshot?.frame_id) ??
      pickIdLike(cs.after_snapshot?.frame_id);
    if (!frameId) return null;
    const frameLabel =
      pickStringLike(snapshot.frame_label) ?? `Frame #${frameId}`;
    return (
      <FrameInfoCard
        frameId={frameId}
        fallbackLabel={frameLabel}
        emphasis="focus"
        hideSenses
      />
    );
  }

  // Role mappings tie one parent_of edge to a (parent_role, child_role)
  // pair. Render the parent + child frames at the ends with the role
  // labels stacked above an arrow, so a reviewer immediately sees
  // which inheritance edge is being touched.
  if (cs.entity_type === 'frame_role_mapping') {
    const snapshot = cs.before_snapshot ?? cs.after_snapshot ?? {};
    const parentId = pickIdLike(snapshot.parent_frame_id);
    const childId = pickIdLike(snapshot.child_frame_id);
    const parentRole = pickStringLike(snapshot.parent_role_label);
    const childRole = pickStringLike(snapshot.child_role_label);
    const absorbed = snapshot.absorbed === true;
    if (!parentId && !childId) return null;
    const parentLabel =
      pickStringLike(snapshot.parent_frame_label) ??
      (parentId ? `Frame #${parentId}` : 'Parent frame');
    const childLabel =
      pickStringLike(snapshot.child_frame_label) ??
      (childId ? `Frame #${childId}` : 'Child frame');
    return (
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
        <FrameInfoCard
          frameId={parentId}
          fallbackLabel={parentLabel}
          emphasis="origin"
          hideSenses
        />
        <div className="flex flex-col items-center justify-center gap-1 px-2 min-w-[8rem] text-center">
          <span
            className="text-[10px] font-mono text-gray-700 px-1.5 py-0.5 rounded bg-white border border-gray-300 truncate max-w-full"
            title={parentRole ?? 'parent role'}
          >
            {parentRole ?? '(parent role)'}
          </span>
          <span className="text-2xl leading-none text-gray-400">↓</span>
          <span
            className={
              'text-[10px] font-mono px-1.5 py-0.5 rounded border truncate max-w-full ' +
              (absorbed
                ? 'text-amber-800 bg-amber-50 border-amber-200'
                : 'text-gray-700 bg-white border-gray-300')
            }
            title={absorbed ? 'absorbed into parent' : childRole ?? 'child role'}
          >
            {absorbed ? '(absorbed)' : childRole ?? '(child role)'}
          </span>
        </div>
        <FrameInfoCard
          frameId={childId}
          fallbackLabel={childLabel}
          emphasis="destination"
          hideSenses
        />
      </div>
    );
  }

  return null;
}

/**
 * Pull the editable role fields out of a changeset snapshot. Returns
 * `null` when the snapshot is missing or empty so the caller can tell
 * "we have no data for this side of the diff" apart from "we have an
 * empty row".
 *
 * Crucially, only fields that actually exist on the raw snapshot are
 * copied onto the result. Fields the writer omitted come back as
 * `undefined` so downstream code can distinguish "this field wasn't
 * touched by the changeset" (use the cached value) from "the writer
 * explicitly set this to null" (clear it).
 */
function readRoleSnapshot(
  snap: Record<string, unknown> | null,
): RoleSnapshot | null {
  if (!snap || Object.keys(snap).length === 0) return null;
  const result: RoleSnapshot = {};
  if ('id' in snap) result.id = pickIdLike(snap.id);
  if ('label' in snap) result.label = pickStringLike(snap.label);
  if ('description' in snap) result.description = pickStringLike(snap.description);
  if ('notes' in snap) result.notes = pickStringLike(snap.notes);
  if ('main' in snap) {
    result.main = typeof snap.main === 'boolean' ? snap.main : Boolean(snap.main);
  }
  if ('examples' in snap) {
    const examplesRaw = snap.examples;
    result.examples = Array.isArray(examplesRaw)
      ? examplesRaw.filter((x): x is string => typeof x === 'string')
      : null;
  }
  return result;
}

function pickStringLike(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return null;
}

// =====================================================================
// Rich role-grouped panel for `frame` UPDATE changesets whose field
// changes are all `frame_roles.<roleType>.*` subfields (i.e. from the
// manual editor). Renders one `FrameRolePanel` per changed role type
// so the reviewer sees the same rich Before/After role cards they get
// from the LLM remediation path.
// =====================================================================

interface RoleFieldGroup {
  roleType: string;
  operation: 'create' | 'update' | 'delete';
  before: RoleSnapshot | null;
  after: RoleSnapshot | null;
}

function groupRoleFieldChanges(
  fieldChanges: ByRemediationChangeset['field_changes'],
): RoleFieldGroup[] {
  const byRole = new Map<string, Map<string, { old_value: unknown; new_value: unknown }>>();

  for (const fc of fieldChanges) {
    const lower = fc.field_name.toLowerCase();
    if (!lower.startsWith('frame_roles.')) continue;
    const parts = fc.field_name.split('.');
    if (parts.length < 3) continue;
    const roleType = parts[1];
    const subfield = parts.slice(2).join('.').toLowerCase();
    if (!byRole.has(roleType)) byRole.set(roleType, new Map());
    byRole.get(roleType)!.set(subfield, { old_value: fc.old_value, new_value: fc.new_value });
  }

  const result: RoleFieldGroup[] = [];

  for (const [roleType, fields] of byRole) {
    const existsChange = fields.get('__exists');
    const oldExists = existsChange ? Boolean(existsChange.old_value) : true;
    const newExists = existsChange ? Boolean(existsChange.new_value) : true;

    const readSnap = (side: 'old' | 'new'): RoleSnapshot | null => {
      const exists = side === 'old' ? oldExists : newExists;
      if (!exists) return null;
      const get = (f: string) =>
        fields.get(f)?.[side === 'old' ? 'old_value' : 'new_value'];
      return {
        label: pickStringLike(get('label')) ?? roleType,
        description: pickStringLike(get('description')),
        notes: pickStringLike(get('notes')),
        main: get('main') !== undefined ? Boolean(get('main')) : null,
        examples: Array.isArray(get('examples'))
          ? (get('examples') as unknown[]).filter((x): x is string => typeof x === 'string')
          : null,
      };
    };

    let operation: 'create' | 'update' | 'delete' = 'update';
    if (existsChange) {
      if (!oldExists && newExists) operation = 'create';
      else if (oldExists && !newExists) operation = 'delete';
    }

    result.push({
      roleType,
      operation,
      before: readSnap('old'),
      after: readSnap('new'),
    });
  }

  return result.sort((a, b) => a.roleType.localeCompare(b.roleType));
}

interface FrameRolesChangePanelProps {
  frameId: string | null;
  frameLabelFallback?: string;
  fieldChanges: ByRemediationChangeset['field_changes'];
}

function FrameRolesChangePanel({
  frameId,
  frameLabelFallback,
  fieldChanges,
}: FrameRolesChangePanelProps) {
  const groups = groupRoleFieldChanges(fieldChanges);
  if (groups.length === 0) return null;
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <FrameRolePanel
          key={g.roleType}
          frameId={frameId}
          frameLabelFallback={frameLabelFallback}
          operation={g.operation}
          before={g.before}
          after={g.after}
          roleId={null}
        />
      ))}
    </div>
  );
}

// =====================================================================
// Body: per-operation rich rendering. Update gets a Before/After field
// diff in the same shell as the reparent panel; create surfaces the
// snapshot of the new row; delete surfaces the snapshot of the row
// being removed. The header chip + subject strip already convey the
// operation, so no extra warning chrome is rendered here.
// =====================================================================
interface ChangesetBodyProps {
  cs: ByRemediationChangeset;
  pendingFieldChanges: ByRemediationChangeset['field_changes'];
}

function ChangesetBody({ cs, pendingFieldChanges }: ChangesetBodyProps) {
  // `frame_role` changesets render their full Before/After story in
  // `ChangesetEntityContext` via `FrameRolePanel`, so suppress the
  // generic create/update/delete chrome here. The reviewer can still
  // expand the raw field-change list via the toggle below.
  if (cs.entity_type === 'frame_role') return null;

  // `frame` UPDATE changesets where every pending field change is a
  // `frame_roles.*` subfield get a rich grouped role panel instead of
  // the flat field-by-field list.
  if (
    cs.entity_type === 'frame' &&
    cs.operation === 'update' &&
    pendingFieldChanges.length > 0 &&
    pendingFieldChanges.every((fc) => fc.field_name.toLowerCase().startsWith('frame_roles.'))
  ) {
    return (
      <FrameRolesChangePanel
        frameId={cs.entity_id}
        frameLabelFallback={
          pickStringLike(cs.before_snapshot?.label) ??
          pickStringLike(cs.after_snapshot?.label) ??
          (cs.entity_id ? `Frame #${cs.entity_id}` : undefined)
        }
        fieldChanges={pendingFieldChanges}
      />
    );
  }

  if (cs.operation === 'create') {
    if (!cs.after_snapshot || Object.keys(cs.after_snapshot).length === 0) {
      return null;
    }
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
        <SnapshotPreview snapshot={cs.after_snapshot} />
      </div>
    );
  }

  if (cs.operation === 'delete') {
    if (!cs.before_snapshot || Object.keys(cs.before_snapshot).length === 0) {
      return null;
    }
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
        <SnapshotPreview snapshot={cs.before_snapshot} />
      </div>
    );
  }

  if (cs.operation === 'move') {
    return null;
  }

  // Update: render a field-by-field Before/After panel using the same
  // shell as the reparent UI. Each side renders the same fields in the
  // same order so the rows line up visually.
  if (pendingFieldChanges.length === 0) {
    return (
      <div className="text-xs text-gray-500 italic px-3 py-2">
        All field changes have already been reviewed.
      </div>
    );
  }

  return (
    <PlanContextPanel
      beforeLabel="Current"
      afterLabel="Proposed"
      beforeContent={<FieldValueList fields={pendingFieldChanges} side="old" />}
      afterContent={<FieldValueList fields={pendingFieldChanges} side="new" />}
    />
  );
}

interface FieldValueListProps {
  fields: ByRemediationChangeset['field_changes'];
  side: 'old' | 'new';
}

function FieldValueList({ fields, side }: FieldValueListProps) {
  return (
    <ul className="space-y-3">
      {fields.map((fc) => {
        const display =
          side === 'old'
            ? fc.old_display ?? formatLooseValue(fc.old_value)
            : fc.new_display ?? formatLooseValue(fc.new_value);
        const isMissing = display === 'null' || display === '' || display == null;
        return (
          <li
            key={`${fc.id}-${side}`}
            className="rounded-lg bg-white border border-gray-200 px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wide text-blue-600">
                {formatFieldNameShort(fc.field_name)}
              </span>
            </div>
            <div
              className={`mt-1 text-xs leading-relaxed break-words whitespace-pre-wrap line-clamp-6 ${
                isMissing ? 'italic text-gray-400' : 'text-gray-800'
              }`}
            >
              {isMissing ? '— empty —' : display}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// =====================================================================
// Helpers
// =====================================================================
function pickIdLike(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && /^\d+$/.test(value)) return value;
  if (typeof value === 'number' && Number.isInteger(value)) return String(value);
  if (typeof value === 'bigint') return value.toString();
  return null;
}

function operationIcon(op: string) {
  switch (op) {
    case 'create':
      return <PlusCircleIcon className="w-4 h-4" />;
    case 'delete':
      return <TrashIcon className="w-4 h-4" />;
    case 'merge':
      return <ArrowsPointingInIcon className="w-4 h-4" />;
    case 'move':
      return <ArrowsRightLeftIcon className="w-4 h-4" />;
    case 'update':
    default:
      return <PencilSquareIcon className="w-4 h-4" />;
  }
}

const ENTITY_LABELS: Record<string, string> = {
  frame: 'frame',
  frame_relation: 'relation',
  frame_role: 'frame role',
  frame_role_mapping: 'role mapping',
  frame_sense: 'sense',
  lexical_unit: 'lexical unit',
  lexical_unit_sense: 'lexical unit sense',
};

const OPERATION_VERB: Record<string, string> = {
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  move: 'Move',
};

/**
 * Human kind label for the card header. Mirrors the `Reparent frame`
 * / `Split frame` titles that `PlanCard` shows for plan-bound rows so
 * loose updates read as the same kind of object.
 */
function changesetKindLabel(cs: ByRemediationChangeset): string {
  const verb = OPERATION_VERB[cs.operation] ?? capitalize(cs.operation);
  const noun = ENTITY_LABELS[cs.entity_type] ?? cs.entity_type.replace(/_/g, ' ');
  return `${verb} ${noun}`;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function formatLooseValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return value.length === 0 ? 'empty list' : `[${value.length}]`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

interface SnapshotPreviewProps {
  snapshot: Record<string, unknown>;
  className?: string;
}

/**
 * Compact preview of an entity snapshot — used inside the create
 * callout (so reviewers see what the new row will look like) and the
 * delete callout (so they see what's about to disappear). Pulls the
 * top handful of textual fields rather than dumping the whole object.
 */
function SnapshotPreview({ snapshot, className = '' }: SnapshotPreviewProps) {
  const entries = Object.entries(snapshot)
    .filter(([k, v]) => {
      if (k === 'id' || k === 'created_at' || k === 'updated_at') return false;
      if (v === null || v === undefined) return false;
      if (typeof v === 'object') return false;
      return true;
    })
    .slice(0, 6);
  if (entries.length === 0) return null;
  return (
    <dl className={`grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-[11px] font-normal text-gray-700 ${className}`}>
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-mono text-gray-500">{k}</dt>
          <dd className="truncate">{formatLooseValue(v)}</dd>
        </div>
      ))}
    </dl>
  );
}
