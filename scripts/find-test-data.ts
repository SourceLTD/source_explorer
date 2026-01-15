/**
 * Script to find and optionally clean up leftover E2E test data in the database
 * 
 * Usage:
 *   npx tsx scripts/find-test-data.ts           # Find test data
 *   npx tsx scripts/find-test-data.ts --cleanup # Find and remove test data
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CLEANUP = process.argv.includes('--cleanup');

async function main() {
  console.log('🔍 Searching for TEST_E2E data in database...\n');
  if (CLEANUP) {
    console.log('⚠️  CLEANUP MODE: Will delete test data\n');
  }

  // 1. Find test lexical units
  const testLexicalUnits = await prisma.lexical_units.findMany({
    where: {
      code: { contains: 'TEST_E2E' },
    },
    select: {
      id: true,
      code: true,
      pos: true,
      gloss: true,
      created_at: true,
      frame_id: true,
    },
  });

  console.log(`📋 Lexical Units with TEST_E2E in code: ${testLexicalUnits.length}`);
  for (const lu of testLexicalUnits) {
    console.log(`   - ID: ${lu.id}, Code: ${lu.code}`);
    console.log(`     POS: ${lu.pos}, Frame ID: ${lu.frame_id || 'none'}`);
    console.log(`     Gloss: ${lu.gloss?.substring(0, 50)}...`);
    console.log(`     Created: ${lu.created_at}`);
  }

  // 2. Find test frames
  const testFrames = await prisma.frames.findMany({
    where: {
      label: { contains: 'TEST_E2E' },
    },
    select: {
      id: true,
      label: true,
      definition: true,
      created_at: true,
    },
  });

  console.log(`\n🖼️  Frames with TEST_E2E in label: ${testFrames.length}`);
  for (const frame of testFrames) {
    console.log(`   - ID: ${frame.id}, Label: ${frame.label}`);
    console.log(`     Definition: ${frame.definition?.substring(0, 50)}...`);
    console.log(`     Created: ${frame.created_at}`);
  }

  // 3. Find test LLM jobs
  const testJobs = await prisma.llm_jobs.findMany({
    where: {
      label: { contains: 'TEST_E2E' },
    },
    select: {
      id: true,
      label: true,
      job_type: true,
      status: true,
      created_at: true,
      submitted_by: true,
    },
  });

  console.log(`\n🤖 LLM Jobs with TEST_E2E in label: ${testJobs.length}`);
  for (const job of testJobs) {
    console.log(`   - ID: ${job.id}, Label: ${job.label}`);
    console.log(`     Type: ${job.job_type}, Status: ${job.status}`);
    console.log(`     Submitted by: ${job.submitted_by}`);
    console.log(`     Created: ${job.created_at}`);
  }

  // 4. Find changesets created by e2e-test
  const testChangesets = await prisma.changesets.findMany({
    where: {
      created_by: 'e2e-test',
    },
    select: {
      id: true,
      entity_type: true,
      entity_id: true,
      operation: true,
      status: true,
      created_at: true,
    },
  });

  console.log(`\n📝 Changesets created by 'e2e-test': ${testChangesets.length}`);
  for (const cs of testChangesets) {
    console.log(`   - ID: ${cs.id}, Entity: ${cs.entity_type} (${cs.entity_id})`);
    console.log(`     Operation: ${cs.operation}, Status: ${cs.status}`);
    console.log(`     Created: ${cs.created_at}`);
  }

  // 5. Find change comments by e2e-test author
  const testComments = await prisma.change_comments.findMany({
    where: {
      author: 'e2e-test',
    },
    select: {
      id: true,
      changeset_id: true,
      field_change_id: true,
      content: true,
      created_at: true,
    },
  });

  console.log(`\n💬 Comments by 'e2e-test': ${testComments.length}`);
  for (const comment of testComments) {
    console.log(`   - ID: ${comment.id}, Changeset: ${comment.changeset_id}, Field Change: ${comment.field_change_id}`);
    console.log(`     Content: ${comment.content?.substring(0, 50)}...`);
    console.log(`     Created: ${comment.created_at}`);
  }

  // 6. Find lexical_unit_relations involving test data
  const testLexicalUnitIds = testLexicalUnits.map(lu => lu.id);
  if (testLexicalUnitIds.length > 0) {
    const testRelations = await prisma.lexical_unit_relations.findMany({
      where: {
        OR: [
          { source_id: { in: testLexicalUnitIds } },
          { target_id: { in: testLexicalUnitIds } },
        ],
      },
      select: {
        id: true,
        source_id: true,
        target_id: true,
        type: true,
      },
    });

    console.log(`\n🔗 Lexical Unit Relations involving test data: ${testRelations.length}`);
    for (const rel of testRelations) {
      console.log(`   - ID: ${rel.id}, Source: ${rel.source_id}, Target: ${rel.target_id}, Type: ${rel.type}`);
    }
  }

  // Summary
  const totalTestData = 
    testLexicalUnits.length + 
    testFrames.length + 
    testJobs.length + 
    testChangesets.length + 
    testComments.length;

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary');
  console.log(`   Total test data found: ${totalTestData} items`);
  
  if (totalTestData > 0) {
    if (CLEANUP) {
      console.log('\n🧹 Cleaning up test data...');
      
      // Delete in correct order respecting FK constraints:
      // 1. Delete changesets first (they reference llm_jobs via llm_job_id)
      if (testChangesets.length > 0) {
        const changesetIds = testChangesets.map(cs => cs.id);
        const deleted = await prisma.changesets.deleteMany({
          where: { id: { in: changesetIds } },
        });
        console.log(`   Deleted ${deleted.count} changesets`);
      }

      // 2. Delete job items for test jobs
      if (testJobs.length > 0) {
        const jobIds = testJobs.map(j => j.id);
        const deletedItems = await prisma.llm_job_items.deleteMany({
          where: { job_id: { in: jobIds } },
        });
        console.log(`   Deleted ${deletedItems.count} job items`);
        
        // 3. Now delete the jobs themselves
        const deletedJobs = await prisma.llm_jobs.deleteMany({
          where: { id: { in: jobIds } },
        });
        console.log(`   Deleted ${deletedJobs.count} jobs`);
      }

      // 4. Delete comments by e2e-test
      if (testComments.length > 0) {
        const commentIds = testComments.map(c => c.id);
        const deleted = await prisma.change_comments.deleteMany({
          where: { id: { in: commentIds } },
        });
        console.log(`   Deleted ${deleted.count} comments`);
      }

      // 5. Delete lexical units with TEST_E2E codes
      if (testLexicalUnits.length > 0) {
        const luIds = testLexicalUnits.map(lu => lu.id);
        // Use raw query because of TSVector fields
        const deleted = await prisma.$executeRaw`DELETE FROM lexical_units WHERE id = ANY(${luIds}::bigint[])`;
        console.log(`   Deleted ${deleted} lexical units`);
      }

      // 6. Delete frames with TEST_E2E labels
      if (testFrames.length > 0) {
        const frameIds = testFrames.map(f => f.id);
        const deleted = await prisma.frames.deleteMany({
          where: { id: { in: frameIds } },
        });
        console.log(`   Deleted ${deleted.count} frames`);
      }

      console.log('\n✅ Cleanup complete!');
    } else {
      console.log('\n⚠️  Test data found! This data should have been cleaned up.');
      console.log('   Run with --cleanup flag to remove this data.');
    }
  } else {
    console.log('\n✅ No test data found in database.');
  }
}

main()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
