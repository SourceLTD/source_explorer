import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleDatabaseError } from '@/lib/db-utils';

export async function GET(request: NextRequest) {
  try {
    const roleTypes = await prisma.role_types.findMany({
      select: {
        id: true,
        label: true,
        generic_description: true,
        explanation: true
      },
      orderBy: {
        label: 'asc'
      }
    });

    return NextResponse.json(roleTypes);
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
