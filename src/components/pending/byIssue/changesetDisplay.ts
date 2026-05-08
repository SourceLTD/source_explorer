/**
 * Small display helpers shared by the by-issue Cards / Inbox views.
 *
 * Mirrors the same helpers that live inline in
 * `src/components/PendingChangesList.tsx` so a single changeset reads
 * the same in every surface. The flat-table view keeps its own copies
 * for now (it has additional context the by-issue views don't need);
 * any visible drift between the two should be reconciled here.
 */
import type { ByIssueChangeset } from './types';
import {
  SYSTEM_USER_ID,
  SYSTEM_USER_DISPLAY_NAME,
} from '@/lib/users/displayName';

export function getEntityDisplayName(cs: ByIssueChangeset): string {
  const snapshot = cs.before_snapshot || cs.after_snapshot;
  if (snapshot) {
    if (cs.entity_type === 'frame_relation') {
      const relType = String(snapshot.type ?? 'relation');
      const srcLabel = snapshot.source_label ? String(snapshot.source_label) : null;
      const tgtLabel = snapshot.target_label ? String(snapshot.target_label) : null;
      if (srcLabel && tgtLabel) return `${srcLabel} → ${tgtLabel} (${relType})`;
      const srcId = snapshot.source_id ? `#${snapshot.source_id}` : '?';
      const tgtId = snapshot.target_id ? `#${snapshot.target_id}` : '?';
      return `${srcId} → ${tgtId} (${relType})`;
    }
    if (cs.entity_type === 'frame') {
      const label = snapshot.label;
      const id = cs.entity_id;
      if (label && id) {
        const truncated =
          String(label).substring(0, 25) + (String(label).length > 25 ? '...' : '');
        return `${truncated} (${id})`;
      }
      if (label) {
        return `${String(label).substring(0, 30)}${
          String(label).length > 30 ? '...' : ''
        }`;
      }
    } else {
      const code = snapshot.code;
      if (code) {
        return `${String(code).substring(0, 30)}${
          String(code).length > 30 ? '...' : ''
        }`;
      }
    }
  }
  return cs.entity_id ? `#${cs.entity_id}` : 'New';
}

export function operationBadgeClass(op: string): string {
  switch (op) {
    case 'create':
      return 'bg-green-100 text-green-800';
    case 'update':
      return 'bg-blue-100 text-blue-700';
    case 'delete':
      return 'bg-red-100 text-red-800';
    case 'move':
      return 'bg-purple-100 text-purple-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function formatUserName(user: string | null): string {
  if (!user) return 'Unknown';
  if (user === 'current-user') return 'Current user';
  if (user === SYSTEM_USER_ID) return SYSTEM_USER_DISPLAY_NAME;
  if (user === 'system:llm-agent') return 'LLM Agent';
  if (user.includes('@')) return capitalizeFirst(user.split('@')[0]);
  return capitalizeFirst(user);
}

/**
 * Short summary of what a changeset will do, suitable for a single
 * line in a compact list. Avoids the heavy field-by-field diff so the
 * by-issue cards stay scannable.
 */
export function summarizeChangeset(cs: ByIssueChangeset): string {
  if (cs.operation === 'delete') return 'Entity will be deleted';
  if (cs.operation === 'create') return 'New entity will be created';
  if (cs.operation === 'move') return 'Entity will be moved';
  const pending = cs.field_changes.filter((f) => f.status === 'pending');
  if (pending.length === 0) return 'All fields reviewed';
  if (pending.length === 1) {
    const f = pending[0];
    const name = formatFieldNameShort(f.field_name);
    return `${name} updated`;
  }
  const names = pending
    .slice(0, 3)
    .map((f) => formatFieldNameShort(f.field_name))
    .join(', ');
  const extra = pending.length > 3 ? ` +${pending.length - 3}` : '';
  return `${names}${extra}`;
}

function formatFieldNameShort(fieldName: string): string {
  if (fieldName === 'frame_id') return 'frame';
  if (fieldName.startsWith('frame_roles.')) {
    const parts = fieldName.split('.');
    if (parts.length >= 3) {
      const last = parts[parts.length - 1];
      return last === '__exists' ? `role/${parts[1]}` : `${parts[1]}.${last}`;
    }
  }
  return fieldName;
}
