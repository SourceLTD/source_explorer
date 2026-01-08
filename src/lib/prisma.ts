import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaListenersRegistered?: boolean;
};

// Debug database URL configuration
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

if (isDevelopment || isProduction) {
  const logPrefix = isProduction ? '[PROD]' : '[DEV]';
  console.log(`${logPrefix} Database configuration check:`, new Date().toISOString());
  console.log(`${logPrefix} - POSTGRES_URL_NON_POOLING exists:`, !!process.env.POSTGRES_URL_NON_POOLING);
  console.log(`${logPrefix} - POSTGRES_PRISMA_URL exists:`, !!process.env.POSTGRES_PRISMA_URL);

  const dbUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_PRISMA_URL;
  console.log(`${logPrefix} - Using URL starts with postgres:`, dbUrl?.startsWith('postgres'));
  
  if (dbUrl) {
    try {
      // Safely log URL without credentials
      const url = new URL(dbUrl);
      console.log(`${logPrefix} - Database host: ${url.hostname}:${url.port}`);
      console.log(`${logPrefix} - Database name: ${url.pathname.slice(1)}`);
      console.log(`${logPrefix} - Connection params:`, Object.fromEntries(url.searchParams));
    } catch (e) {
      console.log(`${logPrefix} - Error parsing database URL:`, e);
    }
  } else {
    console.log(`${logPrefix} - No database URL configured!`);
  }
}

// Add connection pool parameters to URL for production
// const getConnectionUrl = () => {
//   // Use POSTGRES_PRISMA_URL as primary (it's the pooled connection that works)
//   const baseUrl = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING;
//   if (!baseUrl) return baseUrl;
//   
//   if (process.env.NODE_ENV === 'production') {
//     const url = new URL(baseUrl);
//     url.searchParams.set('connection_limit', '10');
//     url.searchParams.set('pool_timeout', '30');
//     return url.toString();
//   }
//   
//   return baseUrl;
// };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  // Let Prisma use the URLs from schema.prisma (POSTGRES_PRISMA_URL and POSTGRES_URL_NON_POOLING)
  // Optimize for connection reliability
  errorFormat: 'pretty',
  transactionOptions: {
    timeout: 60000, // 60 seconds
    maxWait: 30000, // 30 seconds
  },
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Graceful shutdown - only register listeners once to avoid memory leaks with hot reloading
if (typeof process !== 'undefined' && !globalForPrisma.prismaListenersRegistered) {
  globalForPrisma.prismaListenersRegistered = true;
  
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