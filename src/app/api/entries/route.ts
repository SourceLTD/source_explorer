import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { CreateEntryInput } from '@/lib/types'

// GET /api/entries - List entries with pagination
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const pos = searchParams.get('pos') || undefined
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const mweOnly = searchParams.get('mwe') === 'true'

    let entries
    if (mweOnly) {
      entries = await db.getMultiwordExpressions(limit, offset)
    } else if (pos) {
      entries = await db.getLexicalEntriesByPos(pos, limit, offset)
    } else {
      // Get all entries (you might want to add this method to DatabaseService)
      entries = await db.prisma.lexicalEntry.findMany({
        take: limit,
        skip: offset,
        orderBy: { gloss: 'asc' }
      })
    }

    return NextResponse.json(entries)
  } catch (error) {
    console.error('Get entries error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/entries - Create new entry
export async function POST(request: NextRequest) {
  try {
    const body: CreateEntryInput = await request.json()
    
    // Validate required fields
    if (!body.id || !body.gloss || !body.pos || !body.lexfile) {
      return NextResponse.json(
        { error: 'Missing required fields: id, gloss, pos, lexfile' },
        { status: 400 }
      )
    }

    // Validate POS
    if (!['n', 'v', 'a', 'r', 's'].includes(body.pos)) {
      return NextResponse.json(
        { error: 'Invalid pos value. Must be one of: n, v, a, r, s' },
        { status: 400 }
      )
    }

    const entry = await db.createLexicalEntry(body)
    
    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    console.error('Create entry error:', error)
    
    // Handle unique constraint violation
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json(
        { error: 'Entry with this ID already exists' },
        { status: 409 }
      )
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
