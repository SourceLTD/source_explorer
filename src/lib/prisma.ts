import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Debug database URL configuration
if (process.env.NODE_ENV === 'development') {
  console.log('Database configuration check:');
  console.log('- DIRECT_URL exists:', !!process.env.DIRECT_URL);
  console.log('- DATABASE_URL exists:', !!process.env.DATABASE_URL);
  
  const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  console.log('- Using URL starts with postgres:', dbUrl?.startsWith('postgres'));
  
  if (dbUrl) {
    try {
      // Safely log URL without credentials
      const url = new URL(dbUrl);
      console.log(`- Database host: ${url.hostname}:${url.port}`);
      console.log(`- Database name: ${url.pathname.slice(1)}`);
    } catch (e) {
      console.log('- Error parsing database URL:', e);
    }
  } else {
    console.log('- No database URL configured!');
  }
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn', 'info'] : ['error'],
  datasources: {
    db: {
      url: process.env.DIRECT_URL || process.env.DATABASE_URL,
    },
  },
  // Optimize for connection reliability
  errorFormat: 'pretty',
  transactionOptions: {
    timeout: 60000, // 60 seconds
    maxWait: 20000, // 20 seconds
  },
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Graceful shutdown
if (typeof process !== 'undefined') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect();
  });
  
  process.on('SIGINT', async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}