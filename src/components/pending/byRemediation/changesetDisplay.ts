import type { ByRemediationChangeset } from './types';
import {
  SYSTEM_USER_ID,
  SYSTEM_USER_DISPLAY_NAME,
} from '@/lib/users/displayName';

export function getEntityDisplayName(cs: ByRemediationChangeset): string {
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
    }
    if (cs.entity_type === 'frame_sense') {
      const pos = snapshot.pos ? String(snapshot.pos) : null;
      const def = snapshot.definition ? String(snapshot.definition) : null;
      if (pos && def) {
        const snippet =
          def.length > 40 ? `${def.substring(0, 40)}...` : def;
        return `${pos}: ${snippet}`;
      }
      if (def) {
        return def.length > 50 ? `${def.substring(0, 50)}...` : def;
      }
      if (pos) return `${pos} sense${cs.entity_id ? ` #${cs.entity_id}` : ''}`;
    }
    if (cs.entity_type === 'frame_role') {
      const label = snapshot.label;
      if (label) {
        const str = String(label);
        return str.length > 40 ? `${str.substring(0, 40)}...` : str;
      }
    }
    if (cs.entity_type === 'frame_role_mapping') {
      const parentRole = snapshot.parent_role_label
        ? String(snapshot.parent_role_label)
        : null;
      const childRole = snapshot.child_role_label
        ? String(snapshot.child_role_label)
        : null;
      const absorbed = snapshot.absorbed === true;
      if (parentRole && (childRole || absorbed)) {
        return `${parentRole} → ${absorbed ? '(absorbed)' : childRole}`;
      }
      if (parentRole) return `${parentRole} → ?`;
    }
    if (cs.entity_type !== 'frame') {
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
    case 'merge':
      return 'bg-purple-100 text-purple-800';
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

export function summarizeChangeset(cs: ByRemediationChangeset): string {
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

const ROLE_SUBFIELD_LABELS: Record<string, string> = {
  __exists: 'exists',
  label: 'label',
  description: 'description',
  notes: 'notes',
  main: 'main',
  examples: 'examples',
};

export function formatFieldNameShort(fieldName: string): string {
  const lower = fieldName.toLowerCase();
  if (lower === 'frame_id') return 'frame';
  if (lower.startsWith('frame_roles.')) {
    const parts = lower.split('.');
    if (parts.length >= 3) {
      // Preserve original casing for the role type (e.g. "Doer", "Done_to")
      const originalParts = fieldName.split('.');
      const roleType = originalParts[1];
      const subfield = parts[parts.length - 1];
      const subfieldLabel = ROLE_SUBFIELD_LABELS[subfield] ?? subfield;
      return subfield === '__exists' ? `role/${roleType}` : `${roleType}.${subfieldLabel}`;
    }
  }
  return fieldName;
}
