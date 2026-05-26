export type {
  CuratedMappingFile,
  MedicalConceptRecord,
  MedicalVocabulary,
  SourcePlacement,
} from './types';
export { MEDICAL_VOCABULARIES } from './types';
export {
  flattenConceptRecords,
  loadCuratedMappingFiles,
  resolveSourceMedicalRoot,
} from './load-mappings';
export {
  buildParentMap,
  ensureArchetypeRoots,
  externalIdEntries,
  findConceptByExternalIds,
  importMedicalConcept,
  placementForRecord,
  resolveParentId,
  ensureParentRelation,
  upsertExternalIds,
} from './import';
export {
  resolveConceptByAnyExternalId,
  resolveConceptByExternalId,
  resolveConceptBySourceMedicalId,
} from './resolve';
