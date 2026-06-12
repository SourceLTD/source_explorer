/**
 * Shared filter state + matching logic for the pending-changes surfaces (the
 * flat `PendingChangesList` table and the by-remediation Inbox). Both surfaces
 * use the same `PendingFilter` shape and the same predicate, building a
 * normalized `FilterableChangeset` from their own row type.
 */

export interface PendingFilter {
  /** Free-text search across entity, label, fields, etc. */
  search: string;
  entityTypes: string[];
  operations: string[];
  /** Origin / group source, e.g. `llm_job`, `manual`, `remediation`. */
  sources: string[];
  /** LLM job ids. */
  jobIds: string[];
  /** Plan-bound vs loose changes. */
  planState: PlanState[];
  /** Health-check severities (Inbox only). */
  severities: string[];
  /** Health-check diagnosis codes (Inbox only). */
  diagnosisCodes: string[];
  /** Subject concept type / archetype (concept views). */
  archetypes: string[];
  /** Whether the subject concept is new vs already exists (concept views). */
  subjectStates: SubjectState[];
  createdAfter: string;
  createdBefore: string;
}

export type PlanState = 'plan' | 'loose';
export type SubjectState = 'new' | 'existing';

/**
 * Which facet sections a surface exposes. The inbox varies this by grouping
 * mode so each view offers the filters that make sense for it.
 */
export interface PendingFilterSections {
  source?: boolean;
  jobs?: boolean;
  planState?: boolean;
  severity?: boolean;
  diagnosis?: boolean;
  dates?: boolean;
  /** Concept type / archetype facet (concept views). */
  archetype?: boolean;
  /** New vs existing concept facet (concept views). */
  subjectState?: boolean;
}

export const defaultPendingFilter: PendingFilter = {
  search: '',
  entityTypes: [],
  operations: [],
  sources: [],
  jobIds: [],
  planState: [],
  severities: [],
  diagnosisCodes: [],
  archetypes: [],
  subjectStates: [],
  createdAfter: '',
  createdBefore: '',
};

/** A row reduced to the fields the pending filter cares about. */
export interface FilterableChangeset {
  entity_type: string;
  operation: string;
  source: string | null;
  jobId: string | null;
  hasPlan: boolean;
  createdAt: string;
  severity?: string | null;
  diagnosisCode?: string | null;
  /** Subject concept archetype, when known. */
  archetype?: string | null;
  /** True when the subject concept doesn't exist yet (create/split/ingest). */
  isNew?: boolean | null;
  /** Pre-lowercased haystack of everything searchable for this row. */
  searchText: string;
}

export function toggleInArray<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export function countActivePendingFilters(f: PendingFilter): number {
  return (
    (f.search.trim() ? 1 : 0) +
    f.entityTypes.length +
    f.operations.length +
    f.sources.length +
    f.jobIds.length +
    f.planState.length +
    f.severities.length +
    f.diagnosisCodes.length +
    f.archetypes.length +
    f.subjectStates.length +
    (f.createdAfter ? 1 : 0) +
    (f.createdBefore ? 1 : 0)
  );
}

/**
 * Clear the facets a surface no longer exposes, so switching views doesn't
 * leave invisible-but-active filters behind. Universal facets (search, entity
 * type, operation) are always retained.
 */
export function clearHiddenFacets(f: PendingFilter, show: PendingFilterSections): PendingFilter {
  return {
    ...f,
    sources: show.source ? f.sources : [],
    jobIds: show.jobs ? f.jobIds : [],
    planState: show.planState ? f.planState : [],
    severities: show.severity ? f.severities : [],
    diagnosisCodes: show.diagnosis ? f.diagnosisCodes : [],
    archetypes: show.archetype ? f.archetypes : [],
    subjectStates: show.subjectState ? f.subjectStates : [],
    createdAfter: show.dates ? f.createdAfter : '',
    createdBefore: show.dates ? f.createdBefore : '',
  };
}

export function hasActivePendingFilters(f: PendingFilter): boolean {
  return countActivePendingFilters(f) > 0;
}

/** Number of active facets excluding free-text search (used for the panel badge). */
export function countActiveFacets(f: PendingFilter): number {
  return countActivePendingFilters(f) - (f.search.trim() ? 1 : 0);
}

export function changesetMatchesPendingFilter(cs: FilterableChangeset, f: PendingFilter): boolean {
  if (f.search.trim()) {
    if (!cs.searchText.includes(f.search.trim().toLowerCase())) return false;
  }
  if (f.entityTypes.length > 0 && !f.entityTypes.includes(cs.entity_type)) return false;
  if (f.operations.length > 0 && !f.operations.includes(cs.operation)) return false;
  if (f.sources.length > 0 && (cs.source === null || !f.sources.includes(cs.source))) return false;
  if (f.jobIds.length > 0 && (cs.jobId === null || !f.jobIds.includes(cs.jobId))) return false;

  if (f.planState.length > 0) {
    const state: PlanState = cs.hasPlan ? 'plan' : 'loose';
    if (!f.planState.includes(state)) return false;
  }

  if (f.severities.length > 0) {
    if (!cs.severity || !f.severities.includes(cs.severity)) return false;
  }
  if (f.diagnosisCodes.length > 0) {
    if (!cs.diagnosisCode || !f.diagnosisCodes.includes(cs.diagnosisCode)) return false;
  }

  if (f.archetypes.length > 0) {
    if (!cs.archetype || !f.archetypes.includes(cs.archetype)) return false;
  }
  if (f.subjectStates.length > 0) {
    if (cs.isNew === null || cs.isNew === undefined) return false;
    const state: SubjectState = cs.isNew ? 'new' : 'existing';
    if (!f.subjectStates.includes(state)) return false;
  }

  if (f.createdAfter && cs.createdAt && cs.createdAt < f.createdAfter) return false;
  if (f.createdBefore && cs.createdAt && cs.createdAt > endOfDay(f.createdBefore)) return false;

  return true;
}

/** `YYYY-MM-DD` -> end-of-day ISO so a `Before` date is inclusive. */
function endOfDay(date: string): string {
  return `${date}T23:59:59.999Z`;
}
