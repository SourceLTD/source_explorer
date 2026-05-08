-- Drop the unused `remediation` column from health_diagnosis_codes.
-- Idempotent: safe to re-run.
ALTER TABLE health_diagnosis_codes
  DROP COLUMN IF EXISTS remediation;
