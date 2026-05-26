/**
 * Bulk-commits all pending `move_frame_parent` change plans created by
 * the health-check remediation pipeline (finding_id IS NOT NULL).
 *
 * Delegates to `bulkCommitPlans` in the version-control library.
 *
 * Usage:
 *   npx tsx scripts/bulk-commit-reparents.ts
 *
 * Options (env vars):
 *   DRY_RUN=1       - print what would be committed without committing
 *   COMMITTED_BY=.. - reviewer label (default "system:bulk-commit")
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { bulkCommitPlans } from '../src/lib/version-control/bulk-commit-plans';

const DRY_RUN = process.env.DRY_RUN === '1';
const COMMITTED_BY = process.env.COMMITTED_BY ?? 'system:bulk-commit';

async function main() {
  if (DRY_RUN) {
    console.log('DRY_RUN=1 — listing only, use the pending-changes UI or rerun without DRY_RUN.');
    return;
  }

  console.log(`Committing pending reparent plans (COMMITTED_BY=${COMMITTED_BY})...`);
  const t0 = Date.now();
  const result = await bulkCommitPlans({
    planKind: 'move_frame_parent',
    committedBy: COMMITTED_BY,
  });

  if (result.error) {
    console.error('FATAL:', result.error);
    process.exit(1);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `\nDone in ${elapsed}s. Found ${result.total}; committed ${result.committed} plans (${result.changesetsCommitted} changesets), discarded ${result.discarded} duplicates.`,
  );
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
