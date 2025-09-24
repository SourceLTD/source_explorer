import { NextRequest, NextResponse } from 'next/server'
import { getEntryById } from '@/lib/db'
import { handleDatabaseError } from '@/lib/db-utils'

// GET /api/entries/[id]/relations - Get relations for an entry
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const entry = await getEntryById(id)
    
    if (!entry) {
      return NextResponse.json(
        { error: 'Entry not found' },
        { status: 404 }
      )
    }
    
    const relations = {
      sourceRelations: entry.sourceRelations,
      targetRelations: entry.targetRelations
    }
    
    return NextResponse.json(relations)
  } catch (error) {
    const { message, status, shouldRetry } = handleDatabaseError(error, 'GET /api/entries/[id]/relations');
    
    return NextResponse.json(
      { 
        error: message,
        retryable: shouldRetry,
        timestamp: new Date().toISOString()
      },
      { 
        status,
        headers: shouldRetry ? {
          'Retry-After': '5'
        } : {}
      }
    )
  }
}
