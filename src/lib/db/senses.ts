/**
 * Frame sense service — CRUD and attach/detach helpers.
 *
 * Data model:
 *   lexical_units ─┬─ lexical_unit_senses ─┬─ frame_senses ─┬─ frame_sense_frames ─┬─ frames
 * A frame_sense is the intermediate concept between a lexical unit and a frame.
 * In practice each sense should link to exactly one frame; UI surfaces a warning
 * when a sense has 0 or >1 frames (see `frameWarning`).
 */

import { prisma } from '../prisma';
import type {
  FrameSense,
  FrameSenseFrameRef,
  FrameSenseWarning,
  FrameSenseWithFrame,
} from '../types';

// ============================================
// Prisma include fragments
// ============================================

/**
 * Include fragment to hydrate a frame_sense with its frames.
 * Reusable in any query that needs sense metadata + frame resolution.
 */
export const senseWithFramesInclude = {
  frame_sense_frames: {
    include: {
      frames: {
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
      frame_senses: {
        include: senseWithFramesInclude,
      },
    },
  },
} as const;

// ============================================
// Transforms
// ============================================

type RawFrameRef = { id: bigint; label: string; code: string | null };
type RawSenseFrameLink = { frames: RawFrameRef };
type RawFrameSense = {
  id: number;
  pos: string;
  definition: string;
  frame_type: string;
  confidence: string | null;
  type_dispute: string | null;
  causative: boolean | null;
  inchoative: boolean | null;
  perspectival: boolean | null;
  created_at: Date | null;
  updated_at: Date | null;
  frame_sense_frames: RawSenseFrameLink[];
};

function toFrameRef(ref: RawFrameRef): FrameSenseFrameRef {
  return {
    id: ref.id.toString(),
    label: ref.label,
    code: ref.code,
  };
}

export function computeFrameWarning(frames: FrameSenseFrameRef[]): FrameSenseWarning {
  if (frames.length === 0) return 'none';
  if (frames.length > 1) return 'multiple';
  return null;
}

/**
 * Transform a raw frame_senses row (with its frame_sense_frames include) into
 * a UI-ready FrameSenseWithFrame.
 */
export function transformFrameSense(raw: RawFrameSense): FrameSenseWithFrame {
  const frames = (raw.frame_sense_frames ?? []).map(link => toFrameRef(link.frames));
  const warning = computeFrameWarning(frames);
  return {
    id: raw.id.toString(),
    pos: raw.pos,
    definition: raw.definition,
    frame_type: raw.frame_type,
    confidence: raw.confidence,
    type_dispute: raw.type_dispute,
    causative: raw.causative,
    inchoative: raw.inchoative,
    perspectival: raw.perspectival,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    frame: frames[0] ?? null,
    frames,
    frameWarning: warning,
  };
}

type RawLuSenseLink = { frame_senses: RawFrameSense };

/**
 * Transform the `lexical_unit_senses` include on a lexical_units row into
 * a sorted, de-duplicated array of FrameSenseWithFrame.
 */
export function transformLexicalUnitSenses(
  rawLinks: RawLuSenseLink[] | undefined | null,
): FrameSenseWithFrame[] {
  if (!rawLinks) return [];
  const seen = new Set<string>();
  const out: FrameSenseWithFrame[] = [];
  for (const link of rawLinks) {
    const sense = transformFrameSense(link.frame_senses);
    if (seen.has(sense.id)) continue;
    seen.add(sense.id);
    out.push(sense);
  }
  return out;
}

/**
 * Derive the "primary" frame of an LU from its senses (first sense's single frame,
 * when the 1:1 invariant holds). Returns null when the LU has no senses or the
 * first sense has no frame.
 */
export function derivePrimaryFrame(
  senses: FrameSenseWithFrame[],
): FrameSenseFrameRef | null {
  for (const sense of senses) {
    if (sense.frame) return sense.frame;
  }
  return null;
}

/**
 * Flatten all unique frames reachable via the given senses (deduplicated by id).
 */
export function flattenFrames(senses: FrameSenseWithFrame[]): FrameSenseFrameRef[] {
  const seen = new Set<string>();
  const out: FrameSenseFrameRef[] = [];
  for (const sense of senses) {
    for (const frame of sense.frames) {
      if (seen.has(frame.id)) continue;
      seen.add(frame.id);
      out.push(frame);
    }
  }
  return out;
}

/**
 * Count senses whose frameWarning !== null (for row-level flagging).
 */
export function countAnomalousSenses(senses: FrameSenseWithFrame[]): number {
  return senses.reduce((n, s) => n + (s.frameWarning !== null ? 1 : 0), 0);
}

// ============================================
// Read operations
// ============================================

export async function getSensesForLexicalUnit(
  lexicalUnitId: bigint,
): Promise<FrameSenseWithFrame[]> {
  const links = await prisma.lexical_unit_senses.findMany({
    where: { lexical_unit_id: lexicalUnitId },
    include: { frame_senses: { include: senseWithFramesInclude } },
    orderBy: { frame_sense_id: 'asc' },
  });
  return transformLexicalUnitSenses(links);
}

export async function getSensesForFrame(frameId: bigint): Promise<
  Array<FrameSenseWithFrame & { lexical_unit_ids: string[] }>
> {
  const links = await prisma.frame_sense_frames.findMany({
    where: { frame_id: frameId },
    include: {
      frame_senses: {
        include: {
          ...senseWithFramesInclude,
          lexical_unit_senses: {
            select: { lexical_unit_id: true },
          },
        },
      },
    },
  });

  return links.map(link => {
    const raw = link.frame_senses as unknown as RawFrameSense & {
      lexical_unit_senses: Array<{ lexical_unit_id: bigint }>;
    };
    const base = transformFrameSense(raw);
    const lexical_unit_ids = raw.lexical_unit_senses.map(lu => lu.lexical_unit_id.toString());
    return { ...base, lexical_unit_ids };
  });
}

export async function getFrameSenseById(id: number): Promise<FrameSenseWithFrame | null> {
  const raw = await prisma.frame_senses.findUnique({
    where: { id },
    include: senseWithFramesInclude,
  });
  if (!raw) return null;
  return transformFrameSense(raw as unknown as RawFrameSense);
}

// ============================================
// Write operations
// ============================================

export interface CreateFrameSenseInput {
  pos: string;
  definition: string;
  frame_type: string;
  /** Required frame_id — senses must anchor to exactly one frame. */
  frame_id: bigint;
  confidence?: string | null;
  type_dispute?: string | null;
  causative?: boolean | null;
  inchoative?: boolean | null;
  perspectival?: boolean | null;
  /** Optionally attach the new sense to these lexical units in the same transaction. */
  lexical_unit_ids?: bigint[];
}

export async function createFrameSense(
  input: CreateFrameSenseInput,
): Promise<FrameSense> {
  const luIds = input.lexical_unit_ids ?? [];
  const sense = await prisma.$transaction(async tx => {
    const created = await tx.frame_senses.create({
      data: {
        pos: input.pos,
        definition: input.definition,
        frame_type: input.frame_type,
        confidence: input.confidence ?? null,
        type_dispute: input.type_dispute ?? null,
        causative: input.causative ?? null,
        inchoative: input.inchoative ?? null,
        perspectival: input.perspectival ?? null,
      },
    });
    await tx.frame_sense_frames.create({
      data: { frame_sense_id: created.id, frame_id: input.frame_id },
    });
    if (luIds.length > 0) {
      await tx.lexical_unit_senses.createMany({
        data: luIds.map(lu => ({ lexical_unit_id: lu, frame_sense_id: created.id })),
        skipDuplicates: true,
      });
    }
    return created;
  });
  return {
    id: sense.id.toString(),
    pos: sense.pos,
    definition: sense.definition,
    frame_type: sense.frame_type,
    confidence: sense.confidence,
    type_dispute: sense.type_dispute,
    causative: sense.causative,
    inchoative: sense.inchoative,
    perspectival: sense.perspectival,
    createdAt: sense.created_at,
    updatedAt: sense.updated_at,
  };
}

export interface UpdateFrameSenseInput {
  pos?: string;
  definition?: string;
  frame_type?: string;
  confidence?: string | null;
  type_dispute?: string | null;
  causative?: boolean | null;
  inchoative?: boolean | null;
  perspectival?: boolean | null;
  /**
   * If provided, replaces the sense's single frame link atomically. Enforces the
   * 1:1 invariant — callers who need multi-frame behaviour should use
   * `attachSenseToFrame` / `detachSenseFromFrame` directly.
   */
  frame_id?: bigint | null;
}

export async function updateFrameSense(
  id: number,
  patch: UpdateFrameSenseInput,
): Promise<void> {
  await prisma.$transaction(async tx => {
    const data: Record<string, unknown> = {};
    if (patch.pos !== undefined) data.pos = patch.pos;
    if (patch.definition !== undefined) data.definition = patch.definition;
    if (patch.frame_type !== undefined) data.frame_type = patch.frame_type;
    if (patch.confidence !== undefined) data.confidence = patch.confidence;
    if (patch.type_dispute !== undefined) data.type_dispute = patch.type_dispute;
    if (patch.causative !== undefined) data.causative = patch.causative;
    if (patch.inchoative !== undefined) data.inchoative = patch.inchoative;
    if (patch.perspectival !== undefined) data.perspectival = patch.perspectival;
    data.updated_at = new Date();
    await tx.frame_senses.update({ where: { id }, data });

    if (patch.frame_id !== undefined) {
      await tx.frame_sense_frames.deleteMany({ where: { frame_sense_id: id } });
      if (patch.frame_id !== null) {
        await tx.frame_sense_frames.create({
          data: { frame_sense_id: id, frame_id: patch.frame_id },
        });
      }
    }
  });
}

export async function deleteFrameSense(id: number): Promise<void> {
  await prisma.frame_senses.delete({ where: { id } });
}

export async function attachSenseToLexicalUnit(
  senseId: number,
  lexicalUnitId: bigint,
): Promise<void> {
  await prisma.lexical_unit_senses.upsert({
    where: {
      lexical_unit_id_frame_sense_id: {
        lexical_unit_id: lexicalUnitId,
        frame_sense_id: senseId,
      },
    },
    create: { lexical_unit_id: lexicalUnitId, frame_sense_id: senseId },
    update: {},
  });
}

export async function detachSenseFromLexicalUnit(
  senseId: number,
  lexicalUnitId: bigint,
): Promise<void> {
  await prisma.lexical_unit_senses.deleteMany({
    where: { lexical_unit_id: lexicalUnitId, frame_sense_id: senseId },
  });
}

/** Replace the sense's single frame link atomically. */
export async function setSenseFrame(senseId: number, frameId: bigint): Promise<void> {
  await prisma.$transaction(async tx => {
    await tx.frame_sense_frames.deleteMany({ where: { frame_sense_id: senseId } });
    await tx.frame_sense_frames.create({
      data: { frame_sense_id: senseId, frame_id: frameId },
    });
  });
}
