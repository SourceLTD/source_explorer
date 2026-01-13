-- ============================================================================
-- PHASE 1: MIGRATE DATA FROM OLD TABLES TO NEW TABLES
-- ============================================================================
-- This migration copies all data from verbs, nouns, adjectives, adverbs
-- to the new lexical_units table, and migrates all relations.
--
-- OLD TABLES ARE NOT MODIFIED - data is COPIED, not moved.
--
-- Run with: psql $DATABASE_URL -f migrations/phase1_migrate_data.sql
-- ============================================================================

-- ============================================================================
-- PRE-MIGRATION VALIDATION (Run these queries BEFORE proceeding!)
-- ============================================================================
-- 
-- CRITICAL: Check for duplicate codes across POS types!
-- If any duplicates exist, the migration will skip them due to ON CONFLICT.
--
-- SELECT code, COUNT(*) as count FROM (
--   SELECT code FROM verbs UNION ALL SELECT code FROM nouns
--   UNION ALL SELECT code FROM adjectives UNION ALL SELECT code FROM adverbs
-- ) all_codes GROUP BY code HAVING COUNT(*) > 1;
--
-- If this returns ANY rows, you MUST resolve duplicates before migration!
--
-- Check for verbs without frame_id that have recipes - these will be orphaned!
-- 
-- SELECT COUNT(*) as orphan_recipes FROM recipes r
-- JOIN verbs v ON r.verb_id = v.id WHERE v.frame_id IS NULL;
--
-- SELECT COUNT(*) as orphan_predicates FROM recipe_predicates rp
-- JOIN verbs v ON rp.predicate_verb_id = v.id WHERE v.frame_id IS NULL;
--
-- If these counts are > 0, you must either:
--   1. Assign frames to those verbs first
--   2. Or accept that those recipes/predicates will have NULL frame references
-- ============================================================================

BEGIN;

-- ============================================================================
-- 2.1 Migrate lexical units from verbs
-- ============================================================================

INSERT INTO lexical_units (
    pos, code, legacy_id, lemmas, src_lemmas, gloss, lexfile, examples,
    flagged, flagged_reason, verifiable, unverifiable_reason, legal_gloss,
    deleted, deleted_at, deleted_reason, frame_id, embedding, version,
    created_at, updated_at, vendler_class, concrete, created_from
)
SELECT 
    'verb'::part_of_speech, 
    code, legacy_id, lemmas, src_lemmas, gloss, lexfile, examples,
    flagged, flagged_reason, verifiable, unverifiable_reason, legal_gloss,
    deleted, deleted_at, deleted_reason, frame_id, embedding, version,
    created_at, updated_at, vendler_class, concrete, created_from
FROM verbs
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 2.2 Migrate lexical units from nouns
-- ============================================================================

INSERT INTO lexical_units (
    pos, code, legacy_id, lemmas, src_lemmas, gloss, lexfile, examples,
    is_mwe, flagged, flagged_reason, verifiable, unverifiable_reason,
    legal_gloss, legal_constraints, deleted, deleted_at, deleted_reason,
    frame_id, gloss_tsv, examples_tsv, embedding, version, created_at, updated_at,
    countable, proper, collective, concrete, predicate
)
SELECT 
    'noun'::part_of_speech,
    code, legacy_id, lemmas, src_lemmas, gloss, lexfile, examples,
    is_mwe, flagged, flagged_reason, verifiable, unverifiable_reason,
    legal_gloss, legal_constraints, deleted, deleted_at, deleted_reason,
    frame_id, gloss_tsv, examples_tsv, embedding, version, created_at, updated_at,
    countable, proper, collective, concrete, predicate
FROM nouns
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 2.3 Migrate lexical units from adjectives
-- ============================================================================

INSERT INTO lexical_units (
    pos, code, legacy_id, lemmas, src_lemmas, gloss, lexfile, examples,
    is_mwe, flagged, flagged_reason, verifiable, unverifiable_reason,
    legal_gloss, legal_constraints, deleted, deleted_at, deleted_reason,
    frame_id, gloss_tsv, examples_tsv, embedding, version, created_at, updated_at,
    is_satellite, gradable, predicative, attributive, subjective, relational
)
SELECT 
    'adjective'::part_of_speech,
    code, legacy_id, lemmas, src_lemmas, gloss, lexfile, examples,
    is_mwe, flagged, flagged_reason, verifiable, unverifiable_reason,
    legal_gloss, legal_constraints, deleted, deleted_at, deleted_reason,
    frame_id, gloss_tsv, examples_tsv, embedding, version, created_at, updated_at,
    is_satellite, gradable, predicative, attributive, subjective, relational
FROM adjectives
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 2.4 Migrate lexical units from adverbs
-- ============================================================================

INSERT INTO lexical_units (
    pos, code, legacy_id, lemmas, src_lemmas, gloss, lexfile, examples,
    is_mwe, flagged, flagged_reason, verifiable, unverifiable_reason,
    legal_gloss, legal_constraints, deleted, deleted_at, deleted_reason,
    frame_id, gloss_tsv, examples_tsv, embedding, version, created_at, updated_at,
    gradable
)
SELECT 
    'adverb'::part_of_speech,
    code, legacy_id, lemmas, src_lemmas, gloss, lexfile, examples,
    is_mwe, flagged, flagged_reason, verifiable, unverifiable_reason,
    legal_gloss, legal_constraints, deleted, deleted_at, deleted_reason,
    frame_id, gloss_tsv, examples_tsv, embedding, version, created_at, updated_at,
    gradable
FROM adverbs
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- ============================================================================
-- 2.5 Create temporary mapping tables and migrate relations
-- ============================================================================
-- Note: Run this as a separate transaction to ensure lexical_units is populated

BEGIN;

-- Create temporary mapping tables
CREATE TEMP TABLE verb_id_map AS
SELECT v.id as old_id, lu.id as new_id 
FROM verbs v
JOIN lexical_units lu ON lu.code = v.code AND lu.pos = 'verb';

CREATE TEMP TABLE noun_id_map AS
SELECT n.id as old_id, lu.id as new_id 
FROM nouns n
JOIN lexical_units lu ON lu.code = n.code AND lu.pos = 'noun';

CREATE TEMP TABLE adjective_id_map AS
SELECT a.id as old_id, lu.id as new_id 
FROM adjectives a
JOIN lexical_units lu ON lu.code = a.code AND lu.pos = 'adjective';

CREATE TEMP TABLE adverb_id_map AS
SELECT a.id as old_id, lu.id as new_id 
FROM adverbs a
JOIN lexical_units lu ON lu.code = a.code AND lu.pos = 'adverb';

-- Migrate verb relations
INSERT INTO lexical_unit_relations (source_id, target_id, type, version, created_at, updated_at)
SELECT sm.new_id, tm.new_id, vr.type::text::lexical_unit_relation_type, vr.version, NOW(), NOW()
FROM verb_relations vr
JOIN verb_id_map sm ON vr.source_id = sm.old_id
JOIN verb_id_map tm ON vr.target_id = tm.old_id
ON CONFLICT (source_id, type, target_id) DO NOTHING;

-- Migrate noun relations
INSERT INTO lexical_unit_relations (source_id, target_id, type, weight, properties, version, created_at, updated_at)
SELECT sm.new_id, tm.new_id, nr.type::text::lexical_unit_relation_type, nr.weight, nr.properties, nr.version, 
       COALESCE(nr.created_at, NOW()), COALESCE(nr.updated_at, NOW())
FROM noun_relations nr
JOIN noun_id_map sm ON nr.source_id = sm.old_id
JOIN noun_id_map tm ON nr.target_id = tm.old_id
ON CONFLICT (source_id, type, target_id) DO NOTHING;

-- Migrate adjective relations
INSERT INTO lexical_unit_relations (source_id, target_id, type, weight, properties, version, created_at, updated_at)
SELECT sm.new_id, tm.new_id, ar.type::text::lexical_unit_relation_type, ar.weight, ar.properties, ar.version,
       COALESCE(ar.created_at, NOW()), COALESCE(ar.updated_at, NOW())
FROM adjective_relations ar
JOIN adjective_id_map sm ON ar.source_id = sm.old_id
JOIN adjective_id_map tm ON ar.target_id = tm.old_id
ON CONFLICT (source_id, type, target_id) DO NOTHING;

-- Migrate adverb relations
INSERT INTO lexical_unit_relations (source_id, target_id, type, weight, properties, version, created_at, updated_at)
SELECT sm.new_id, tm.new_id, ar.type::text::lexical_unit_relation_type, ar.weight, ar.properties, ar.version,
       COALESCE(ar.created_at, NOW()), COALESCE(ar.updated_at, NOW())
FROM adverb_relations ar
JOIN adverb_id_map sm ON ar.source_id = sm.old_id
JOIN adverb_id_map tm ON ar.target_id = tm.old_id
ON CONFLICT (source_id, type, target_id) DO NOTHING;

COMMIT;

-- ============================================================================
-- 2.6 Migrate recipes to frames
-- ============================================================================

BEGIN;

-- Log verbs without frames that have recipes (these will have NULL frame_id)
DO $$
DECLARE
    orphan_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO orphan_count FROM recipes r
    JOIN verbs v ON r.verb_id = v.id WHERE v.frame_id IS NULL;
    
    IF orphan_count > 0 THEN
        RAISE WARNING '% recipes reference verbs without frame_id - they will have NULL frame_id after migration', orphan_count;
    END IF;
END $$;

-- Update recipes.frame_id from verb's frame_id
UPDATE recipes r
SET frame_id = v.frame_id
FROM verbs v
WHERE r.verb_id = v.id AND v.frame_id IS NOT NULL AND r.frame_id IS NULL;

-- Log predicates without frames
DO $$
DECLARE
    orphan_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO orphan_count FROM recipe_predicates rp
    JOIN verbs v ON rp.predicate_verb_id = v.id WHERE v.frame_id IS NULL;
    
    IF orphan_count > 0 THEN
        RAISE WARNING '% recipe_predicates reference verbs without frame_id - they will have NULL predicate_frame_id after migration', orphan_count;
    END IF;
END $$;

-- Update recipe_predicates.predicate_frame_id from verb's frame_id
UPDATE recipe_predicates rp
SET predicate_frame_id = v.frame_id
FROM verbs v
WHERE rp.predicate_verb_id = v.id AND v.frame_id IS NOT NULL AND rp.predicate_frame_id IS NULL;

COMMIT;

-- ============================================================================
-- 2.7 Migrate role_groups to frames
-- ============================================================================

BEGIN;

-- Update role_groups.frame_id from verb's frame_id
UPDATE role_groups rg
SET frame_id = v.frame_id
FROM verbs v
WHERE rg.verb_id = v.id AND v.frame_id IS NOT NULL AND rg.frame_id IS NULL;

COMMIT;

-- ============================================================================
-- 2.8 Migrate llm_job_items
-- ============================================================================

BEGIN;

-- Create mapping tables again (temp tables from earlier are gone)
CREATE TEMP TABLE verb_id_map AS
SELECT v.id as old_id, lu.id as new_id 
FROM verbs v
JOIN lexical_units lu ON lu.code = v.code AND lu.pos = 'verb';

CREATE TEMP TABLE noun_id_map AS
SELECT n.id as old_id, lu.id as new_id 
FROM nouns n
JOIN lexical_units lu ON lu.code = n.code AND lu.pos = 'noun';

CREATE TEMP TABLE adjective_id_map AS
SELECT a.id as old_id, lu.id as new_id 
FROM adjectives a
JOIN lexical_units lu ON lu.code = a.code AND lu.pos = 'adjective';

CREATE TEMP TABLE adverb_id_map AS
SELECT a.id as old_id, lu.id as new_id 
FROM adverbs a
JOIN lexical_units lu ON lu.code = a.code AND lu.pos = 'adverb';

-- Update lexical_unit_id from verb_id
UPDATE llm_job_items lji
SET lexical_unit_id = vm.new_id
FROM verb_id_map vm
WHERE lji.verb_id = vm.old_id AND lji.lexical_unit_id IS NULL;

-- Update lexical_unit_id from noun_id
UPDATE llm_job_items lji
SET lexical_unit_id = nm.new_id
FROM noun_id_map nm
WHERE lji.noun_id = nm.old_id AND lji.lexical_unit_id IS NULL;

-- Update lexical_unit_id from adjective_id
UPDATE llm_job_items lji
SET lexical_unit_id = am.new_id
FROM adjective_id_map am
WHERE lji.adjective_id = am.old_id AND lji.lexical_unit_id IS NULL;

-- Update lexical_unit_id from adverb_id
UPDATE llm_job_items lji
SET lexical_unit_id = dm.new_id
FROM adverb_id_map dm
WHERE lji.adverb_id = dm.old_id AND lji.lexical_unit_id IS NULL;

COMMIT;

-- ============================================================================
-- 2.9 Migrate recipe_variables noun references
-- ============================================================================

BEGIN;

-- Create noun mapping table
CREATE TEMP TABLE noun_id_map_rv AS
SELECT n.id as old_id, lu.id as new_id 
FROM nouns n
JOIN lexical_units lu ON lu.code = n.code AND lu.pos = 'noun';

-- Update lexical_unit_id from noun_id
UPDATE recipe_variables rv
SET lexical_unit_id = nm.new_id
FROM noun_id_map_rv nm
WHERE rv.noun_id = nm.old_id AND rv.lexical_unit_id IS NULL;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (run these manually after migration)
-- ============================================================================
-- SELECT 'verbs' as table_name, COUNT(*) FROM verbs
-- UNION ALL SELECT 'lexical_units (verb)', COUNT(*) FROM lexical_units WHERE pos = 'verb';
--
-- SELECT 'nouns' as table_name, COUNT(*) FROM nouns
-- UNION ALL SELECT 'lexical_units (noun)', COUNT(*) FROM lexical_units WHERE pos = 'noun';
--
-- SELECT 'verb_relations' as table_name, COUNT(*) FROM verb_relations
-- UNION ALL SELECT 'noun_relations', COUNT(*) FROM noun_relations
-- UNION ALL SELECT 'adjective_relations', COUNT(*) FROM adjective_relations
-- UNION ALL SELECT 'adverb_relations', COUNT(*) FROM adverb_relations
-- UNION ALL SELECT 'lexical_unit_relations (total)', COUNT(*) FROM lexical_unit_relations;
--
-- Verify recipe_variables migration:
-- SELECT COUNT(*) as missing FROM recipe_variables WHERE noun_id IS NOT NULL AND lexical_unit_id IS NULL;
