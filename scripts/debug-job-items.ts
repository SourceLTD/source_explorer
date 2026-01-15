import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const itemIds = [48, 51, 55, 80, 92];
  
  // First, check if these are llm_job_items IDs or frame IDs
  const items = await prisma.llm_job_items.findMany({
    where: {
      OR: [
        { id: { in: itemIds.map(id => BigInt(id)) } },
        { frame_id: { in: itemIds.map(id => BigInt(id)) } }
      ]
    },
    take: 10
  });

  console.log('--- Job Items ---');
  for (const item of items) {
    console.log(`ID: ${item.id}, JobID: ${item.job_id}, FrameID: ${item.frame_id}, Status: ${item.status}`);
    console.log('Payload Entry:', (item.request_payload as any)?.entry);
    console.log('Payload frameInfo:', (item.request_payload as any)?.frameInfo);
    console.log('---');
  }

  // Also check the frames themselves
  const frames = await prisma.frames.findMany({
    where: {
      id: { in: itemIds.map(id => BigInt(id)) }
    }
  });

  console.log('--- Frames ---');
  for (const frame of frames) {
    console.log(`ID: ${frame.id}, Code: "${frame.code}", Label: "${frame.label}"`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
