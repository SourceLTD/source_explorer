import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleDatabaseError } from '@/lib/db-utils';
import type { Prisma } from '@prisma/client';

export async function GET() {
  try {
    const roleTypes = await prisma.role_types.findMany({
      select: {
        id: true,
        code: true as const,
        label: true,
        generic_description: true,
        explanation: true
      } as Prisma.role_typesSelect,
      orderBy: {
        label: 'asc'
      }
    });

    // Return role types with code as the ID for display
    const roleTypesWithCode = roleTypes.map(rt => ({
      id: (rt as { code?: string }).code || rt.id.toString(),
      label: rt.label,
      generic_description: rt.generic_description,
      explanation: rt.explanation
    }));

    return NextResponse.json(roleTypesWithCode);
  } catch (error) {
    const { message, status, shouldRetry } = handleDatabaseError(error, 'GET /api/role-types');
    return NextResponse.json(
      { 
        error: message,
        retryable: shouldRetry,
        timestamp: new Date().toISOString()
      },
      { 
        status,
        headers: shouldRetry ? { 'Retry-After': '5' } : {}
      }
    );
  }
}
