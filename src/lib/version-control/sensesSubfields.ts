/**
 * Senses-subfield helpers for staging sense↔lexical_unit link changes through
 * the changeset/audit system.
 *
 * Attach/detach of an existing frame_sense to a lexical unit is modelled as a
 * complex subfield change on the LU's changeset, using the convention:
 *
 *   field_name = `senses.<senseId>.__exists`
 *   old_value  = boolean (whether the link existed before)
 *   new_value  = boolean (whether the link should exist after)
 *
 * This mirrors the `frame_roles.<roleType>.__exists` convention (see
 * frameRolesSubfields.ts) and lets multiple staged attach/detach operations
 * coexist on one changeset, with idempotent upserts at commit time.
 */

const SENSES_PREFIX = 'senses.';
const EXISTS_SUFFIX = '.__exists';

export function isSensesExistsFieldName(fieldName: string): boolean {
  if (!fieldName.startsWith(SENSES_PREFIX)) return false;
  if (!fieldName.endsWith(EXISTS_SUFFIX)) return false;
  // Must have exactly one segment between prefix and suffix.
  const middle = fieldName.slice(SENSES_PREFIX.length, -EXISTS_SUFFIX.length);
  return middle.length > 0 && !middle.includes('.');
}

/**
 * True for any senses subfield change (currently only `senses.<id>.__exists`).
 * Used by `isComplexField` in commit.ts.
 *
 * Note: the bare aggregate field name `senses` is intentionally NOT treated as a
 * complex field — we never stage it, and if it ever appeared in a changeset it
 * would fall through to the simple-update path and raise a clear Prisma error
 * (no scalar `senses` column on lexical_units), rather than being silently
 * skipped by the complex-change path.
 */
export function isSensesFieldName(fieldName: string): boolean {
  return isSensesExistsFieldName(fieldName);
}

export function parseSensesExistsFieldName(fieldName: string): { senseId: number } | null {
  if (!isSensesExistsFieldName(fieldName)) return null;
  const raw = fieldName.slice(SENSES_PREFIX.length, -EXISTS_SUFFIX.length);
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) return null;
  return { senseId: n };
}

export function sensesExistsFieldName(senseId: number): string {
  return `${SENSES_PREFIX}${senseId}${EXISTS_SUFFIX}`;
}
