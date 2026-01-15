-- Migration: Add 'split' to llm_job_type enum
-- Description: Adds the 'split' job type for frame/superframe splitting operations
-- Date: 2026-01-13

-- Add the 'split' value to the llm_job_type enum
-- Note: ALTER TYPE ... ADD VALUE cannot be run inside a transaction block in PostgreSQL
-- This migration should be run separately or with COMMIT between statements

ALTER TYPE llm_job_type ADD VALUE IF NOT EXISTS 'split';

-- Verify the enum now includes 'split'
-- SELECT enumlabel FROM pg_enum WHERE enumtypid = 'llm_job_type'::regtype;

COMMENT ON TYPE llm_job_type IS 'Types of LLM jobs: flag (flag issues), edit (improve data), allocate_contents (move entries between frames), review (review pending changes), split (divide frame into multiple frames)';
