import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { UpdateEntryInput } from '@/lib/types'

// GET /api/entries/[id] - Get single entry
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const includeRelations = searchParams.get('relations') === 'true'
    
    const entry = await db.getLexicalEntry(params.id, includeRelations)
    
    if (!entry) {
      return NextResponse.json(
        { error: 'Entry not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(entry)
  } catch (error) {
    console.error('Get entry error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PATCH /api/entries/[id] - Update entry
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body: UpdateEntryInput = await request.json()
    
    // Validate POS if provided
    if (body.pos && !['n', 'v', 'a', 'r', 's'].includes(body.pos)) {
      return NextResponse.json(
        { error: 'Invalid pos value. Must be one of: n, v, a, r, s' },
        { status: 400 }
      )
    }
    
    const entry = await db.updateLexicalEntry(params.id, body)
    
    return NextResponse.json(entry)
  } catch (error) {
    console.error('Update entry error:', error)
    
    // Handle not found
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      return NextResponse.json(
        { error: 'Entry not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/entries/[id] - Delete entry
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await db.deleteLexicalEntry(params.id)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete entry error:', error)
    
    // Handle not found
    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      return NextResponse.json(
        { error: 'Entry not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}