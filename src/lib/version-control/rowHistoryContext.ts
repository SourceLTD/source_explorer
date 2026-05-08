/**
 * Row-history trigger context helpers.
 *
 * The `log_entity_row_history` trigger (see migrations/add_row_history.sql)
 * reads actor + changeset metadata from per-transaction PostgreSQL GUCs:
 *
 *   - app.user_id       (text)   the actor performing the commit
 *   - app.changeset_id  (bigint) the changeset that originated the mutation
 *
 * These must be set *inside* the transaction, before any mutation on tracked
 * tables, using `set_config(name, value, is_local := true)` so the values
 * are scoped to the current transaction only.
 */

import { Prisma } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

/**
 * Stamp the current transaction with actor + changeset context so that
 * row-history triggers can attribute the resulting mutations.
 *
 * `changesetId` is serialized as a decimal string and coerced back to
 * BIGINT in the trigger.
 */
export async function setRowHistoryContext(
  tx: TxClient,
  opts: {
    userId?: string | null;
    changesetId?: bigint | null;
  },
): Promise<void> {
  const userId = opts.userId ?? '';
  const changesetId =
    opts.changesetId !== null && opts.changesetId !== undefined
      ? opts.changesetId.toString()
      : '';

  await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
  await tx.$executeRaw`SELECT set_config('app.changeset_id', ${changesetId}, true)`;
}
