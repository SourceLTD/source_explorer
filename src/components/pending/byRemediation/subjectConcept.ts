/**
 * Subject-concept derivation for the pending-changes inbox.
 *
 * The "by-action-type" inbox groups changes by *what they do*. The
 * "by-concept" and "by-concept-type" views instead group by *which
 * concept the change is about*. Per the agreed UX rule, every change —
 * however many concepts it technically references — is filed under the
 * single concept it is the subject of, and never duplicated across the
 * others it merely touches:
 *
 *   - frame create/update/delete            → the frame itself
 *   - frame_sense / frame_role              → the owning concept
 *   - frame_relation                        → the child
 *   - frame_role_mapping                    → the child
 *   - move_frame_parent / detach_parent_*   → the child being reparented
 *   - upsert_role_mappings                  → the child inheriting roles
 *   - move_frame_sense                      → the destination frame
 *   - split_frame                           → the source being split
 *   - merge_frame                           → the surviving target
 *   - merge_sense                           → the frame owning both senses
 *   - ingest_new_tbox_concept               → the new (not-yet-created) concept
 *
 * This makes by-concept grouping a clean partition (one bucket per
 * change), which keeps the wholesale bucket-commit/reject action valid.
 *
 * The id is always resolvable from data already on the wire. The label
 * and archetype are returned when locally available (frame snapshots and
 * plan metadata carry them); otherwise they come back null and the
 * caller backfills via `conceptSummaryCache`. When the subject is a
 * concept that does not exist yet (a create / split result / ingest),
 * `id` is null and `newKey` carries a stable per-change key so each new
 * concept still gets its own bucket.
 */
import type { ShapedChangeset } from '@/lib/changesets/pending-shape';
import type { IssueChangePlanSummary } from '@/lib/issues/types';

export interface SubjectConcept {
  /** Concept id of the subject, or null when it doesn't exist yet. */
  id: string | null;
  /** Best-effort display label; null means "resolve via concept summary". */
  label: string | null;
  /** Best-effort archetype (concept type); null means "resolve via summary". */
  archetype: string | null;
  /** True when the subject is a not-yet-created concept (create/split/ingest). */
  isNew: boolean;
  /**
   * Stable bucket key. For existing concepts this is `concept:<id>`. For
   * new concepts it is `new:<changesetOrPlanId>` so each lands in its own
   * bucket rather than colliding under a shared "new" key.
   */
  key: string;
}

// ---------------------------------------------------------------------------
// Small readers (mirrors `snapStr` in PlanCard — kept local to avoid a dep).
// ---------------------------------------------------------------------------

function str(obj: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!obj) return null;
  const v = obj[key];
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  return null;
}

/** First non-null string across a list of candidate keys on a snapshot. */
function firstStr(
  obj: Record<string, unknown> | null | undefined,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = str(obj, k);
    if (v) return v;
  }
  return null;
}

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function existing(id: string, label: string | null, archetype: string | null): SubjectConcept {
  return { id, label, archetype, isNew: false, key: `concept:${id}` };
}

function brandNew(seedId: string, label: string | null, archetype: string | null): SubjectConcept {
  return { id: null, label, archetype, isNew: true, key: `new:${seedId}` };
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

/**
 * Subject concept of a plan. Reads the runner-written `metadata` (the
 * same fields PlanCard renders), since the plan's lowered changesets
 * reference relation/sense ids rather than the subject concept.
 */
export function subjectConceptForPlan(plan: IssueChangePlanSummary): SubjectConcept {
  const md = plan.metadata ?? {};

  switch (plan.plan_kind) {
    case 'move_frame_parent': {
      const child = obj(md.child);
      const id = str(child, 'id');
      return id ? existing(id, str(child, 'label'), null) : brandNew(plan.id, str(child, 'label'), null);
    }
    case 'detach_parent_relation': {
      // edges: [{ source(parent), target(child), ... }] — subject = child = target.
      const edges = Array.isArray(md.edges) ? (md.edges as unknown[]) : [];
      const edge = obj(edges[0]);
      const id = str(edge, 'target');
      return id ? existing(id, str(edge, 'target_label'), null) : brandNew(plan.id, null, null);
    }
    case 'upsert_role_mappings': {
      const child = obj(md.child);
      const id = str(child, 'id');
      return id ? existing(id, str(child, 'label'), null) : brandNew(plan.id, str(child, 'label'), null);
    }
    case 'move_frame_sense': {
      const to = obj(md.to);
      const id = str(to, 'id');
      return id ? existing(id, str(to, 'label'), null) : brandNew(plan.id, str(to, 'label'), null);
    }
    case 'merge_sense': {
      const frame = obj(md.frame);
      const id = str(frame, 'id');
      return id ? existing(id, str(frame, 'label'), null) : brandNew(plan.id, str(frame, 'label'), null);
    }
    case 'split_frame': {
      const source = obj(md.source_frame);
      const id = str(source, 'id');
      return id ? existing(id, str(source, 'label'), null) : brandNew(plan.id, str(source, 'label'), null);
    }
    case 'merge_frame': {
      // Survivor = target. A `kind: 'new'` target has no id yet.
      const target = obj(md.target);
      const id = str(target, 'kind') === 'new' ? null : str(target, 'id');
      return id
        ? existing(id, str(target, 'label'), null)
        : brandNew(plan.id, str(target, 'label'), null);
    }
    case 'ingest_new_tbox_concept': {
      // Brand-new concept — no id until commit. Archetype is in metadata.
      const proposed = obj(md.proposed_concept);
      return brandNew(plan.id, str(proposed, 'label') ?? plan.summary, str(proposed, 'archetype'));
    }
    default: {
      // Forward-compatible: unknown kind → file under its first changeset's
      // entity_id if it looks like a frame, else its own "new" bucket.
      const first = plan.changesets[0];
      if (first && first.entity_type === 'frame' && first.entity_id) {
        return existing(first.entity_id, null, null);
      }
      return brandNew(plan.id, plan.summary, null);
    }
  }
}

// ---------------------------------------------------------------------------
// Loose changesets
// ---------------------------------------------------------------------------

/**
 * Subject concept of a loose (non-plan) changeset.
 *
 * NOTE ON SNAPSHOT KEYS: the snapshot mirrors the underlying table row,
 * so foreign keys use the *table* column names (concept_relations →
 * parent_id/child_id, property_mappings → parent_concept_id/
 * child_concept_id, properties → concept_id). Candidate-key lists below
 * are defensive against alias drift; verify against a real changeset row
 * if a bucket comes back unexpectedly empty.
 */
export function subjectConceptForChangeset(cs: ShapedChangeset): SubjectConcept {
  const after = cs.after_snapshot;
  const before = cs.before_snapshot;
  const snap = after ?? before; // creates only have `after`; deletes only `before`.

  switch (cs.entity_type) {
    case 'frame': {
      // The frame itself. Creates have no entity_id until commit.
      const label = firstStr(after, ['label', 'code']) ?? firstStr(before, ['label', 'code']);
      const archetype = str(after, 'archetype') ?? str(before, 'archetype');
      return cs.entity_id
        ? existing(cs.entity_id, label, archetype)
        : brandNew(cs.id, label, archetype);
    }
    case 'frame_relation': {
      // Subject = child. concept_relations.child_id (alias: target_id).
      const id = firstStr(snap, ['child_id', 'target_id', 'child']);
      return id ? existing(id, null, null) : brandNew(cs.id, null, null);
    }
    case 'frame_role_mapping': {
      // Subject = child. property_mappings.child_concept_id.
      const id = firstStr(snap, ['child_concept_id', 'child_id', 'child']);
      return id ? existing(id, null, null) : brandNew(cs.id, null, null);
    }
    case 'frame_role': {
      // Subject = owning concept. properties.concept_id.
      const id = firstStr(snap, ['concept_id', 'frame_id']);
      return id ? existing(id, null, null) : brandNew(cs.id, null, null);
    }
    case 'frame_sense': {
      // Senses link to a concept via the sense_concepts bridge, so the
      // owner id may not be inline on the snapshot. Try the common keys;
      // otherwise leave it for an "Unattached" bucket.
      const id = firstStr(snap, ['concept_id', 'frame_id', 'owner_concept_id']);
      return id ? existing(id, null, null) : brandNew(cs.id, str(snap, 'label'), null);
    }
    default: {
      // lexical_unit and anything else with no single subject concept.
      const id = firstStr(snap, ['concept_id', 'frame_id', 'child_id']);
      return id ? existing(id, null, null) : brandNew(cs.id, str(snap, 'label'), null);
    }
  }
}

/** Unified entry point: dispatch on whether the item is a plan or a changeset. */
export function subjectConcept(item: ShapedChangeset | IssueChangePlanSummary): SubjectConcept {
  return 'plan_kind' in item
    ? subjectConceptForPlan(item as IssueChangePlanSummary)
    : subjectConceptForChangeset(item as ShapedChangeset);
}
