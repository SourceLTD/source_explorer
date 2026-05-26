/**
 * Import curated source-medical mappings into the Source TBox.
 *
 * Run: npm run db:import:source-medical
 *
 * Requires:
 *   - source-medical repo at ../source-medical (or SOURCE_MEDICAL_PATH)
 *   - concept_external_ids migration applied
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { PrismaClient } from '@prisma/client';
import {
  buildParentMap,
  ensureArchetypeRoots,
  flattenConceptRecords,
  importMedicalConcept,
  loadCuratedMappingFiles,
  resolveSourceMedicalRoot,
} from '../src/lib/medical';

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === '1';

async function main() {
  const root = resolveSourceMedicalRoot();
  console.log(`Loading mappings from ${root}`);

  const files = loadCuratedMappingFiles(root);
  const records = flattenConceptRecords(files);
  console.log(`Found ${records.length} concept records in ${files.length} files`);

  if (DRY_RUN) {
    for (const record of records) {
      console.log(`  [dry-run] ${record.id} → ${record.archetype}${record.subtype ? `/${record.subtype}` : ''}`);
    }
    return;
  }

  await ensureArchetypeRoots(prisma);
  const parentMap = await buildParentMap(prisma);
  console.log(
    `Parent map: ${parentMap.archetypeRoot.size} archetype roots, ${parentMap.subtypeHub.size} subtype hubs`,
  );

  let created = 0;
  let updated = 0;

  for (const record of records) {
    const result = await importMedicalConcept(prisma, record, parentMap);
    if (result.created) {
      created++;
      console.log(`  + created ${record.id} → concept ${result.conceptId} (${record.label})`);
    } else {
      updated++;
      console.log(`  ~ updated ${record.id} → concept ${result.conceptId} (${record.label})`);
    }
  }

  console.log(`\nDone. ${created} created, ${updated} updated.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
