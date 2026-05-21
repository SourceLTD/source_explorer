/**
 * Dry-run GLP-1 supertype resolution. Run: npm run db:resolve:glp1-concepts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { printResolutionReport, resolveGlp1Supertype } from './lib/resolve-seed-concept';

const prisma = new PrismaClient();

async function main() {
  const resolution = await resolveGlp1Supertype(prisma, { apply: false });
  printResolutionReport(resolution);
  console.log('\nDry-run only. Run npm run db:seed:glp1-paper to apply.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
