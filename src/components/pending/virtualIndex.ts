type JsonRecord = Record<string, unknown>;

type FieldChangeStatus = 'pending' | 'approved' | 'rejected';

interface VirtualIndexFieldChange {
  field_name: string;
  new_value: unknown;
  status: FieldChangeStatus;
}

export interface VirtualIndexChangeset {
  id: string;
  entity_type: string;
  entity_id: string | null;
  operation: 'create' | 'update' | 'delete';
  before_snapshot: JsonRecord | null;
  after_snapshot: JsonRecord | null;
  field_changes: VirtualIndexFieldChange[];
}

export interface VirtualFrameSummary {
  id: string;
  label: string;
  code?: string | null;
  short_definition?: string | null;
  definition?: string | null;
}

export interface VirtualLexicalUnitSummary {
  id: string;
  code: string;
  gloss: string;
  pos?: string | null;
  lemmas?: string[] | null;
}

export interface VirtualIndex {
  virtualFramesByRef: Map<string, VirtualFrameSummary>;
  framesBySuperRef: Map<string, VirtualFrameSummary[]>;
  lexicalUnitsByFrameRef: Map<string, VirtualLexicalUnitSummary[]>;
}

function isPlainObject(value: unknown): value is JsonRecord {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
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

function isVirtualRef(ref: string | null): boolean {
  return Boolean(ref && ref.startsWith('-'));
}

function pickString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getSnapshotValue(snapshot: JsonRecord | null, key: string): unknown {
  if (!snapshot || !isPlainObject(snapshot)) return undefined;
  return snapshot[key];
}

function summarizeFrame(ref: string, snapshot: JsonRecord | null): VirtualFrameSummary | null {
  if (!snapshot) return null;
  const label = pickString(snapshot.label) || pickString(snapshot.code) || 'Untitled';
  return {
    id: ref,
    label,
    code: pickString(snapshot.code) || null,
    short_definition: pickString(snapshot.short_definition) || null,
    definition: pickString(snapshot.definition) || null,
  };
}

function summarizeLexicalUnit(ref: string, snapshot: JsonRecord | null): VirtualLexicalUnitSummary | null {
  if (!snapshot) return null;
  const code = pickString(snapshot.code) || 'Untitled';
  const gloss = pickString(snapshot.gloss) || '';
  const pos = pickString(snapshot.pos) || null;
  const lemmas = Array.isArray(snapshot.lemmas) ? (snapshot.lemmas as string[]) : null;
  return {
    id: ref,
    code,
    gloss,
    pos,
    lemmas,
  };
}

function getPendingOverride(cs: VirtualIndexChangeset, fieldName: string): { hasOverride: boolean; value: string | null } {
  const fc = cs.field_changes.find(change => change.field_name === fieldName && (change.status === 'pending' || change.status === 'approved'));
  if (!fc) return { hasOverride: false, value: null };
  return { hasOverride: true, value: normalizeIntLike(fc.new_value) };
}

function getEffectiveParentRef(cs: VirtualIndexChangeset, fieldName: string): string | null {
  if (cs.operation === 'create') {
    return normalizeIntLike(getSnapshotValue(cs.after_snapshot, fieldName));
  }
  if (cs.operation === 'update') {
    const override = getPendingOverride(cs, fieldName);
    if (override.hasOverride) return override.value;
    return normalizeIntLike(getSnapshotValue(cs.before_snapshot, fieldName));
  }
  return null;
}

export function buildVirtualIndex(changesets: VirtualIndexChangeset[]): VirtualIndex {
  const virtualFramesByRef = new Map<string, VirtualFrameSummary>();
  const framesBySuperRef = new Map<string, VirtualFrameSummary[]>();
  const lexicalUnitsByFrameRef = new Map<string, VirtualLexicalUnitSummary[]>();

  for (const cs of changesets) {
    if (cs.operation === 'create' && cs.entity_type === 'frame') {
      const virtualRef = `-${cs.id}`;
      const summary = summarizeFrame(virtualRef, cs.after_snapshot);
      if (summary) {
        virtualFramesByRef.set(virtualRef, summary);
      }
    }
  }

  for (const cs of changesets) {
    if (cs.entity_type === 'frame') {
      const parentRef = getEffectiveParentRef(cs, 'super_frame_id');
      if (isVirtualRef(parentRef)) {
        const snapshot = cs.operation === 'create' ? cs.after_snapshot : (cs.before_snapshot ?? cs.after_snapshot);
        const ref = cs.entity_id ? String(cs.entity_id) : `-${cs.id}`;
        const summary = summarizeFrame(ref, snapshot);
        if (summary) {
          const list = framesBySuperRef.get(parentRef!) ?? [];
          list.push(summary);
          framesBySuperRef.set(parentRef!, list);
        }
      }
    }

    if (cs.entity_type === 'lexical_unit') {
      const parentRef = getEffectiveParentRef(cs, 'frame_id');
      if (isVirtualRef(parentRef)) {
        const snapshot = cs.operation === 'create' ? cs.after_snapshot : (cs.before_snapshot ?? cs.after_snapshot);
        const ref = cs.entity_id ? String(cs.entity_id) : `-${cs.id}`;
        const summary = summarizeLexicalUnit(ref, snapshot);
        if (summary) {
          const list = lexicalUnitsByFrameRef.get(parentRef!) ?? [];
          list.push(summary);
          lexicalUnitsByFrameRef.set(parentRef!, list);
        }
      }
    }
  }

  return {
    virtualFramesByRef,
    framesBySuperRef,
    lexicalUnitsByFrameRef,
  };
}
