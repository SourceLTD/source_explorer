/**
 * Validation / sanitization helpers for health check API inputs.
 */

import {
  CONCEPT_SUBTYPES,
  CONCEPT_ARCHETYPES,
  HEALTH_CHECK_ENTITY_TYPES,
  HEALTH_CHECK_RUN_STATUSES,
  HEALTH_REMEDIATION_STRATEGIES,
  type ConceptSubtype,
  type ConceptArchetype,
  type HealthCheckEntityType,
  type HealthCheckRunStatus,
  type HealthRemediationStrategy,
} from './types';
import { ISSUE_PRIORITIES, type IssuePriority } from '@/lib/issues/types';

export function isHealthCheckEntityType(value: unknown): value is HealthCheckEntityType {
  return typeof value === 'string'
    && (HEALTH_CHECK_ENTITY_TYPES as readonly string[]).includes(value);
}

export function isHealthCheckRunStatus(value: unknown): value is HealthCheckRunStatus {
  return typeof value === 'string'
    && (HEALTH_CHECK_RUN_STATUSES as readonly string[]).includes(value);
}

export function isIssuePriority(value: unknown): value is IssuePriority {
  return typeof value === 'string'
    && (ISSUE_PRIORITIES as readonly string[]).includes(value);
}

export function isHealthRemediationStrategy(
  value: unknown,
): value is HealthRemediationStrategy {
  return typeof value === 'string'
    && (HEALTH_REMEDIATION_STRATEGIES as readonly string[]).includes(value);
}

export function sanitizeNullableString(value: unknown, maxLength = 4000): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

/**
 * Normalize a code-like string: trim and uppercase, snake_case allowed.
 * Returns `null` if empty after trim.
 */
export function normalizeCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
}

/**
 * Validate and de-duplicate an array of `entity_type` strings.
 * Throws when an unknown type is encountered.
 */
export function sanitizeTargetTypes(value: unknown): HealthCheckEntityType[] {
  if (!Array.isArray(value)) return [];
  const out: HealthCheckEntityType[] = [];
  const seen = new Set<HealthCheckEntityType>();
  for (const item of value) {
    if (!isHealthCheckEntityType(item)) {
      throw new Error(`Unsupported target entity type: ${String(item)}`);
    }
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

export function isConceptArchetype(value: unknown): value is ConceptArchetype {
  return typeof value === 'string'
    && (CONCEPT_ARCHETYPES as readonly string[]).includes(value);
}

export function isConceptSubtype(value: unknown): value is ConceptSubtype {
  return typeof value === 'string'
    && (CONCEPT_SUBTYPES as readonly string[]).includes(value);
}

/**
 * Validate and de-duplicate a list of `concept_archetype_enum` values. Throws
 * when an unknown value is encountered so the caller can surface a 400.
 */
export function sanitizeConceptArchetypeList(value: unknown): ConceptArchetype[] {
  if (!Array.isArray(value)) return [];
  const out: ConceptArchetype[] = [];
  const seen = new Set<ConceptArchetype>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (!isConceptArchetype(trimmed)) {
      throw new Error(`Unsupported archetype: ${trimmed}`);
    }
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Validate and de-duplicate a list of `concept_subtype_enum` values. Throws
 * when an unknown value is encountered so the caller can surface a 400.
 */
export function sanitizeConceptSubtypeList(value: unknown): ConceptSubtype[] {
  if (!Array.isArray(value)) return [];
  const out: ConceptSubtype[] = [];
  const seen = new Set<ConceptSubtype>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (!isConceptSubtype(trimmed)) {
      throw new Error(`Unsupported concept_subtype: ${trimmed}`);
    }
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Trim, drop empties / dupes for an arbitrary string-allowlist input.
 * Order is preserved by first-seen.
 */
export function sanitizeStringList(value: unknown, maxItems = 100): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= maxItems) break;
  }
  return out;
}

/**
 * Trim, drop empties / dupes, and cap an "examples" string array.
 * Used by diagnosis codes — these examples are concatenated into LLM
 * prompts so we keep them concise.
 */
export function sanitizeExamples(value: unknown, maxItems = 50): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= maxItems) break;
  }
  return out;
}
