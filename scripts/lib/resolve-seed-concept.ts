/**
 * Link-only concept resolution for seed scripts (no TBox creates).
 */
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { resolveConceptBySourceMedicalId } from '../../src/lib/medical';

export const GI_HORMONES_CONCEPT_ID = 188034n;
export const GLUCAGON_CONCEPT_ID = 188041n;
export const GLP1_SOURCE_MEDICAL_ID = 'source-medical:endocrine/glp-1';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

const SEMANTIC_PROBES = [
  'GI hormone gastrointestinal',
  'gut hormone secreted from intestine',
  'incretin hormone GLP-1',
  'peptide hormone endocrine signaling',
];

const BLOCKLIST_LABELS = new Set([
  'glucagon',
  'insulin',
  'glucotrol',
  'glucophage',
  'ghrelin',
  'gastrin',
  'secretin',
  'micronase',
  'tolbutamide',
  'sulfonylurea',
  'hypoglycemic agent',
]);

const PREFERRED_LABELS = ['gi hormones', 'endocrine', 'peptide', 'polypeptide'];

export interface ConceptCandidate {
  id: bigint;
  label: string;
  short_definition: string | null;
  similarity: number;
  source: string;
}

export interface SupertypeResolution {
  conceptId: bigint;
  label: string;
  action: 'override' | 'preferred' | 'semantic' | 'default' | 'source_medical';
  candidates: ConceptCandidate[];
}

function embeddingToVectorString(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

function labelKey(label: string): string {
  return label.trim().toLowerCase();
}

function isBlocklisted(label: string): boolean {
  const key = labelKey(label);
  for (const blocked of BLOCKLIST_LABELS) {
    if (key === blocked || key.includes(blocked)) return true;
  }
  return false;
}

function preferenceScore(label: string): number {
  const key = labelKey(label);
  const idx = PREFERRED_LABELS.indexOf(key);
  if (idx >= 0) return PREFERRED_LABELS.length - idx;
  if (key.includes('gi hormone')) return PREFERRED_LABELS.length + 1;
  return 0;
}

async function embedQuery(openai: OpenAI, query: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: query,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return response.data[0].embedding;
}

async function searchSemantic(
  prisma: PrismaClient,
  embedding: number[],
  threshold: number,
  count: number,
): Promise<ConceptCandidate[]> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: bigint; label: string; short_definition: string | null; similarity: number }>
  >(
    `SELECT * FROM search_concepts_semantic($1::vector, $2::double precision, $3::integer)`,
    embeddingToVectorString(embedding),
    threshold,
    count,
  );
  return rows.map((r) => ({
    id: BigInt(r.id),
    label: r.label,
    short_definition: r.short_definition,
    similarity: Number(r.similarity),
    source: 'semantic',
  }));
}

export async function resolveGlp1Supertype(
  prisma: PrismaClient,
  options?: { apply?: boolean },
): Promise<SupertypeResolution> {
  const imported = await resolveConceptBySourceMedicalId(prisma, GLP1_SOURCE_MEDICAL_ID);
  if (imported) {
    return {
      conceptId: imported.conceptId,
      label: imported.label,
      action: 'source_medical',
      candidates: [],
    };
  }

  const overrideRaw = process.env.GLP1_SUPERTYPE_CONCEPT_ID;
  if (overrideRaw) {
    const conceptId = BigInt(overrideRaw);
    const concept = await prisma.concepts.findFirst({
      where: { id: conceptId, deleted: false },
      select: { id: true, label: true },
    });
    if (!concept) {
      throw new Error(`GLP1_SUPERTYPE_CONCEPT_ID=${overrideRaw} not found or deleted`);
    }
    return {
      conceptId: concept.id,
      label: concept.label,
      action: 'override',
      candidates: [],
    };
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY is required for supertype resolution');
  }
  const openai = new OpenAI({ apiKey: openaiKey });

  const byId = new Map<string, ConceptCandidate>();

  for (const probe of SEMANTIC_PROBES) {
    const embedding = await embedQuery(openai, probe);
    const hits = await searchSemantic(prisma, embedding, 0.42, 12);
    for (const hit of hits) {
      if (isBlocklisted(hit.label)) continue;
      const key = hit.id.toString();
      const existing = byId.get(key);
      if (!existing || hit.similarity > existing.similarity) {
        byId.set(key, { ...hit, source: `semantic:${probe.slice(0, 30)}` });
      }
    }
  }

  const giHormones = await prisma.concepts.findFirst({
    where: { id: GI_HORMONES_CONCEPT_ID, deleted: false },
    select: { id: true, label: true, short_definition: true },
  });
  if (!giHormones) {
    throw new Error(`Gi hormones concept ${GI_HORMONES_CONCEPT_ID} not found`);
  }

  const glucagonUnderGi = await prisma.concept_relations.findFirst({
    where: { child_id: GLUCAGON_CONCEPT_ID, parent_id: GI_HORMONES_CONCEPT_ID },
  });
  if (glucagonUnderGi) {
    throw new Error('Invariant violated: Glucagon must not be a child of Gi hormones');
  }

  const candidates = [...byId.values()].sort((a, b) => {
    const pref = preferenceScore(b.label) - preferenceScore(a.label);
    if (pref !== 0) return pref;
    return b.similarity - a.similarity;
  });

  const top = candidates[0];
  const useGi =
    top?.id === GI_HORMONES_CONCEPT_ID ||
    preferenceScore(giHormones.label) >= preferenceScore(top?.label ?? '');

  const chosen = useGi
    ? {
        conceptId: giHormones.id,
        label: giHormones.label,
        action: top?.id === GI_HORMONES_CONCEPT_ID ? ('semantic' as const) : ('preferred' as const),
      }
    : top
      ? {
          conceptId: top.id,
          label: top.label,
          action: 'semantic' as const,
        }
      : {
          conceptId: giHormones.id,
          label: giHormones.label,
          action: 'default' as const,
        };

  if (options?.apply !== false && chosen.conceptId === GLUCAGON_CONCEPT_ID) {
    throw new Error('Refusing to link GLP-1 instance to Glucagon');
  }

  return {
    conceptId: chosen.conceptId,
    label: chosen.label,
    action: chosen.action,
    candidates: candidates.slice(0, 10),
  };
}

export function printResolutionReport(resolution: SupertypeResolution): void {
  console.log('\n=== GLP-1 supertype resolution ===');
  console.log(`Action: ${resolution.action}`);
  console.log(`Chosen: ${resolution.label} (${resolution.conceptId})`);
  if (resolution.candidates.length > 0) {
    console.log('\nTop semantic candidates (blocklist applied):');
    for (const c of resolution.candidates) {
      console.log(
        `  ${c.id} ${c.label} ${(c.similarity * 100).toFixed(1)}% — ${c.short_definition?.slice(0, 60) ?? ''}`,
      );
    }
  }
}
