-- Migration: Add 'allocate' to llm_job_type enum
-- This supports ALLOCATE jobs in the AI Jobs overlay.
-- Safe to run multiple times due to IF NOT EXISTS.

ALTER TYPE llm_job_type ADD VALUE IF NOT EXISTS 'allocate';

-- Keep the type comment up to date (optional / best-effort).
COMMENT ON TYPE llm_job_type IS 'Types of LLM jobs: flag (flag issues), edit (improve data), allocate (find better parent), allocate_contents (move contents), review (review pending changes), split (divide entity into multiple entities)';

