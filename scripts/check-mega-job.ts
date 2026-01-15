import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkMegaJob() {
  try {
    // Find the job by label
    const job = await prisma.llm_jobs.findFirst({
      where: {
        label: { contains: 'Edit All Lexical_units' }
      },
      orderBy: { created_at: 'desc' }
    });

    if (!job) {
      console.log('Job not found!');
      return;
    }

    console.log('\n=== MEGA JOB STATUS ===');
    console.log(`ID: ${job.id}`);
    console.log(`Label: ${job.label}`);
    console.log(`Status: ${job.status}`);
    console.log(`Created: ${job.created_at}`);
    console.log(`Total Items: ${job.total_items}`);
    console.log(`Submitted: ${job.submitted_items}`);
    console.log(`Succeeded: ${job.succeeded_items}`);
    console.log(`Failed: ${job.failed_items}`);
    console.log(`Deleted: ${job.deleted}`);

    // Count items by status
    const itemCounts = await prisma.llm_job_items.groupBy({
      by: ['status'],
      where: { job_id: job.id },
      _count: true
    });

    console.log('\n=== ITEM BREAKDOWN ===');
    for (const count of itemCounts) {
      console.log(`${count.status}: ${count._count}`);
    }

    // Check how many are already sent to OpenAI
    const sentToOpenAI = await prisma.llm_job_items.count({
      where: {
        job_id: job.id,
        provider_task_id: { not: null }
      }
    });
    console.log(`\nAlready sent to OpenAI: ${sentToOpenAI}`);

    // Check how many are still in queue
    const stillQueued = await prisma.llm_job_items.count({
      where: {
        job_id: job.id,
        status: 'queued',
        provider_task_id: null
      }
    });
    console.log(`Still waiting in queue: ${stillQueued}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkMegaJob();
