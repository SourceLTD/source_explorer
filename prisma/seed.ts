import { PrismaClient, RelationType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create sample lexical entries
  const entries = [
    {
      code: 'have.v.02',
      legacy_id: 'have.v.02',
      gloss: 'have as a feature',
      pos: 'v',
      lexfile: 'verb.stative',
      lemmas: ['have', 'feature'],
      src_lemmas: [],
      examples: ['This restaurant features the most famous chefs in France'],
    },
    {
      code: 'brim.v.01',
      legacy_id: 'brim.v.01',
      gloss: 'be completely full',
      pos: 'v',
      lexfile: 'verb.stative',
      lemmas: ['brim'],
      src_lemmas: [],
      examples: ['His eyes brimmed with tears'],
    },
    {
      code: 'abound.v.02',
      legacy_id: 'abound.v.02',
      gloss: 'be abundant or plentiful; exist in large quantities',
      pos: 'v',
      lexfile: 'verb.stative',
      lemmas: ['abound', 'burst', 'bristle'],
      src_lemmas: [],
      examples: ['The plaza is bursting with life'],
    },
    {
      code: 'bear.v.01',
      legacy_id: 'bear.v.01',
      gloss: 'have',
      pos: 'v',
      lexfile: 'verb.stative',
      lemmas: ['bear', 'carry'],
      src_lemmas: [],
      examples: ['bear a resemblance', 'bear a signature'],
    },
    {
      code: 'carry.v.02',
      legacy_id: 'carry.v.02',
      gloss: 'have with oneself; have on one\'s person',
      pos: 'v',
      lexfile: 'verb.possession',
      lemmas: ['carry', 'pack', 'take'],
      src_lemmas: [],
      examples: ['She always takes an umbrella'],
    },
    {
      code: 'carry.v.18',
      legacy_id: 'carry.v.18',
      gloss: 'bear or be able to bear the weight, pressure, or responsibility of',
      pos: 'v',
      lexfile: 'verb.stative',
      lemmas: ['carry', 'hold', 'support'],
      src_lemmas: [],
      examples: ['Can you carry this suitcase?'],
    },
    {
      code: 'carry.v.22',
      legacy_id: 'carry.v.22',
      gloss: 'have or possess something abstract',
      pos: 'v',
      lexfile: 'verb.stative',
      lemmas: ['carry', 'bear'],
      src_lemmas: [],
      examples: ['I carry her image in my mind\'s eye'],
    },
    {
      code: 'carry.v.35',
      legacy_id: 'carry.v.35',
      gloss: 'include as the content; broadcast or publicize',
      pos: 'v',
      lexfile: 'verb.communication',
      lemmas: ['carry', 'run'],
      src_lemmas: [],
      examples: ['All major networks carried the press conference'],
    },
    {
      code: 'give_off.v.01',
      legacy_id: 'give_off.v.01',
      gloss: 'have as a by-product',
      pos: 'v',
      lexfile: 'verb.creation',
      lemmas: ['give_off', 'emit'],
      src_lemmas: [],
      examples: ['The big cities gave off so many wonderful American qualities'],
    },
    {
      code: 'imply.v.05',
      legacy_id: 'imply.v.05',
      gloss: 'have as a logical consequence',
      pos: 'v',
      lexfile: 'verb.stative',
      lemmas: ['imply', 'connote'],
      src_lemmas: [],
      examples: ['The water shortage means that we have to stop taking long showers'],
    },
    {
      code: 'possess.v.01',
      legacy_id: 'possess.v.01',
      gloss: 'have as an attribute or quality',
      pos: 'v',
      lexfile: 'verb.stative',
      lemmas: ['possess', 'own'],
      src_lemmas: [],
      examples: ['he possesses great knowledge in that area'],
    },
    {
      code: 'read.v.02',
      legacy_id: 'read.v.02',
      gloss: 'have or contain a certain wording or form',
      pos: 'v',
      lexfile: 'verb.stative',
      lemmas: ['read', 'say'],
      src_lemmas: [],
      examples: ['The passage reads as follows'],
    },
    {
      code: 'sport.v.01',
      legacy_id: 'sport.v.01',
      gloss: 'wear or display in an ostentatious or proud manner',
      pos: 'v',
      lexfile: 'verb.body',
      lemmas: ['sport', 'boast', 'feature'],
      src_lemmas: [],
      examples: ['she was sporting a new hat'],
    },
    {
      code: 'star.v.01',
      legacy_id: 'star.v.01',
      gloss: 'feature as the star',
      pos: 'v',
      lexfile: 'verb.creation',
      lemmas: ['star'],
      src_lemmas: [],
      examples: ['The movie stars Dustin Hoffman as an autistic man'],
    },
    {
      code: 'unite.v.03',
      legacy_id: 'unite.v.03',
      gloss: 'have or possess in combination',
      pos: 'v',
      lexfile: 'verb.stative',
      lemmas: ['unite', 'combine'],
      src_lemmas: [],
      examples: ['she unites charm with a good business sense'],
    },
    {
      code: 'wear.v.02',
      legacy_id: 'wear.v.02',
      gloss: 'have on one\'s person',
      pos: 'v',
      lexfile: 'verb.body',
      lemmas: ['wear', 'bear'],
      src_lemmas: [],
      examples: ['He always wears a smile'],
    },
    {
      code: 'wear.v.03',
      legacy_id: 'wear.v.03',
      gloss: 'have in one\'s aspect; wear an expression of one\'s attitude or personality',
      pos: 'v',
      lexfile: 'verb.body',
      lemmas: ['wear'],
      src_lemmas: [],
      examples: ['He always wears a smile'],
    },
    {
      code: 'wear.v.05',
      legacy_id: 'wear.v.05',
      gloss: 'have or show an appearance of',
      pos: 'v',
      lexfile: 'verb.perception',
      lemmas: ['wear'],
      src_lemmas: [],
      examples: ['wear one\'s hair in a certain way'],
    },
  ];

  // Insert entries
  for (const entry of entries) {
    await prisma.lexicalEntry.upsert({
      where: { code: entry.code }, // Use code for lookup
      update: {},
      create: entry,
    });
  }

  // Create relations (hypernym/hyponym relationships)
  const relations = [
    // have.v.02 is hypernym to many others
    { source: 'brim.v.01', target: 'have.v.02', type: RelationType.hypernym },
    { source: 'abound.v.02', target: 'have.v.02', type: RelationType.hypernym },
    { source: 'bear.v.01', target: 'have.v.02', type: RelationType.hypernym },
    { source: 'carry.v.02', target: 'have.v.02', type: RelationType.hypernym },
    { source: 'carry.v.18', target: 'have.v.02', type: RelationType.hypernym },
    { source: 'carry.v.22', target: 'have.v.02', type: RelationType.hypernym },
    { source: 'carry.v.35', target: 'have.v.02', type: RelationType.hypernym },
    { source: 'give_off.v.01', target: 'have.v.02', type: RelationType.hypernym },
    { source: 'imply.v.05', target: 'have.v.02', type: RelationType.hypernym },
    { source: 'possess.v.01', target: 'have.v.02', type: RelationType.hypernym },
    { source: 'read.v.02', target: 'have.v.02', type: RelationType.hypernym },
    { source: 'sport.v.01', target: 'have.v.02', type: RelationType.hypernym },
    { source: 'star.v.01', target: 'have.v.02', type: RelationType.hypernym },
    { source: 'unite.v.03', target: 'have.v.02', type: RelationType.hypernym },
    { source: 'wear.v.02', target: 'have.v.02', type: RelationType.hypernym },
    { source: 'wear.v.03', target: 'have.v.02', type: RelationType.hypernym },
    { source: 'wear.v.05', target: 'have.v.02', type: RelationType.hypernym },

    // Create corresponding hyponym relations
    { source: 'have.v.02', target: 'brim.v.01', type: RelationType.hyponym },
    { source: 'have.v.02', target: 'abound.v.02', type: RelationType.hyponym },
    { source: 'have.v.02', target: 'bear.v.01', type: RelationType.hyponym },
    { source: 'have.v.02', target: 'carry.v.02', type: RelationType.hyponym },
    { source: 'have.v.02', target: 'carry.v.18', type: RelationType.hyponym },
    { source: 'have.v.02', target: 'carry.v.22', type: RelationType.hyponym },
    { source: 'have.v.02', target: 'carry.v.35', type: RelationType.hyponym },
    { source: 'have.v.02', target: 'give_off.v.01', type: RelationType.hyponym },
    { source: 'have.v.02', target: 'imply.v.05', type: RelationType.hyponym },
    { source: 'have.v.02', target: 'possess.v.01', type: RelationType.hyponym },
    { source: 'have.v.02', target: 'read.v.02', type: RelationType.hyponym },
    { source: 'have.v.02', target: 'sport.v.01', type: RelationType.hyponym },
    { source: 'have.v.02', target: 'star.v.01', type: RelationType.hyponym },
    { source: 'have.v.02', target: 'unite.v.03', type: RelationType.hyponym },
    { source: 'have.v.02', target: 'wear.v.02', type: RelationType.hyponym },
    { source: 'have.v.02', target: 'wear.v.03', type: RelationType.hyponym },
    { source: 'have.v.02', target: 'wear.v.05', type: RelationType.hyponym },
  ];

  // Insert relations - convert codes to numeric IDs
  for (const relation of relations) {
    // Get numeric IDs from codes
    const sourceEntry = await prisma.lexicalEntry.findUnique({
      where: { code: relation.source },
      select: { id: true }
    });
    
    const targetEntry = await prisma.lexicalEntry.findUnique({
      where: { code: relation.target },
      select: { id: true }
    });
    
    if (!sourceEntry || !targetEntry) {
      console.warn(`Skipping relation: ${relation.source} -> ${relation.target} (entry not found)`);
      continue;
    }
    
    await prisma.entryRelation.upsert({
      where: {
        sourceId_type_targetId: {
          sourceId: sourceEntry.id,
          type: relation.type,
          targetId: targetEntry.id,
        },
      },
      update: {},
      create: {
        sourceId: sourceEntry.id,
        targetId: targetEntry.id,
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