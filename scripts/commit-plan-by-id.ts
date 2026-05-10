/**
 * One-off driver: commit a `change_plans` row by id and print the result.
 *
 * Usage:
 *   npx tsx scripts/commit-plan-by-id.ts <planId>
 *
 * Useful for end-to-end testing of new plan kinds without going
 * through the API/auth layer (e.g. `regenerate_role_mappings` after
 * the `e2e-regenerate-role-mappings-drive.ts` script in
 * source-health-check-runner).
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();

import { commitPlan } from '../src/lib/version-control/commit-plan';

const TEST_USER = 'commit-plan-by-id-script';

async function main() {
  const arg = process.argv[2];
  if (!arg || !/^\d+$/.test(arg)) {
    throw new Error('usage: commit-plan-by-id.ts <planId>');
  }
  const planId = BigInt(arg);
  console.log(`>>> Committing plan ${planId.toString()} as ${TEST_USER}`);
  const result = await commitPlan(planId, TEST_USER);
  console.log(JSON.stringify(
    {
      success: result.success,
      attempted: result.attempted,
      committed: result.committed,
      errors: result.errors.map((e) => ({
        ...e,
        changeset_id: e.changeset_id.toString(),
        entity_id: e.entity_id?.toString() ?? null,
      })),
      conflictReport: result.conflictReport,
    },
    null,
    2,
  ));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err?.stack ?? err?.message ?? err);
    process.exit(1);
  });
