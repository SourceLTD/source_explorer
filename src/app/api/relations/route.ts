import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { RelationType } from '@prisma/client'

interface RelationRequest {
  sourceId: string
  targetId: string
  type: RelationType
}

// POST /api/relations - Create a new relation
export async function POST(request: NextRequest) {
  try {
    const body: RelationRequest = await request.json()
    
    // Validate required fields
    if (!body.sourceId || !body.targetId || !body.type) {
      return NextResponse.json(
        { error: 'Missing required fields: sourceId, targetId, type' },
        { status: 400 }
      )
    }
    
    // Validate relation type
    const validTypes: RelationType[] = ['also_see', 'causes', 'entails', 'hypernym', 'hyponym']
    if (!validTypes.includes(body.type)) {
      return NextResponse.json(
        { error: `Invalid relation type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }
    
    // Prevent self-relations
    if (body.sourceId === body.targetId) {
      return NextResponse.json(
        { error: 'Cannot create relation between entry and itself' },
        { status: 400 }
      )
    }
    
    const relation = await db.createEntryRelation(body.sourceId, body.targetId, body.type)
    
    return NextResponse.json(relation, { status: 201 })
  } catch (error) {
    console.error('Create relation error:', error)
    
    // Handle unique constraint violation
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json(
        { error: 'This relation already exists' },
        { status: 409 }
      )
    }
    
    // Handle foreign key constraint violation
    if (error instanceof Error && error.message.includes('Foreign key constraint')) {
      return NextResponse.json(
        { error: 'One or both entries do not exist' },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/relations - Delete a relation
export async function DELETE(request: NextRequest) {
  try {
    const body: RelationRequest = await request.json()
    
    // Validate required fields
    if (!body.sourceId || !body.targetId || !body.type) {
      return NextResponse.json(
        { error: 'Missing required fields: sourceId, targetId, type' },
        { status: 400 }
      )
    }
    
    await db.deleteEntryRelation(body.sourceId, body.targetId, body.type)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete relation error:', error)
    
    // Handle not found
    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      return NextResponse.json(
        { error: 'Relation not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
