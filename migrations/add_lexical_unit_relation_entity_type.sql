-- Migration: Add 'lexical_unit_relation' to entity_type enum
-- Needed for version-control changesets + audit_log rows targeting unified lexical unit relations.

ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'lexical_unit_relation';

