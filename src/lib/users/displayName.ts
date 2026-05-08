/**
 * Display-name conventions for synthetic user identifiers stored in
 * the database.
 *
 * The storage values stay stable (see `getCurrentUserName` in
 * `utils/supabase/server.ts` and `SYSTEM_ACTOR` in the health-check
 * runner — both write the literal string `'system'`). Rendering goes
 * through this module so we can put a friendly face on the actor
 * without touching historical rows.
 */

/** The literal string written to `created_by` / `actor` / `author` columns. */
export const SYSTEM_USER_ID = 'system';

/** Friendly name shown to humans wherever the system actor appears. */
export const SYSTEM_USER_DISPLAY_NAME = 'Gabriel';
