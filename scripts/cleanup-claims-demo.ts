/**
 * Remove claims-demo ABox data. Run: npm run db:cleanup:claims-demo
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_GRAPH_LABELS = ['Acme Corp filings', 'Riverdale clinic'];

async function main() {
  const demoSources = await prisma.source_texts.findMany({
    where: { source_uri: { startsWith: 'claims-demo://' } },
    select: { id: true },
  });
  const demoSourceIds = demoSources.map((s) => s.id);

  const demoGraphs = await prisma.knowledge_graphs.findMany({
    where: { label: { in: DEMO_GRAPH_LABELS } },
    select: { id: true },
  });
  const demoGraphIds = demoGraphs.map((g) => g.id);

  const demoInstances = await prisma.instances.findMany({
    where: {
      OR: [
        { knowledge_graph_id: { in: demoGraphIds } },
        { source_text_id: { in: demoSourceIds } },
      ],
    },
    select: { id: true },
  });
  const instanceIds = demoInstances.map((i) => i.id);

  const delMentions = await prisma.instance_mentions.deleteMany({
    where: { instance_id: { in: instanceIds } },
  });
  const delFillers = await prisma.instance_fillers.deleteMany({
    where: { instance_id: { in: instanceIds } },
  });
  const delInstances = await prisma.instances.deleteMany({
    where: { id: { in: instanceIds } },
  });
  const delSources = await prisma.source_texts.deleteMany({
    where: { id: { in: demoSourceIds } },
  });
  const delGraphs = await prisma.knowledge_graphs.deleteMany({
    where: { id: { in: demoGraphIds } },
  });

  console.log('Claims demo cleanup:');
  console.log(`  instance_mentions: ${delMentions.count}`);
  console.log(`  instance_fillers: ${delFillers.count}`);
  console.log(`  instances: ${delInstances.count}`);
  console.log(`  source_texts: ${delSources.count}`);
  console.log(`  knowledge_graphs: ${delGraphs.count}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
