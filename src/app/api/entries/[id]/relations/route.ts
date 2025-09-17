import { NextRequest, NextResponse } from 'next/server'
import { getEntryById } from '@/lib/db'

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
    console.error('Get relations error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
