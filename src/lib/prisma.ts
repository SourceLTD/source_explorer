import { PrismaClient } from '@prisma/client'

// Global variable to store the Prisma client instance
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Create a single instance of PrismaClient
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

// In development, store the instance globally to prevent multiple instances
// due to hot reloading
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Graceful shutdown
export async function disconnectPrisma() {
  await prisma.$disconnect()
}

// Connection test utility
export async function testConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return { success: true, message: 'Database connection successful' }
  } catch (error) {
    return { 
      success: false, 
      message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
    }
  }
}