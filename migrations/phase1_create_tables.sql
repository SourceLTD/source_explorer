-- ============================================================================
-- PHASE 1: CREATE NEW TABLES AND ADD NEW COLUMNS
-- ============================================================================
-- This migration creates the new lexical_units table, lexical_unit_relations
-- table, and adds new columns to existing tables.
--
-- OLD TABLES ARE NOT MODIFIED OR DROPPED - they remain as-is for rollback.
--
-- Run with: psql $DATABASE_URL -f migrations/phase1_create_tables.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1.1 Create part_of_speech enum
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE part_of_speech AS ENUM ('verb', 'noun', 'adjective', 'adverb');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 1.2 Create lexical_units table
-- ============================================================================

CREATE TABLE IF NOT EXISTS lexical_units (
    id BIGSERIAL PRIMARY KEY,
    pos part_of_speech NOT NULL,
    code VARCHAR UNIQUE NOT NULL,
    legacy_id VARCHAR NOT NULL,
    lemmas TEXT[] DEFAULT '{}',
    src_lemmas TEXT[] DEFAULT '{}',
    gloss TEXT NOT NULL,
    lexfile VARCHAR NOT NULL,
    examples TEXT[] DEFAULT '{}',
    is_mwe BOOLEAN DEFAULT false,
    
    -- Shared moderation fields
    flagged BOOLEAN DEFAULT false,
    flagged_reason TEXT,
    verifiable BOOLEAN DEFAULT false,
    unverifiable_reason TEXT,
    legal_gloss TEXT,
    legal_constraints TEXT[],
    
    -- Soft delete
    deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP(6),
    deleted_reason TEXT,
    
    -- Frame reference
    frame_id BIGINT REFERENCES frames(id) ON UPDATE NO ACTION,
    
    -- Search vectors (nullable, populated for non-verbs)
    gloss_tsv tsvector,
    examples_tsv tsvector,
    
    -- Embedding
    embedding vector,
    
    -- Versioning
    version INT DEFAULT 1,
    created_at TIMESTAMP(6) DEFAULT NOW(),
    updated_at TIMESTAMP(6) DEFAULT NOW(),
    
    -- Verb-specific (null for non-verbs)
    vendler_class vendler_class_type,
    created_from TEXT[] DEFAULT '{}',
    
    -- Verb and Noun shared (null for adjectives/adverbs)
    concrete BOOLEAN DEFAULT false,
    
    -- Noun-specific (null for non-nouns)
    countable BOOLEAN,
    proper BOOLEAN DEFAULT false,
    collective BOOLEAN DEFAULT false,
    predicate BOOLEAN DEFAULT false,
    
    -- Adjective-specific (null for non-adjectives)
    is_satellite BOOLEAN DEFAULT false,
    gradable BOOLEAN,
    predicative BOOLEAN DEFAULT true,
    attributive BOOLEAN DEFAULT true,
    subjective BOOLEAN DEFAULT false,
    relational BOOLEAN DEFAULT false
);

-- Create indexes for lexical_units
CREATE INDEX IF NOT EXISTS idx_lexical_units_pos ON lexical_units(pos);
CREATE INDEX IF NOT EXISTS idx_lexical_units_frame_id ON lexical_units(frame_id);
CREATE INDEX IF NOT EXISTS idx_lexical_units_deleted ON lexical_units(deleted);
CREATE INDEX IF NOT EXISTS idx_lexical_units_flagged ON lexical_units(flagged);
CREATE INDEX IF NOT EXISTS idx_lexical_units_verifiable ON lexical_units(verifiable);
CREATE INDEX IF NOT EXISTS idx_lexical_units_lemmas_gin ON lexical_units USING GIN(lemmas);
CREATE INDEX IF NOT EXISTS idx_lexical_units_gloss_tsv ON lexical_units USING GIN(gloss_tsv);
CREATE INDEX IF NOT EXISTS idx_lexical_units_examples_tsv ON lexical_units USING GIN(examples_tsv);
CREATE INDEX IF NOT EXISTS idx_lexical_units_lexfile ON lexical_units(lexfile);
CREATE INDEX IF NOT EXISTS idx_lexical_units_vendler_class ON lexical_units(vendler_class);

-- Unique constraint for (id, frame_id) - used by relationships
CREATE UNIQUE INDEX IF NOT EXISTS uq_lexical_unit_id_frame ON lexical_units(id, frame_id);

-- Embedding index (if vector extension is available)
-- Using HNSW which doesn't require pre-specifying list count and generally performs better
DO $$ BEGIN
    CREATE INDEX idx_lexical_units_embedding ON lexical_units USING hnsw(embedding vector_cosine_ops);
EXCEPTION
    WHEN undefined_object THEN 
        RAISE NOTICE 'Vector extension not available, skipping embedding index';
    WHEN others THEN
        -- Fall back to ivfflat if hnsw not available
        BEGIN
            CREATE INDEX idx_lexical_units_embedding ON lexical_units USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);
        EXCEPTION
            WHEN others THEN
                RAISE NOTICE 'Could not create vector index: %', SQLERRM;
        END;
END $$;

-- ============================================================================
-- 1.3 Create unified lexical_unit_relation_type enum
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE lexical_unit_relation_type AS ENUM (
        -- From verb_relations (RelationType)
        'also_see', 'causes', 'entails', 'hypernym', 'hyponym',
        'starts', 'ends', 'precedes', 'during', 'enables', 'do_again', 'co_temporal',
        -- From noun_relations
        'instance_hypernym', 'instance_hyponym',
        'meronym_part', 'holonym_part', 'meronym_member', 'holonym_member',
        'meronym_substance', 'holonym_substance',
        'similar_to', 'attribute', 'derivationally_related', 'pertainym',
        'domain_topic', 'domain_region', 'domain_usage',
        'member_of_domain_topic', 'member_of_domain_region', 'member_of_domain_usage',
        -- From adjective_relations
        'similar', 'antonym', 'exemplifies', 'participle_of', 'related_to',
        -- From adverb_relations
        'also'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 1.4 Create lexical_unit_relations table
-- ============================================================================

CREATE TABLE IF NOT EXISTS lexical_unit_relations (
    id BIGSERIAL PRIMARY KEY,
    source_id BIGINT NOT NULL REFERENCES lexical_units(id) ON DELETE CASCADE,
    target_id BIGINT NOT NULL REFERENCES lexical_units(id) ON DELETE CASCADE,
    type lexical_unit_relation_type NOT NULL,
    weight FLOAT,
    properties JSONB,
    version INT DEFAULT 1,
    created_at TIMESTAMP(6) DEFAULT NOW(),
    updated_at TIMESTAMP(6) DEFAULT NOW(),
    
    UNIQUE(source_id, type, target_id)
);

-- Create indexes for lexical_unit_relations
CREATE INDEX IF NOT EXISTS idx_lu_relations_source ON lexical_unit_relations(source_id);
CREATE INDEX IF NOT EXISTS idx_lu_relations_target ON lexical_unit_relations(target_id);
CREATE INDEX IF NOT EXISTS idx_lu_relations_type ON lexical_unit_relations(type);
CREATE INDEX IF NOT EXISTS idx_lu_relations_source_type ON lexical_unit_relations(source_id, type);
CREATE INDEX IF NOT EXISTS idx_lu_relations_target_type ON lexical_unit_relations(target_id, type);
CREATE INDEX IF NOT EXISTS idx_lu_relations_properties ON lexical_unit_relations USING GIN(properties);

-- ============================================================================
-- 1.5 Add new columns to existing tables (alongside old columns)
-- ============================================================================

-- Add frame_id to recipes (alongside verb_id)
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS frame_id BIGINT REFERENCES frames(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_recipes_frame_id ON recipes(frame_id);

-- Add predicate_frame_id to recipe_predicates (alongside predicate_verb_id)
ALTER TABLE recipe_predicates ADD COLUMN IF NOT EXISTS predicate_frame_id BIGINT REFERENCES frames(id);
CREATE INDEX IF NOT EXISTS idx_recipe_predicates_frame_id ON recipe_predicates(predicate_frame_id);

-- Add frame_id to role_groups (alongside verb_id)
ALTER TABLE role_groups ADD COLUMN IF NOT EXISTS frame_id BIGINT REFERENCES frames(id);
CREATE INDEX IF NOT EXISTS idx_role_groups_frame_id ON role_groups(frame_id);

-- Add lexical_unit_id to llm_job_items
ALTER TABLE llm_job_items ADD COLUMN IF NOT EXISTS lexical_unit_id BIGINT REFERENCES lexical_units(id);
CREATE INDEX IF NOT EXISTS idx_llm_job_items_lexical_unit ON llm_job_items(lexical_unit_id);

-- Add lexical_unit_id to recipe_variables (for noun references)
ALTER TABLE recipe_variables ADD COLUMN IF NOT EXISTS lexical_unit_id BIGINT REFERENCES lexical_units(id);
CREATE INDEX IF NOT EXISTS idx_recipe_variables_lexical_unit ON recipe_variables(lexical_unit_id);

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (run these manually to verify schema creation)
-- ============================================================================
-- SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'lexical_units';
-- SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'lexical_unit_relations';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'recipes' AND column_name = 'frame_id';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'llm_job_items' AND column_name = 'lexical_unit_id';
