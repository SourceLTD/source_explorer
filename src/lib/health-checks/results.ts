/**
 * Server-side helpers for recording health check results.
 *
 * Designed to be called from the worker (or any server context) after a
 * single check has finished evaluating a single entity. Wraps the writes
 * into a transaction so the run aggregates and per-entity state stay in
 * sync with the new result row.
 */

import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type {
  HealthCheckEntityType,
  HealthCheckResultStatus,
} from './types';

export function toBigInt(value: bigint | number | string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`Invalid id: ${value}`);
    }
    return BigInt(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(`Invalid id string: ${value}`);
    }
    return BigInt(trimmed);
  }
  throw new Error(`Unsupported id type: ${typeof value}`);
}

/**
 * Stable JSON stringification with sorted object keys, used for hashing the
 * `entity_key` field so the same logical key always hashes to the same string
 * regardless of property order at write time.
 */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => stableStringify(v)).join(',') + ']';
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return (
    '{' +
    entries.map(([k, v]) => JSON.stringify(k) + ':' + stableStringify(v)).join(',') +
    '}'
  );
}

export function getHealthCheckEntityKeyHash(
  entityKey?: Prisma.InputJsonValue | null,
): string {
  if (entityKey === null || entityKey === undefined) return '';
  return createHash('sha256').update(stableStringify(entityKey)).digest('hex');
}

/**
 * Refresh the aggregate counters on a `health_check_runs` row from its
 * children. Cheap enough at the result-row scale we expect; if it ever
 * becomes a hot path we can switch to incremental delta updates.
 */
export async function refreshHealthCheckRunCounts(
  tx: Prisma.TransactionClient,
  runId: bigint,
): Promise<void> {
  const groups = await tx.health_check_results.groupBy({
    by: ['status'],
    where: { run_id: runId },
    _count: { _all: true },
  });

  const counts: Record<HealthCheckResultStatus, number> = {
    passed: 0,
    warning: 0,
    failed: 0,
    error: 0,
    skipped: 0,
  };
  let processed = 0;
  for (const g of groups) {
    counts[g.status as HealthCheckResultStatus] = g._count._all;
    processed += g._count._all;
  }

  await tx.health_check_runs.update({
    where: { id: runId },
    data: {
      processed_items: processed,
      passed_items: counts.passed,
      warning_items: counts.warning,
      failed_items: counts.failed,
      error_items: counts.error,
    },
  });
}

export interface RecordHealthCheckFindingInput {
  diagnosis_code_id: bigint | number | string;
  title: string;
  message?: string | null;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  evidence?: Prisma.InputJsonValue | null;
  suggested_fix?: Prisma.InputJsonValue | null;
}

export interface RecordHealthCheckResultInput {
  run_id: bigint | number | string;
  check_definition_id: bigint | number | string;
  entity_type: HealthCheckEntityType;
  entity_id: bigint | number | string;
  entity_key?: Prisma.InputJsonValue | null;
  status: HealthCheckResultStatus;
  summary?: string | null;
  reasoning?: string | null;
  confidence?: number | null;
  target_version?: number | null;
  target_fingerprint?: string | null;
  request_payload?: Prisma.InputJsonValue | null;
  response_payload?: Prisma.InputJsonValue | null;
  metadata?: Prisma.InputJsonValue | null;
  error?: string | null;
  findings?: RecordHealthCheckFindingInput[];
}

export interface RecordHealthCheckResultOutput {
  result_id: bigint;
  finding_ids: bigint[];
}

/**
 * Persist a single health check result, its findings, and refresh the
 * derived state for the targeted entity. All writes happen in a single
 * Prisma transaction.
 */
export async function recordHealthCheckResult(
  input: RecordHealthCheckResultInput,
): Promise<RecordHealthCheckResultOutput> {
  const runId = toBigInt(input.run_id);
  const checkDefinitionId = toBigInt(input.check_definition_id);
  const entityId = toBigInt(input.entity_id);
  const entityKeyHash = getHealthCheckEntityKeyHash(input.entity_key ?? null);
  const checkedAt = new Date();

  return prisma.$transaction(async (tx) => {
    const result = await tx.health_check_results.create({
      data: {
        run_id: runId,
        check_definition_id: checkDefinitionId,
        entity_type: input.entity_type,
        entity_id: entityId,
        entity_key: input.entity_key ?? Prisma.JsonNull,
        status: input.status,
        summary: input.summary ?? null,
        reasoning: input.reasoning ?? null,
        confidence: input.confidence ?? null,
        target_version: input.target_version ?? null,
        target_fingerprint: input.target_fingerprint ?? null,
        request_payload: input.request_payload ?? Prisma.JsonNull,
        response_payload: input.response_payload ?? Prisma.JsonNull,
        metadata: input.metadata ?? Prisma.JsonNull,
        error: input.error ?? null,
        checked_at: checkedAt,
      },
    });

    const findingIds: bigint[] = [];
    if (input.findings && input.findings.length > 0) {
      for (const f of input.findings) {
        const created = await tx.health_check_findings.create({
          data: {
            result_id: result.id,
            diagnosis_code_id: toBigInt(f.diagnosis_code_id),
            severity: f.severity ?? 'medium',
            title: f.title,
            message: f.message ?? null,
            evidence: f.evidence ?? Prisma.JsonNull,
            suggested_fix: f.suggested_fix ?? Prisma.JsonNull,
            first_seen_at: checkedAt,
            last_seen_at: checkedAt,
          },
        });
        findingIds.push(created.id);
      }
    }

    const openFindings = await tx.health_check_findings.count({
      where: {
        result: {
          check_definition_id: checkDefinitionId,
          entity_type: input.entity_type,
          entity_id: entityId,
        },
        status: 'open',
      },
    });

    await tx.health_check_state.upsert({
      where: {
        check_definition_id_entity_type_entity_id_entity_key_hash: {
          check_definition_id: checkDefinitionId,
          entity_type: input.entity_type,
          entity_id: entityId,
          entity_key_hash: entityKeyHash,
        },
      },
      create: {
        check_definition_id: checkDefinitionId,
        entity_type: input.entity_type,
        entity_id: entityId,
        entity_key_hash: entityKeyHash,
        entity_key: input.entity_key ?? Prisma.JsonNull,
        last_result_id: result.id,
        last_status: input.status,
        last_checked_at: checkedAt,
        target_version: input.target_version ?? null,
        target_fingerprint: input.target_fingerprint ?? null,
        open_findings_count: openFindings,
        stale: false,
      },
      update: {
        entity_key: input.entity_key ?? Prisma.JsonNull,
        last_result_id: result.id,
        last_status: input.status,
        last_checked_at: checkedAt,
        target_version: input.target_version ?? null,
        target_fingerprint: input.target_fingerprint ?? null,
        open_findings_count: openFindings,
        stale: false,
      },
    });

    await refreshHealthCheckRunCounts(tx, runId);

    return { result_id: result.id, finding_ids: findingIds };
  });
}
