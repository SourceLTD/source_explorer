-- Adds frame-level classification and health check opt-out columns.
-- Existing frames start opted out; newly created frames default to health checks enabled.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'frames'
      AND column_name = 'subtype'
  ) THEN
    ALTER TABLE frames ADD COLUMN subtype TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'frames'
      AND column_name = 'disable_healthcheck'
  ) THEN
    ALTER TABLE frames
      ADD COLUMN disable_healthcheck BOOLEAN NOT NULL DEFAULT FALSE;

    UPDATE frames
    SET disable_healthcheck = TRUE;
  END IF;
END$$;

UPDATE frames
SET subtype = 'relation',
    frame_type = 'State'
WHERE lower(frame_type) IN ('relation', 'category');
