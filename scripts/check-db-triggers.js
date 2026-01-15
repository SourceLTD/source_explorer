const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTriggers() {
  try {
    // 1. Check triggers on frames table
    const triggers = await prisma.$queryRaw`
      SELECT tgname, tgrelid::regclass::text as table_name
      FROM pg_trigger 
      WHERE tgrelid = 'frames'::regclass
    `;
    console.log('--- Triggers on frames table ---');
    console.table(triggers);

    // 2. Check lexical_units table triggers too
    const luTriggers = await prisma.$queryRaw`
      SELECT tgname, tgrelid::regclass::text as table_name
      FROM pg_trigger 
      WHERE tgrelid = 'lexical_units'::regclass
    `;
    console.log('\n--- Triggers on lexical_units table ---');
    console.table(luTriggers);

    // 3. Check queue size
    try {
      const queueStats = await prisma.$queryRaw`
        SELECT count(*) as count FROM embedding_jobs
      `;
      console.log('\n--- Embedding Queue Size ---');
      console.table(queueStats);
    } catch (e) {
      console.log('\nCould not read embedding_jobs queue (might be empty/not created):', e.message);
    }

    // 4. Check for failed jobs in archive (if PGMQ archives them) or recent processed logs
    // (This depends on PGMQ internals, skipping for now to keep it safe)

  } catch (error) {
    console.error('Error checking triggers:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTriggers();
