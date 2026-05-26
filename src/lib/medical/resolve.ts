import type { PrismaClient } from '@prisma/client';
import type { MedicalVocabulary } from './types';

export async function resolveConceptBySourceMedicalId(
  prisma: PrismaClient,
  sourceMedicalId: string,
): Promise<{ conceptId: bigint; label: string } | null> {
  const row = await prisma.concept_external_ids.findUnique({
    where: {
      vocabulary_external_id: {
        vocabulary: 'source_medical',
        external_id: sourceMedicalId,
      },
    },
    include: {
      concepts: { select: { id: true, label: true, deleted: true } },
    },
  });

  if (!row || row.concepts.deleted) return null;
  return { conceptId: row.concepts.id, label: row.concepts.label };
}

export async function resolveConceptByExternalId(
  prisma: PrismaClient,
  vocabulary: MedicalVocabulary,
  externalId: string,
): Promise<{ conceptId: bigint; label: string } | null> {
  const row = await prisma.concept_external_ids.findUnique({
    where: {
      vocabulary_external_id: { vocabulary, external_id: externalId },
    },
    include: {
      concepts: { select: { id: true, label: true, deleted: true } },
    },
  });

  if (!row || row.concepts.deleted) return null;
  return { conceptId: row.concepts.id, label: row.concepts.label };
}

export async function resolveConceptByAnyExternalId(
  prisma: PrismaClient,
  externalIds: Partial<Record<MedicalVocabulary, string>>,
): Promise<{ conceptId: bigint; label: string; matchedVocabulary: string } | null> {
  for (const [vocabulary, externalId] of Object.entries(externalIds)) {
    if (!externalId) continue;
    const hit = await resolveConceptByExternalId(
      prisma,
      vocabulary as MedicalVocabulary,
      externalId,
    );
    if (hit) {
      return { ...hit, matchedVocabulary: vocabulary };
    }
  }
  return null;
}
