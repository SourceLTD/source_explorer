const { PrismaClient } = require('@prisma/client');

async function debugAbound() {
  const prisma = new PrismaClient();
  
  try {
    console.log('=== Looking for entries with "abound" in lemmas ===');
    const aboundEntries = await prisma.lexicalEntry.findMany({
      where: {
        lemmas: {
          has: 'abound'
        }
      },
      include: {
        sourceRelations: {
          include: {
            target: true
          }
        },
        targetRelations: {
          include: {
            source: true
          }
        }
      }
    });
    
    console.log(`Found ${aboundEntries.length} entries with "abound"`);
    
    for (const entry of aboundEntries) {
      console.log(`\n--- Entry: ${entry.id} ---`);
      console.log(`Lemmas: ${JSON.stringify(entry.lemmas)}`);
      console.log(`Gloss: ${entry.gloss}`);
      console.log(`POS: ${entry.pos}`);
      
      console.log('\nSource Relations (this entry -> others):');
      for (const rel of entry.sourceRelations) {
        console.log(`  ${rel.type}: ${entry.id} -> ${rel.targetId} (${rel.target?.lemmas?.[0] || 'unknown'})`);
      }
      
      console.log('\nTarget Relations (others -> this entry):');
      for (const rel of entry.targetRelations) {
        console.log(`  ${rel.type}: ${rel.sourceId} (${rel.source?.lemmas?.[0] || 'unknown'}) -> ${entry.id}`);
      }
    }
    
    console.log('\n=== Looking for entries with "have" in lemmas ===');
    const haveEntries = await prisma.lexicalEntry.findMany({
      where: {
        lemmas: {
          has: 'have'
        }
      },
      include: {
        sourceRelations: {
          include: {
            target: true
          }
        }
      }
    });
    
    console.log(`Found ${haveEntries.length} entries with "have"`);
    
    for (const entry of haveEntries) {
      console.log(`\n--- Entry: ${entry.id} ---`);
      console.log(`Lemmas: ${JSON.stringify(entry.lemmas)}`);
      console.log(`Gloss: ${entry.gloss}`);
      
      console.log('\nSource Relations (this entry -> others):');
      for (const rel of entry.sourceRelations) {
        if (rel.target?.lemmas?.includes('abound')) {
          console.log(`  *** FOUND CONNECTION TO ABOUND ***`);
        }
        console.log(`  ${rel.type}: ${entry.id} -> ${rel.targetId} (${rel.target?.lemmas?.[0] || 'unknown'})`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugAbound();
