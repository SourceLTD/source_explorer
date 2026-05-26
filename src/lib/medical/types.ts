import type { concept_archetype_enum, concept_subtype_enum } from '@prisma/client';

export type MedicalVocabulary = 'umls_cui' | 'source_medical';

export interface SourcePlacement {
  archetype: concept_archetype_enum;
  subtype: concept_subtype_enum | null;
  parent_kind: 'archetype_root' | 'subtype_hub';
  suggested_parent_label?: string;
}

export interface MedicalConceptRecord {
  id: string;
  label: string;
  preferred_term?: string;
  archetype: concept_archetype_enum;
  subtype: concept_subtype_enum | null;
  definition?: string;
  external_ids: { umls_cui: string };
  synonyms?: string[];
  source_placement?: SourcePlacement;
  related_concepts?: Array<{ id: string; relation: string }>;
}

export interface CuratedMappingFile {
  concept: MedicalConceptRecord;
  mappings?: unknown[];
  variants?: MedicalConceptRecord[];
}

export const MEDICAL_VOCABULARIES: MedicalVocabulary[] = ['umls_cui', 'source_medical'];
