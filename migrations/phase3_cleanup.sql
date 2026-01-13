-- ============================================================================
-- PHASE 3: CLEANUP - DROP OLD TABLES AND COLUMNS
-- ============================================================================
-- DANGER: This migration permanently removes old tables and data!
-- 
-- PREREQUISITES:
--   1. Phase 1 and Phase 2 completed successfully
--   2. Validation script passes with 100% success
--   3. Application has been running on new tables in production
--   4. Database backup has been taken
--
-- Run with: psql $DATABASE_URL -f migrations/phase3_cleanup.sql
-- ============================================================================

-- ============================================================================
-- PRE-CLEANUP VERIFICATION
-- Run these queries manually before proceeding
-- ============================================================================
-- SELECT 
--   (SELECT COUNT(*) FROM verbs) as verbs,
--   (SELECT COUNT(*) FROM lexical_units WHERE pos = 'verb') as lu_verbs,
--   (SELECT COUNT(*) FROM nouns) as nouns,
--   (SELECT COUNT(*) FROM lexical_units WHERE pos = 'noun') as lu_nouns,
--   (SELECT COUNT(*) FROM adjectives) as adjectives,
--   (SELECT COUNT(*) FROM lexical_units WHERE pos = 'adjective') as lu_adjectives,
--   (SELECT COUNT(*) FROM adverbs) as adverbs,
--   (SELECT COUNT(*) FROM lexical_units WHERE pos = 'adverb') as lu_adverbs;
--
-- Check for data that will be deleted with roles table:
-- SELECT COUNT(*) as role_bindings FROM recipe_predicate_role_bindings;
-- SELECT COUNT(*) as role_preconditions FROM recipe_preconditions WHERE target_role_id IS NOT NULL;
--
-- All counts should match before proceeding!
-- ============================================================================

BEGIN;

-- ============================================================================
-- 3.1 Drop old FK columns from modified tables
-- ============================================================================

-- Remove verb_id from recipes (now uses frame_id)
ALTER TABLE recipes DROP COLUMN IF EXISTS verb_id;

-- Remove predicate_verb_id from recipe_predicates (now uses predicate_frame_id)
ALTER TABLE recipe_predicates DROP COLUMN IF EXISTS predicate_verb_id;

-- Remove verb_id from role_groups (now uses frame_id)
ALTER TABLE role_groups DROP COLUMN IF EXISTS verb_id;

-- Remove old POS-specific columns from llm_job_items (now uses lexical_unit_id)
ALTER TABLE llm_job_items DROP COLUMN IF EXISTS verb_id;
ALTER TABLE llm_job_items DROP COLUMN IF EXISTS noun_id;
ALTER TABLE llm_job_items DROP COLUMN IF EXISTS adjective_id;
ALTER TABLE llm_job_items DROP COLUMN IF EXISTS adverb_id;

-- Remove noun_id from recipe_variables (now uses lexical_unit_id)
ALTER TABLE recipe_variables DROP COLUMN IF EXISTS noun_id;

-- ============================================================================
-- 3.2 Add NOT NULL constraints now that old columns are gone
-- ============================================================================

-- recipes.frame_id should be NOT NULL (was verb_id before)
-- Note: Only do this if all recipes have been migrated
-- ALTER TABLE recipes ALTER COLUMN frame_id SET NOT NULL;

-- ============================================================================
-- 3.3 Handle verb roles (roles table) and dependent data
-- ============================================================================
-- WARNING: The roles table is referenced by:
--   - recipe_predicate_role_bindings.predicate_role_id (NOT NULL)
--   - recipe_predicate_role_bindings.verb_role_id
--   - recipe_preconditions.target_role_id
--
-- Dropping roles with CASCADE will DELETE all recipe_predicate_role_bindings!
-- This is intentional as we're removing verb roles from the system.
-- ============================================================================

-- Log what will be deleted
DO $$
DECLARE
    binding_count INTEGER;
    precondition_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO binding_count FROM recipe_predicate_role_bindings;
    SELECT COUNT(*) INTO precondition_count FROM recipe_preconditions WHERE target_role_id IS NOT NULL;
    
    IF binding_count > 0 THEN
        RAISE WARNING 'Deleting % recipe_predicate_role_bindings (verb roles removed)', binding_count;
    END IF;
    IF precondition_count > 0 THEN
        RAISE WARNING 'Deleting % role-based recipe_preconditions (verb roles removed)', precondition_count;
    END IF;
END $$;

-- Delete role-based preconditions entirely (they're meaningless without the roles table)
-- The check constraint requires either target_role_id OR target_recipe_predicate_id for non-custom types
DELETE FROM recipe_preconditions WHERE condition_type::text IN ('role_is_null', 'role_not_null');

-- Now drop the roles table - this will CASCADE delete recipe_predicate_role_bindings
DROP TABLE IF EXISTS roles CASCADE;

-- ============================================================================
-- 3.4 Drop old relation tables
-- ============================================================================

DROP TABLE IF EXISTS verb_relations CASCADE;
DROP TABLE IF EXISTS noun_relations CASCADE;
DROP TABLE IF EXISTS adjective_relations CASCADE;
DROP TABLE IF EXISTS adverb_relations CASCADE;

-- ============================================================================
-- 3.5 Drop old POS tables
-- ============================================================================

DROP TABLE IF EXISTS verbs CASCADE;
DROP TABLE IF EXISTS nouns CASCADE;
DROP TABLE IF EXISTS adjectives CASCADE;
DROP TABLE IF EXISTS adverbs CASCADE;

-- ============================================================================
-- 3.6 Drop old enum types
-- ============================================================================

DROP TYPE IF EXISTS relation_type CASCADE;
DROP TYPE IF EXISTS noun_relation_type CASCADE;
DROP TYPE IF EXISTS adjective_relation_type CASCADE;
DROP TYPE IF EXISTS adverb_relation_type CASCADE;

COMMIT;

-- ============================================================================
-- POST-CLEANUP VERIFICATION
-- ============================================================================
-- Run these to verify cleanup:
--
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- AND table_name IN ('verbs', 'nouns', 'adjectives', 'adverbs', 
--                    'verb_relations', 'noun_relations', 'adjective_relations', 'adverb_relations',
--                    'roles');
-- Should return 0 rows
--
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'recipes' AND column_name = 'verb_id';
-- Should return 0 rows
--
-- SELECT column_name FROM information_schema.columns 
-- WHERE table_name = 'llm_job_items' AND column_name IN ('verb_id', 'noun_id', 'adjective_id', 'adverb_id');
-- Should return 0 rows
-- ============================================================================

-- ============================================================================
-- NEXT STEPS AFTER RUNNING THIS MIGRATION:
-- ============================================================================
-- 1. Run: npx prisma db pull
--    This regenerates schema.prisma without the old tables
--
-- 2. Run: npx prisma generate
--    This regenerates the Prisma client
--
-- 3. Remove any remaining code references to old tables
--
-- 4. Delete the validation script (no longer needed)
-- ============================================================================
