-- Strips the legacy "- N rows affected" suffix from issue titles.
--
-- The health-check runner used to append the live row-count to every
-- auto-created issue's title:
--
--     [DR_001] Some diagnosis label - 42 rows affected
--
-- The number grew stale as more findings were linked or resolved over
-- the issue's lifetime. The runner no longer appends this suffix, and
-- the UI now surfaces a live "Rows" column instead. This migration
-- normalises the historical titles to match.
--
-- Idempotent: running again is a no-op once titles are clean. The
-- regex tolerates singular ("1 row affected") and pluralised forms,
-- as well as variable whitespace, just in case.

UPDATE issues
SET title = regexp_replace(title, '\s+-\s+\d+\s+rows?\s+affected\s*$', '')
WHERE title ~ '\s+-\s+\d+\s+rows?\s+affected\s*$';
