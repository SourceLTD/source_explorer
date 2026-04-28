import {
  IssuePriority,
  IssueStatus,
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
} from './types';

/**
 * Parse a string/number into a `bigint`, returning `null` for any value that
 * doesn't represent a finite, whole, non-negative integer.
 *
 * Using a narrow regex before `BigInt(...)` avoids:
 * - throws on non-numeric strings
 * - accepting "1.5" (BigInt throws on this)
 * - accepting floats like `1.5` that pass through `Number` but are invalid ids
 */
export function parseIdParam(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value >= 0n ? value : null;
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) return null;
    return BigInt(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    try {
      return BigInt(trimmed);
    } catch {
      return null;
    }
  }
  return null;
}

export function isIssueStatus(value: unknown): value is IssueStatus {
  return typeof value === 'string' && (ISSUE_STATUSES as readonly string[]).includes(value);
}

export function isIssuePriority(value: unknown): value is IssuePriority {
  return typeof value === 'string' && (ISSUE_PRIORITIES as readonly string[]).includes(value);
}

/**
 * Coerce a "nullable string" input to either a non-empty trimmed string or `null`.
 * Treats `undefined`, `null`, and whitespace-only strings as `null`.
 */
export function nullableTrim(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Sanitize a labels array: keep only non-empty trimmed strings.
 */
export function sanitizeLabels(value: unknown): string[] {
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
  }
  return out;
}

/** True if the error is a Prisma "record not found" error (P2025). */
export function isPrismaNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2025'
  );
}
