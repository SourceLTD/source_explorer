import { PrismaClient, lexical_unit_relation_type, part_of_speech } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create sample lexical entries
  const entries = [
    {
      code: 'have.v.02',
      legacy_id: 'have.v.02',
      gloss: 'have as a feature',
      pos: 'verb' as part_of_speech,
      lexfile: 'verb.stative',
      lemmas: ['have', 'feature'],
      src_lemmas: [],
      examples: ['This restaurant features the most famous chefs in France'],
    },
    {
      code: 'brim.v.01',
      legacy_id: 'brim.v.01',
      gloss: 'be completely full',
      pos: 'verb' as part_of_speech,
      lexfile: 'verb.stative',
      lemmas: ['brim'],
      src_lemmas: [],
      examples: ['His eyes brimmed with tears'],
    },
    {
      code: 'dog.n.01',
      legacy_id: 'dog.n.01',
      gloss: 'a common carnivorous mammal',
      pos: 'noun' as part_of_speech,
      lexfile: 'noun.animal',
      lemmas: ['dog', 'domestic_dog', 'Canis_familiaris'],
      src_lemmas: [],
      examples: ['a dog barked'],
    },
  ];

  // Insert entries
  for (const entry of entries) {
    await prisma.lexical_units.upsert({
      where: { code: entry.code },
      update: {},
      create: entry,
    });
  }

  // Create relations
  const relations = [
    { source: 'brim.v.01', target: 'have.v.02', type: 'hypernym' as lexical_unit_relation_type },
  ];

  for (const relation of relations) {
    const sourceEntry = await prisma.lexical_units.findUnique({
      where: { code: relation.source },
      select: { id: true }
    });
    
    const targetEntry = await prisma.lexical_units.findUnique({
      where: { code: relation.target },
      select: { id: true }
    });
    
    if (!sourceEntry || !targetEntry) {
      console.warn(`Skipping relation: ${relation.source} -> ${relation.target} (entry not found)`);
      continue;
    }
    
    await prisma.lexical_unit_relations.upsert({
      where: {
        source_id_type_target_id: {
          source_id: sourceEntry.id,
          type: relation.type,
          target_id: targetEntry.id,
        },
      },
      update: {},
      create: {
        source_id: sourceEntry.id,
        target_id: targetEntry.id,
        type: relation.type,
      },
    });
  }

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
