/**
 * Seed GLP-1 review paper into claims ABox.
 * Run: npm run db:seed:glp1-paper
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import path from 'path';
import { PrismaClient, referential_status } from '@prisma/client';
import { buildDocumentIndex } from '../src/lib/documents/build-document-index';
import { blockLocatorSchema, resolveLocator } from '../src/lib/claims/locator-schema';
import type { DocumentIndex } from '../src/lib/documents';
import { blockLocator, spreadOccurrenceIndices } from './lib/document-locators';
import { GLP1_GRAPH_LABEL, GLP1_SOURCE_URI, loadJatsDocument } from './lib/load-jats-document';
import { printResolutionReport, resolveGlp1Supertype } from './lib/resolve-seed-concept';

const prisma = new PrismaClient();
const SEED_KEY = 'glp1-nauck-2021';
const MENTION_NEEDLE = 'GLP-1';

async function main() {
  const resolution = await resolveGlp1Supertype(prisma);
  printResolutionReport(resolution);

  const doc = loadJatsDocument();
  const { canonicalText, documentIndex } = buildDocumentIndex(doc);

  const paperXml = path.resolve(
    __dirname,
    '../../source-normalize/samples/2021_10.1016_j.molmet.2020.101102/paper.xml',
  );

  const graphDescription =
    'GLP-1 receptor agonists in the treatment of type 2 diabetes – state-of-the-art (Nauck 2021)';
  const existingGraph = await prisma.knowledge_graphs.findFirst({
    where: { label: GLP1_GRAPH_LABEL },
  });
  const graph = existingGraph
    ? await prisma.knowledge_graphs.update({
        where: { id: existingGraph.id },
        data: { description: graphDescription },
      })
    : await prisma.knowledge_graphs.create({
        data: { label: GLP1_GRAPH_LABEL, description: graphDescription },
      });

  const existingSource = await prisma.source_texts.findFirst({
    where: { source_uri: GLP1_SOURCE_URI },
  });
  const sourceText = existingSource
    ? await prisma.source_texts.update({
        where: { id: existingSource.id },
        data: {
          content: canonicalText,
          content_type: 'application/xml+jats',
          artifact_uri: `file://${paperXml}`,
          document_index: documentIndex as object,
        },
      })
    : await prisma.source_texts.create({
        data: {
          content: canonicalText,
          source_uri: GLP1_SOURCE_URI,
          content_type: 'application/xml+jats',
          artifact_uri: `file://${paperXml}`,
          document_index: documentIndex as object,
        },
      });

  const matchCount = (canonicalText.match(/GLP-1/g) || []).length;
  const occurrenceIndices = spreadOccurrenceIndices(matchCount, 5);
  const mentions = occurrenceIndices.map((occ) =>
    blockLocator(canonicalText, documentIndex, MENTION_NEEDLE, occ),
  );

  for (const m of mentions) {
    const parsed = blockLocatorSchema.safeParse(m.locator);
    if (!parsed.success) {
      throw new Error(`Invalid locator: ${parsed.error.message}`);
    }
    const resolved = resolveLocator(parsed.data, documentIndex as DocumentIndex, canonicalText);
    if (!resolved) {
      throw new Error(`Locator did not resolve: ${JSON.stringify(m.locator)}`);
    }
  }

  let instance = await prisma.instances.findFirst({
    where: {
      knowledge_graph_id: graph.id,
      metadata: { path: ['seed_key'], equals: SEED_KEY },
    },
  });

  if (instance) {
    await prisma.instance_mentions.deleteMany({ where: { instance_id: instance.id } });
    instance = await prisma.instances.update({
      where: { id: instance.id },
      data: {
        concept_id: resolution.conceptId,
        source_text_id: sourceText.id,
        confidence: 0.95,
        referential_status: referential_status.generic,
        metadata: {
          label: 'GLP-1',
          mention_surface: 'GLP-1',
          seed_key: SEED_KEY,
        },
      },
    });
  } else {
    instance = await prisma.instances.create({
      data: {
        concept_id: resolution.conceptId,
        knowledge_graph_id: graph.id,
        source_text_id: sourceText.id,
        confidence: 0.95,
        referential_status: referential_status.generic,
        metadata: {
          label: 'GLP-1',
          mention_surface: 'GLP-1',
          seed_key: SEED_KEY,
        },
      },
    });
  }

  for (const m of mentions) {
    await prisma.instance_mentions.create({
      data: {
        instance_id: instance.id,
        locator: m.locator as object,
        mention_text: m.mentionText,
        confidence: 0.95,
      },
    });
  }

  const mentionCount = await prisma.instance_mentions.count({
    where: { instance_id: instance.id },
  });

  console.log('\n=== Seed complete ===');
  console.log(`Graph: ${graph.label} (${graph.id})`);
  console.log(`Source: ${GLP1_SOURCE_URI} (${sourceText.id})`);
  console.log(
    `Instance: ${instance.id} → ${resolution.label} (${resolution.conceptId}), referential_status=generic`,
  );
  console.log(`Mentions: ${mentionCount} (expected 5), canonical GLP-1 hits: ${matchCount}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
