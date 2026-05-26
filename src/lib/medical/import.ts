import type { PrismaClient } from '@prisma/client';
import type { concept_archetype_enum } from '@prisma/client';
import type { MedicalConceptRecord, SourcePlacement } from './types';

export type ParentMap = {
  archetypeRoot: Map<string, bigint>;
  subtypeHub: Map<string, bigint>;
};

/** DB enum labels use spaces; source-medical YAML uses Prisma snake_case. */
function subtypeLookupKey(subtype: string): string {
  return subtype.replace(/_/g, ' ');
}

function subtypeHubKey(archetype: string, subtype: string): string {
  return `${archetype}:${subtypeLookupKey(subtype)}`;
}

const ARCHETYPE_ROOTS = ['Event', 'State', 'Entity', 'Measure'] as const;

export async function ensureArchetypeRoots(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.$queryRaw<Array<{ archetype: string }>>`
    SELECT archetype::text AS archetype
    FROM concepts
    WHERE archetype IS NOT NULL
      AND label = archetype::text
      AND deleted = false
      AND NOT EXISTS (
        SELECT 1 FROM concept_relations cr
        WHERE cr.child_id = concepts.id AND cr.type = 'parent_of'
      )
  `;
  const have = new Set(existing.map((row) => row.archetype));

  for (const archetype of ARCHETYPE_ROOTS) {
    if (have.has(archetype)) continue;
    await prisma.concepts.create({
      data: {
        label: archetype,
        archetype: archetype as concept_archetype_enum,
      },
    });
  }
}

export async function buildParentMap(prisma: PrismaClient): Promise<ParentMap> {
  const roots = await prisma.$queryRaw<Array<{ archetype: string; root_id: bigint }>>`
    SELECT id AS root_id, archetype::text AS archetype
    FROM concepts
    WHERE archetype IS NOT NULL
      AND label = archetype::text
      AND deleted = false
      AND NOT EXISTS (
        SELECT 1 FROM concept_relations cr
        WHERE cr.child_id = concepts.id AND cr.type = 'parent_of'
      )
  `;

  const hubs = await prisma.$queryRaw<
    Array<{ archetype: string; child_subtype: string; child_id: bigint }>
  >`
    SELECT
      root.archetype::text AS archetype,
      child.subtype::text AS child_subtype,
      child.id AS child_id
    FROM concepts root
    JOIN concept_relations cr ON cr.parent_id = root.id AND cr.type = 'parent_of'
    JOIN concepts child ON child.id = cr.child_id AND child.deleted = false
    WHERE root.archetype IN ('Event'::concept_archetype_enum, 'State'::concept_archetype_enum)
      AND root.label = root.archetype::text
      AND root.deleted = false
      AND child.subtype IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM concept_relations cr2
        WHERE cr2.child_id = root.id AND cr2.type = 'parent_of'
      )
  `;

  const archetypeRoot = new Map<string, bigint>();
  const subtypeHub = new Map<string, bigint>();

  for (const row of roots) {
    archetypeRoot.set(row.archetype, row.root_id);
  }
  for (const row of hubs) {
    subtypeHub.set(subtypeHubKey(row.archetype, row.child_subtype), row.child_id);
  }

  return { archetypeRoot, subtypeHub };
}

export function resolveParentId(
  placement: SourcePlacement,
  parentMap: ParentMap,
): bigint {
  const { archetype, subtype, parent_kind } = placement;

  if (parent_kind === 'subtype_hub') {
    if (!subtype) {
      throw new Error(`subtype_hub placement requires subtype for ${archetype}`);
    }
    const key = subtypeHubKey(archetype, subtype);
    const hubId = parentMap.subtypeHub.get(key);
    if (!hubId) {
      throw new Error(`No subtype hub found for ${key}`);
    }
    return hubId;
  }

  const rootId = parentMap.archetypeRoot.get(archetype);
  if (!rootId) {
    throw new Error(`No archetype root found for ${archetype}`);
  }
  return rootId;
}

export function placementForRecord(record: MedicalConceptRecord): SourcePlacement {
  if (record.source_placement) {
    return record.source_placement;
  }
  return {
    archetype: record.archetype,
    subtype: record.subtype,
    parent_kind:
      record.subtype && (record.archetype === 'Event' || record.archetype === 'State')
        ? 'subtype_hub'
        : 'archetype_root',
    suggested_parent_label: record.subtype ?? record.archetype,
  };
}

export async function ensureParentRelation(
  prisma: PrismaClient,
  conceptId: bigint,
  parentId: bigint,
): Promise<void> {
  const existing = await prisma.concept_relations.findFirst({
    where: { child_id: conceptId, type: 'parent_of' },
  });

  if (existing) {
    if (existing.parent_id === parentId) return;
    await prisma.concept_relations.update({
      where: { id: existing.id },
      data: { parent_id: parentId },
    });
    return;
  }

  await prisma.concept_relations.create({
    data: {
      parent_id: parentId,
      child_id: conceptId,
      type: 'parent_of',
    },
  });
}

export function externalIdEntries(
  record: MedicalConceptRecord,
): Array<{ vocabulary: string; external_id: string }> {
  const entries: Array<{ vocabulary: string; external_id: string }> = [
    { vocabulary: 'source_medical', external_id: record.id },
  ];

  if (record.external_ids.umls_cui) {
    entries.push({ vocabulary: 'umls_cui', external_id: record.external_ids.umls_cui });
  }

  return entries;
}

export async function findConceptByExternalIds(
  prisma: PrismaClient,
  record: MedicalConceptRecord,
): Promise<bigint | null> {
  for (const { vocabulary, external_id } of externalIdEntries(record)) {
    const hit = await prisma.concept_external_ids.findUnique({
      where: { vocabulary_external_id: { vocabulary, external_id } },
      select: { concept_id: true },
    });
    if (hit) return hit.concept_id;
  }
  return null;
}

export async function upsertExternalIds(
  prisma: PrismaClient,
  conceptId: bigint,
  record: MedicalConceptRecord,
): Promise<void> {
  for (const { vocabulary, external_id } of externalIdEntries(record)) {
    await prisma.concept_external_ids.upsert({
      where: { vocabulary_external_id: { vocabulary, external_id } },
      create: { concept_id: conceptId, vocabulary, external_id },
      update: { concept_id: conceptId },
    });
  }

  await prisma.concept_external_ids.deleteMany({
    where: {
      concept_id: conceptId,
      vocabulary: { notIn: ['source_medical', 'umls_cui'] },
    },
  });
}

export async function importMedicalConcept(
  prisma: PrismaClient,
  record: MedicalConceptRecord,
  parentMap: ParentMap,
): Promise<{ conceptId: bigint; created: boolean }> {
  const existingId = await findConceptByExternalIds(prisma, record);
  const placement = placementForRecord(record);
  const parentId = resolveParentId(placement, parentMap);

  if (existingId) {
    await prisma.concepts.update({
      where: { id: existingId },
      data: {
        label: record.label,
        definition: record.definition ?? undefined,
        archetype: record.archetype as concept_archetype_enum,
        subtype: record.subtype ?? null,
        deleted: false,
      },
    });
    await ensureParentRelation(prisma, existingId, parentId);
    await upsertExternalIds(prisma, existingId, record);
    return { conceptId: existingId, created: false };
  }

  const created = await prisma.concepts.create({
    data: {
      label: record.label,
      definition: record.definition ?? null,
      archetype: record.archetype as concept_archetype_enum,
      subtype: record.subtype ?? null,
    },
  });

  await ensureParentRelation(prisma, created.id, parentId);
  await upsertExternalIds(prisma, created.id, record);
  return { conceptId: created.id, created: true };
}
