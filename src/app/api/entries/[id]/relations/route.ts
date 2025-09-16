import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { RelationType } from '@prisma/client'

// GET /api/entries/[id]/relations - Get relations for an entry
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') as RelationType | null
    
    const relations = await db.getEntryRelations(params.id, type || undefined)
    
    return NextResponse.json(relations)
  } catch (error) {
    console.error('Get relations error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}