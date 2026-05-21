/**
 * Idempotent seed for Claims demo data with document provenance.
 * Run: npm run db:seed:claims
 *
 * Demonstrates:
 * - NormalizedDocument → document_index → source_texts
 * - Block locators on instance_mentions
 * - Multi-mention (same entity at multiple positions)
 */
import { PrismaClient } from '@prisma/client';
import { buildDocumentIndex } from '../src/lib/documents/build-document-index';
import type { NormalizedDocument } from '../src/lib/documents/schema';

const prisma = new PrismaClient();

const DEMO_PREFIX = 'claims-demo';

async function upsertConcept(label: string, definition?: string) {
  const existing = await prisma.concepts.findFirst({
    where: { label, deleted: false },
  });
  if (existing) return existing;
  return prisma.concepts.create({
    data: { label, definition: definition ?? `${label} (claims demo)` },
  });
}

async function upsertProperty(conceptId: bigint, label: string) {
  const existing = await prisma.properties.findFirst({
    where: { concept_id: conceptId, label },
  });
  if (existing) return existing;
  return prisma.properties.create({
    data: { concept_id: conceptId, label },
  });
}

async function upsertKnowledgeGraph(label: string, description: string) {
  const existing = await prisma.knowledge_graphs.findFirst({ where: { label } });
  if (existing) {
    return prisma.knowledge_graphs.update({
      where: { id: existing.id },
      data: { description },
    });
  }
  return prisma.knowledge_graphs.create({ data: { label, description } });
}

async function upsertSourceText(params: {
  content: string;
  sourceUri: string;
  contentType: string;
  artifactUri?: string;
  documentIndex: object;
}) {
  const existing = await prisma.source_texts.findFirst({
    where: { source_uri: params.sourceUri },
  });
  if (existing) {
    return prisma.source_texts.update({
      where: { id: existing.id },
      data: {
        content: params.content,
        content_type: params.contentType,
        artifact_uri: params.artifactUri ?? null,
        document_index: params.documentIndex as any,
      },
    });
  }
  return prisma.source_texts.create({
    data: {
      content: params.content,
      source_uri: params.sourceUri,
      content_type: params.contentType,
      artifact_uri: params.artifactUri ?? null,
      document_index: params.documentIndex as any,
    },
  });
}

async function upsertInstance(params: {
  demoKey: string;
  conceptId: bigint;
  graphId: bigint;
  sourceTextId: bigint;
  confidence: number;
  label: string;
}) {
  const existing = await prisma.instances.findFirst({
    where: {
      knowledge_graph_id: params.graphId,
      metadata: { path: ['demo_key'], equals: params.demoKey },
    },
  });
  const metadata = { demo_key: params.demoKey, label: params.label };
  if (existing) {
    return prisma.instances.update({
      where: { id: existing.id },
      data: {
        concept_id: params.conceptId,
        confidence: params.confidence,
        source_text_id: params.sourceTextId,
        metadata,
      },
    });
  }
  return prisma.instances.create({
    data: {
      concept_id: params.conceptId,
      knowledge_graph_id: params.graphId,
      source_text_id: params.sourceTextId,
      confidence: params.confidence,
      metadata,
    },
  });
}

async function upsertFiller(params: {
  instanceId: bigint;
  propertyId: bigint;
  fillerInstanceId?: bigint;
  fillerValue?: string;
}) {
  const existing = await prisma.instance_fillers.findFirst({
    where: {
      instance_id: params.instanceId,
      property_id: params.propertyId,
    },
  });
  if (existing) {
    return prisma.instance_fillers.update({
      where: { id: existing.id },
      data: {
        filler_instance_id: params.fillerInstanceId ?? null,
        filler_value: params.fillerValue ?? null,
        confidence: 0.95,
      },
    });
  }
  return prisma.instance_fillers.create({
    data: {
      instance_id: params.instanceId,
      property_id: params.propertyId,
      filler_instance_id: params.fillerInstanceId ?? null,
      filler_value: params.fillerValue ?? null,
      confidence: 0.95,
    },
  });
}

async function upsertMention(params: {
  instanceId: bigint;
  locator: object;
  mentionText: string;
}) {
  const existing = await prisma.instance_mentions.findFirst({
    where: {
      instance_id: params.instanceId,
      mention_text: params.mentionText,
    },
  });
  if (existing) {
    return prisma.instance_mentions.update({
      where: { id: existing.id },
      data: { locator: params.locator as any, mention_text: params.mentionText },
    });
  }
  return prisma.instance_mentions.create({
    data: {
      instance_id: params.instanceId,
      locator: params.locator as any,
      mention_text: params.mentionText,
      confidence: 0.95,
    },
  });
}

/**
 * Find a needle in a paragraph and return a block locator.
 */
function blockLocator(
  canonicalText: string,
  documentIndex: ReturnType<typeof buildDocumentIndex>['documentIndex'],
  needle: string,
  occurrence: number = 0,
): { locator: object; mentionText: string } {
  let searchFrom = 0;
  for (let i = 0; i <= occurrence; i++) {
    const idx = canonicalText.indexOf(needle, searchFrom);
    if (idx === -1) throw new Error(`Needle not found: "${needle}" (occurrence ${occurrence})`);
    if (i === occurrence) {
      const block = documentIndex.blocks.find(
        (b) => b.globalStart <= idx && idx < b.globalEnd,
      );
      if (!block) throw new Error(`No block contains offset ${idx}`);
      return {
        locator: {
          type: 'block',
          sectionIndex: block.sectionIndex,
          paragraphIndex: block.paragraphIndex,
          start: idx - block.globalStart,
          end: idx - block.globalStart + needle.length,
          ...(block.page ? { page: block.page } : {}),
        },
        mentionText: needle,
      };
    }
    searchFrom = idx + needle.length;
  }
  throw new Error('Unreachable');
}

// ============================================================================
// Demo documents as NormalizedDocument shapes
// ============================================================================

const ACME_DOC: NormalizedDocument = {
  url: `${DEMO_PREFIX}://acme/filing-2024`,
  source_type: 'web',
  normalized_at: new Date().toISOString(),
  article: {
    sections: [
      {
        heading: 'Introduction',
        heading_level: 'intro',
        paragraphs: [
          {
            text: 'John Smith is CEO of Acme Corp, which is headquartered in London.',
          },
        ],
      },
      {
        heading: 'Leadership',
        heading_level: 'h2',
        paragraphs: [
          {
            text: 'Jane Doe serves as CFO of Acme Corp. She reports directly to John Smith.',
          },
        ],
      },
    ],
  },
};

const CLINIC_DOC: NormalizedDocument = {
  url: `${DEMO_PREFIX}://clinic/encounter-1042`,
  source_type: 'web',
  normalized_at: new Date().toISOString(),
  article: {
    sections: [
      {
        heading: 'Encounter Summary',
        heading_level: 'intro',
        paragraphs: [
          {
            text: 'Maria Garcia was treated by Dr. Alan Chen for Type 2 Diabetes.',
          },
          {
            text: 'Dr. Chen specializes in endocrinology. Robert Lee was also treated by Dr. Chen.',
          },
        ],
      },
    ],
  },
};

// ============================================================================
// Seed functions
// ============================================================================

async function seedAcmeGraph() {
  console.log('Seeding Acme Corp filings...');

  const { canonicalText, documentIndex } = buildDocumentIndex(ACME_DOC);

  const person = await upsertConcept('Person', 'A human individual');
  const organization = await upsertConcept('Organization', 'A company or institution');
  const location = await upsertConcept('Location', 'A geographic place');

  const employer = await upsertProperty(person.id, 'employer');
  const title = await upsertProperty(person.id, 'title');
  const headquarters = await upsertProperty(organization.id, 'headquarters');
  const employee = await upsertProperty(organization.id, 'employee');

  const graph = await upsertKnowledgeGraph(
    'Acme Corp filings',
    'Corporate entity graph with people, organizations, and locations',
  );

  const sourceText = await upsertSourceText({
    content: canonicalText,
    sourceUri: `${DEMO_PREFIX}://acme/filing-2024`,
    contentType: 'text/html',
    documentIndex,
  });

  const john = await upsertInstance({
    demoKey: 'acme-john-smith',
    conceptId: person.id,
    graphId: graph.id,
    sourceTextId: sourceText.id,
    confidence: 0.97,
    label: 'John Smith',
  });
  const jane = await upsertInstance({
    demoKey: 'acme-jane-doe',
    conceptId: person.id,
    graphId: graph.id,
    sourceTextId: sourceText.id,
    confidence: 0.94,
    label: 'Jane Doe',
  });
  const acme = await upsertInstance({
    demoKey: 'acme-corp',
    conceptId: organization.id,
    graphId: graph.id,
    sourceTextId: sourceText.id,
    confidence: 0.99,
    label: 'Acme Corp',
  });
  const london = await upsertInstance({
    demoKey: 'acme-london',
    conceptId: location.id,
    graphId: graph.id,
    sourceTextId: sourceText.id,
    confidence: 0.92,
    label: 'London',
  });

  // Mentions — Acme Corp appears in TWO paragraphs (multi-mention)
  const johnMention = blockLocator(canonicalText, documentIndex, 'John Smith', 0);
  await upsertMention({ instanceId: john.id, ...johnMention });

  const johnMention2 = blockLocator(canonicalText, documentIndex, 'John Smith', 1);
  await upsertMention({ instanceId: john.id, ...johnMention2 });

  const acmeMention1 = blockLocator(canonicalText, documentIndex, 'Acme Corp', 0);
  await upsertMention({ instanceId: acme.id, ...acmeMention1 });

  const acmeMention2 = blockLocator(canonicalText, documentIndex, 'Acme Corp', 1);
  await upsertMention({ instanceId: acme.id, ...acmeMention2 });

  const janeMention = blockLocator(canonicalText, documentIndex, 'Jane Doe');
  await upsertMention({ instanceId: jane.id, ...janeMention });

  const londonMention = blockLocator(canonicalText, documentIndex, 'London');
  await upsertMention({ instanceId: london.id, ...londonMention });

  // Fillers
  await upsertFiller({ instanceId: john.id, propertyId: employer.id, fillerInstanceId: acme.id });
  await upsertFiller({ instanceId: john.id, propertyId: title.id, fillerValue: 'CEO' });
  await upsertFiller({ instanceId: jane.id, propertyId: employer.id, fillerInstanceId: acme.id });
  await upsertFiller({ instanceId: jane.id, propertyId: title.id, fillerValue: 'CFO' });
  await upsertFiller({ instanceId: acme.id, propertyId: headquarters.id, fillerInstanceId: london.id });
  await upsertFiller({ instanceId: acme.id, propertyId: employee.id, fillerInstanceId: john.id });

  console.log(`  Acme graph ${graph.id}: 4 instances, 6 mentions`);
}

async function seedClinicGraph() {
  console.log('Seeding Riverdale clinic...');

  const { canonicalText, documentIndex } = buildDocumentIndex(CLINIC_DOC);

  const patient = await upsertConcept('Patient', 'A person receiving medical care');
  const provider = await upsertConcept('Provider', 'A healthcare professional');
  const diagnosis = await upsertConcept('Diagnosis', 'A medical condition');

  const treatedBy = await upsertProperty(patient.id, 'treated_by');
  const diagnosedWith = await upsertProperty(patient.id, 'diagnosed_with');
  const specialty = await upsertProperty(provider.id, 'specialty');

  const graph = await upsertKnowledgeGraph(
    'Riverdale clinic',
    'Medical encounter graph with patients, providers, and diagnoses',
  );

  const sourceText = await upsertSourceText({
    content: canonicalText,
    sourceUri: `${DEMO_PREFIX}://clinic/encounter-1042`,
    contentType: 'text/html',
    documentIndex,
  });

  const maria = await upsertInstance({
    demoKey: 'clinic-maria-garcia',
    conceptId: patient.id,
    graphId: graph.id,
    sourceTextId: sourceText.id,
    confidence: 0.96,
    label: 'Maria Garcia',
  });
  const drChen = await upsertInstance({
    demoKey: 'clinic-dr-chen',
    conceptId: provider.id,
    graphId: graph.id,
    sourceTextId: sourceText.id,
    confidence: 0.98,
    label: 'Dr. Alan Chen',
  });
  const diabetes = await upsertInstance({
    demoKey: 'clinic-diabetes',
    conceptId: diagnosis.id,
    graphId: graph.id,
    sourceTextId: sourceText.id,
    confidence: 0.91,
    label: 'Type 2 Diabetes',
  });
  const robert = await upsertInstance({
    demoKey: 'clinic-robert-lee',
    conceptId: patient.id,
    graphId: graph.id,
    sourceTextId: sourceText.id,
    confidence: 0.88,
    label: 'Robert Lee',
  });

  // Mentions — Dr. Chen appears 3 times (multi-mention)
  const mariaMention = blockLocator(canonicalText, documentIndex, 'Maria Garcia');
  await upsertMention({ instanceId: maria.id, ...mariaMention });

  const drChenMention1 = blockLocator(canonicalText, documentIndex, 'Dr. Alan Chen');
  await upsertMention({ instanceId: drChen.id, ...drChenMention1 });

  const drChenMention2 = blockLocator(canonicalText, documentIndex, 'Dr. Chen', 0);
  await upsertMention({ instanceId: drChen.id, ...drChenMention2 });

  const drChenMention3 = blockLocator(canonicalText, documentIndex, 'Dr. Chen', 1);
  await upsertMention({ instanceId: drChen.id, ...drChenMention3 });

  const diabetesMention = blockLocator(canonicalText, documentIndex, 'Type 2 Diabetes');
  await upsertMention({ instanceId: diabetes.id, ...diabetesMention });

  const robertMention = blockLocator(canonicalText, documentIndex, 'Robert Lee');
  await upsertMention({ instanceId: robert.id, ...robertMention });

  // Fillers
  await upsertFiller({ instanceId: maria.id, propertyId: treatedBy.id, fillerInstanceId: drChen.id });
  await upsertFiller({ instanceId: maria.id, propertyId: diagnosedWith.id, fillerInstanceId: diabetes.id });
  await upsertFiller({ instanceId: drChen.id, propertyId: specialty.id, fillerValue: 'Endocrinology' });
  await upsertFiller({ instanceId: robert.id, propertyId: treatedBy.id, fillerInstanceId: drChen.id });
  await upsertFiller({ instanceId: robert.id, propertyId: diagnosedWith.id, fillerInstanceId: diabetes.id });

  console.log(`  Clinic graph ${graph.id}: 4 instances, 6 mentions`);
}

async function main() {
  console.log('Seeding claims demo data with document provenance...');
  await seedAcmeGraph();
  await seedClinicGraph();
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
