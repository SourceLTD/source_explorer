/**
 * Concept sense service — CRUD and attach/detach helpers.
 *
 * Data model:
 *   lexical_units ─┬─ lexical_unit_senses ─┬─ senses ─┬─ sense_concepts ─┬─ frames
 * A frame_sense is the intermediate concept between a lexical unit and a frame.
 * In practice each sense should link to exactly one frame; UI surfaces a warning
 * when a sense has 0 or >1 frames (see `conceptWarning`).
 */

import { prisma } from '../prisma';
import type { part_of_speech } from '@prisma/client';
import type {
  Sense,
  SenseConceptRef,
  SenseWarning,
  SenseWithConcept,
} from '../types';

// ============================================
// Prisma include fragments
// ============================================

/**
 * Include fragment to hydrate a frame_sense with its frames.
 * Reusable in any query that needs sense metadata + frame resolution.
 */
export const senseWithConceptsInclude = {
  sense_concepts: {
    include: {
      concepts: {
        select: { id: true, label: true, code: true },
      },
    },
  },
} as const;

/**
 * Include fragment to hydrate a lexical_unit with its senses and each sense's frames.
 * This is the canonical "how do I get frames for this LU" include going forward.
 */
export const lexicalUnitSensesInclude = {
  lexical_unit_senses: {
    include: {
      senses: {
        include: senseWithConceptsInclude,
      },
    },
  },
} as const;

// ============================================
// Transforms
// ============================================

type RawConceptRef = { id: bigint; label: string; code: string | null };
type RawSenseConceptLink = { concepts: RawConceptRef };
type RawSense = {
  id: number;
  pos: string;
  definition: string;
  archetype: string;
  confidence: string | null;
  type_dispute: string | null;
  causative: boolean | null;
  inchoative: boolean | null;
  perspectival: boolean | null;
  created_at: Date | null;
  updated_at: Date | null;
  sense_concepts: RawSenseConceptLink[];
};

function toConceptRef(ref: RawConceptRef): SenseConceptRef {
  return {
    id: ref.id.toString(),
    label: ref.label,
    code: ref.code,
  };
}

export function computeConceptWarning(concepts: SenseConceptRef[]): SenseWarning {
  if (concepts.length === 0) return 'none';
  if (concepts.length > 1) return 'multiple';
  return null;
}

/**
 * Transform a raw senses row (with its sense_concepts include) into
 * a UI-ready SenseWithConcept.
 */
export function transformSense(raw: RawSense): SenseWithConcept {
  const concepts = (raw.sense_concepts ?? []).map(link => toConceptRef(link.concepts));
  const warning = computeConceptWarning(concepts);
  return {
    id: raw.id.toString(),
    pos: raw.pos,
    definition: raw.definition,
    archetype: raw.archetype,
    confidence: raw.confidence,
    type_dispute: raw.type_dispute,
    causative: raw.causative,
    inchoative: raw.inchoative,
    perspectival: raw.perspectival,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    concept: concepts[0] ?? null,
    concepts: concepts,
    conceptWarning: warning,
  };
}

type RawLuSenseLink = { senses: RawSense };

/**
 * Transform the `lexical_unit_senses` include on a lexical_units row into
 * a sorted, de-duplicated array of SenseWithConcept.
 */
export function transformLexicalUnitSenses(
  rawLinks: RawLuSenseLink[] | undefined | null,
): SenseWithConcept[] {
  if (!rawLinks) return [];
  const seen = new Set<string>();
  const out: SenseWithConcept[] = [];
  for (const link of rawLinks) {
    const sense = transformSense(link.senses);
    if (seen.has(sense.id)) continue;
    seen.add(sense.id);
    out.push(sense);
  }
  return out;
}

/**
 * Derive the "primary" frame of an LU from its senses (first sense's single frame,
 * when the 1:1 invariant holds). Returns null when the LU has no senses or the
 * first sense has no concept.
 */
export function derivePrimaryConcept(
  senses: SenseWithConcept[],
): SenseConceptRef | null {
  for (const sense of senses) {
    if (sense.concept) return sense.concept;
  }
  return null;
}

/**
 * Flatten all unique concepts reachable via the given senses (deduplicated by id).
 */
export function flattenConcepts(senses: SenseWithConcept[]): SenseConceptRef[] {
  const seen = new Set<string>();
  const out: SenseConceptRef[] = [];
  for (const sense of senses) {
    for (const concept of sense.concepts) {
      if (seen.has(concept.id)) continue;
      seen.add(concept.id);
      out.push(concept);
    }
  }
  return out;
}

/**
 * Count senses whose conceptWarning !== null (for row-level flagging).
 */
export function countAnomalousSenses(senses: SenseWithConcept[]): number {
  return senses.reduce((n, s) => n + (s.conceptWarning !== null ? 1 : 0), 0);
}

// ============================================
// Read operations
// ============================================

export async function getSensesForLexicalUnit(
  lexicalUnitId: bigint,
): Promise<SenseWithConcept[]> {
  const links = await prisma.lexical_unit_senses.findMany({
    where: { lexical_unit_id: lexicalUnitId },
    include: { senses: { include: senseWithConceptsInclude } },
    orderBy: { sense_id: 'asc' },
  });
  return transformLexicalUnitSenses(links);
}

export async function getSensesForConcept(conceptId: bigint): Promise<
  Array<SenseWithConcept & { lexical_unit_ids: string[] }>
> {
  const links = await prisma.sense_concepts.findMany({
    where: { concept_id: conceptId },
    include: {
      senses: {
        include: {
          ...senseWithConceptsInclude,
          lexical_unit_senses: {
            select: { lexical_unit_id: true },
          },
        },
      },
    },
  });

  return links.map(link => {
    const raw = link.senses as unknown as RawSense & {
      lexical_unit_senses: Array<{ lexical_unit_id: bigint }>;
    };
    const base = transformSense(raw);
    const lexical_unit_ids = raw.lexical_unit_senses.map(lu => lu.lexical_unit_id.toString());
    return { ...base, lexical_unit_ids };
  });
}

export async function getSenseById(id: number): Promise<SenseWithConcept | null> {
  const raw = await prisma.senses.findUnique({
    where: { id },
    include: senseWithConceptsInclude,
  });
  if (!raw) return null;
  return transformSense(raw as unknown as RawSense);
}

// ============================================
// Write operations
// ============================================

export interface CreateSenseInput {
  pos: part_of_speech;
  definition: string;
  archetype: string;
  /** Required concept_id — senses must anchor to exactly one frame. */
  concept_id: bigint;
  confidence?: string | null;
  type_dispute?: string | null;
  causative?: boolean | null;
  inchoative?: boolean | null;
  perspectival?: boolean | null;
  /** Optionally attach the new sense to these lexical units in the same transaction. */
  lexical_unit_ids?: bigint[];
}

export async function createSense(
  input: CreateSenseInput,
): Promise<Sense> {
  const luIds = input.lexical_unit_ids ?? [];
  const sense = await prisma.$transaction(async tx => {
    const created = await tx.senses.create({
      data: {
        pos: input.pos,
        definition: input.definition,
        archetype: input.archetype,
        confidence: input.confidence ?? null,
        type_dispute: input.type_dispute ?? null,
        causative: input.causative ?? null,
        inchoative: input.inchoative ?? null,
        perspectival: input.perspectival ?? null,
      },
    });
    await tx.sense_concepts.create({
      data: { sense_id: created.id, concept_id: input.concept_id },
    });
    if (luIds.length > 0) {
      await tx.lexical_unit_senses.createMany({
        data: luIds.map(lu => ({ lexical_unit_id: lu, sense_id: created.id })),
        skipDuplicates: true,
      });
    }
    return created;
  });
  return {
    id: sense.id.toString(),
    pos: sense.pos,
    definition: sense.definition,
    archetype: sense.archetype,
    confidence: sense.confidence,
    type_dispute: sense.type_dispute,
    causative: sense.causative,
    inchoative: sense.inchoative,
    perspectival: sense.perspectival,
    createdAt: sense.created_at,
    updatedAt: sense.updated_at,
  };
}

export interface UpdateSenseInput {
  pos?: part_of_speech;
  definition?: string;
  archetype?: string;
  confidence?: string | null;
  type_dispute?: string | null;
  causative?: boolean | null;
  inchoative?: boolean | null;
  perspectival?: boolean | null;
  /**
   * If provided, replaces the sense's single frame link atomically. Enforces the
   * 1:1 invariant — callers who need multi-frame behaviour should use
   * `attachSenseToConcept` / `detachSenseFromConcept` directly.
   */
  concept_id?: bigint | null;
}

export async function updateSense(
  id: number,
  patch: UpdateSenseInput,
): Promise<void> {
  await prisma.$transaction(async tx => {
    const data: Record<string, unknown> = {};
    if (patch.pos !== undefined) data.pos = patch.pos;
    if (patch.definition !== undefined) data.definition = patch.definition;
    if (patch.archetype !== undefined) data.archetype = patch.archetype;
    if (patch.confidence !== undefined) data.confidence = patch.confidence;
    if (patch.type_dispute !== undefined) data.type_dispute = patch.type_dispute;
    if (patch.causative !== undefined) data.causative = patch.causative;
    if (patch.inchoative !== undefined) data.inchoative = patch.inchoative;
    if (patch.perspectival !== undefined) data.perspectival = patch.perspectival;
    data.updated_at = new Date();
    await tx.senses.update({ where: { id }, data });

    if (patch.concept_id !== undefined) {
      await tx.sense_concepts.deleteMany({ where: { sense_id: id } });
      if (patch.concept_id !== null) {
        await tx.sense_concepts.create({
          data: { sense_id: id, concept_id: patch.concept_id },
        });
      }
    }
  });
}

export async function deleteSense(id: number): Promise<void> {
  await prisma.senses.delete({ where: { id } });
}

export async function attachSenseToLexicalUnit(
  senseId: number,
  lexicalUnitId: bigint,
): Promise<void> {
  await prisma.lexical_unit_senses.upsert({
    where: {
      lexical_unit_id_sense_id: {
        lexical_unit_id: lexicalUnitId,
        sense_id: senseId,
      },
    },
    create: { lexical_unit_id: lexicalUnitId, sense_id: senseId },
    update: {},
  });
}

export async function detachSenseFromLexicalUnit(
  senseId: number,
  lexicalUnitId: bigint,
): Promise<void> {
  await prisma.lexical_unit_senses.deleteMany({
    where: { lexical_unit_id: lexicalUnitId, sense_id: senseId },
  });
}

/** Replace the sense's single frame link atomically. */
export async function setSenseConcept(senseId: number, conceptId: bigint): Promise<void> {
  await prisma.$transaction(async tx => {
    await tx.sense_concepts.deleteMany({ where: { sense_id: senseId } });
    await tx.sense_concepts.create({
      data: { sense_id: senseId, concept_id: conceptId },
    });
  });
}
