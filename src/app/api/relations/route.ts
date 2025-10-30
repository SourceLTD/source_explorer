import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { revalidateAllEntryCaches } from '@/lib/db'
import type { RelationType, Prisma } from '@prisma/client'

// Force dynamic rendering - no static optimization
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RelationRequest {
  sourceId: string  // These are codes (e.g., "attack.v.01")
  targetId: string  // These are codes (e.g., "fight.v.01")
  type: RelationType
}

interface ChangeHypernymRequest {
  action: 'change_hypernym';
  entryId: string;
  oldHypernym?: string;
  newHypernym: string;
  hyponymsToMove: string[];
  hyponymsToStay: string[];
}

async function handleChangeHypernym(req: ChangeHypernymRequest): Promise<NextResponse> {
  const { entryId, oldHypernym, newHypernym, hyponymsToMove, hyponymsToStay } = req;

  // Get entry IDs
  const entry = await prisma.verbs.findUnique({
    where: { code: entryId } as unknown as Prisma.verbsWhereUniqueInput,
    select: { id: true }
  });

  if (!entry) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  }

  const newHypernymEntry = await prisma.verbs.findUnique({
    where: { code: newHypernym } as unknown as Prisma.verbsWhereUniqueInput,
    select: { id: true }
  });

  if (!newHypernymEntry) {
    return NextResponse.json({ error: 'New hypernym not found' }, { status: 404 });
  }

  // 1. Delete old hypernym relation (entry -> oldHypernym)
  if (oldHypernym) {
    const oldHypernymEntry = await prisma.verbs.findUnique({
      where: { code: oldHypernym } as unknown as Prisma.verbsWhereUniqueInput,
      select: { id: true }
    });

    if (oldHypernymEntry) {
      await prisma.verb_relations.deleteMany({
        where: {
          source_id: entry.id,
          target_id: oldHypernymEntry.id,
          type: 'hypernym'
        }
      });
    }
  }

  // 2. Create new hypernym relation (entry -> newHypernym)
  await prisma.verb_relations.upsert({
    where: {
      source_id_type_target_id: {
        source_id: entry.id,
        target_id: newHypernymEntry.id,
        type: 'hypernym'
      }
    },
    create: {
      source_id: entry.id,
      target_id: newHypernymEntry.id,
      type: 'hypernym'
    },
    update: {}
  });

  // 3. For hyponyms that stay: change their hypernym relation from entry to oldHypernym
  if (oldHypernym && hyponymsToStay.length > 0) {
    const oldHypernymEntry = await prisma.verbs.findUnique({
      where: { code: oldHypernym } as unknown as Prisma.verbsWhereUniqueInput,
      select: { id: true }
    });

    if (oldHypernymEntry) {
      for (const hyponymCode of hyponymsToStay) {
        const hyponymEntry = await prisma.verbs.findUnique({
          where: { code: hyponymCode } as unknown as Prisma.verbsWhereUniqueInput,
          select: { id: true }
        });

        if (hyponymEntry) {
          // Delete relation: hyponym -> entry
          await prisma.verb_relations.deleteMany({
            where: {
              source_id: hyponymEntry.id,
              target_id: entry.id,
              type: 'hypernym'
            }
          });

          // Create relation: hyponym -> oldHypernym
          await prisma.verb_relations.upsert({
            where: {
              source_id_type_target_id: {
                source_id: hyponymEntry.id,
                target_id: oldHypernymEntry.id,
                type: 'hypernym'
              }
            },
            create: {
              source_id: hyponymEntry.id,
              target_id: oldHypernymEntry.id,
              type: 'hypernym'
            },
            update: {}
          });
        }
      }
    }
  }

  // 4. Hyponyms that move keep their relation to entry (no change needed)

  // Invalidate all caches since we've updated relations
  revalidateAllEntryCaches();

  return NextResponse.json({ 
    success: true,
    message: `Updated hypernym to ${newHypernym}. ${hyponymsToMove.length} hyponyms moved, ${hyponymsToStay.length} stayed.`
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
  });
}

// POST /api/relations - Create a new relation or handle complex relation operations
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Handle change_hypernym action
    if (body.action === 'change_hypernym') {
      return handleChangeHypernym(body as ChangeHypernymRequest);
    }
    
    // Regular relation creation
    const relationBody = body as RelationRequest;
    
    // Validate required fields
    if (!relationBody.sourceId || !relationBody.targetId || !relationBody.type) {
      return NextResponse.json(
        { error: 'Missing required fields: sourceId, targetId, type' },
        { status: 400 }
      )
    }
    
    // Validate relation type
    const validTypes: RelationType[] = ['also_see', 'causes', 'entails', 'hypernym', 'hyponym']
    if (!validTypes.includes(relationBody.type)) {
      return NextResponse.json(
        { error: `Invalid relation type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }
    
    // Prevent self-relations
    if (relationBody.sourceId === relationBody.targetId) {
      return NextResponse.json(
        { error: 'Cannot create relation between entry and itself' },
        { status: 400 }
      )
    }
    
    // Convert codes to numeric IDs
    const sourceEntry = await prisma.verbs.findUnique({
      where: { code: relationBody.sourceId } as unknown as Prisma.verbsWhereUniqueInput,
      select: { id: true }
    })
    
    const targetEntry = await prisma.verbs.findUnique({
      where: { code: relationBody.targetId } as unknown as Prisma.verbsWhereUniqueInput,
      select: { id: true }
    })
    
    if (!sourceEntry || !targetEntry) {
      return NextResponse.json(
        { error: 'One or both entries do not exist' },
        { status: 400 }
      )
    }
    
    const relation = await prisma.verb_relations.create({
      data: {
        source_id: sourceEntry.id,
        target_id: targetEntry.id,
        type: relationBody.type
      }
    })
    
    return NextResponse.json(relation, { 
      status: 201,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    })
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
    
    // Convert codes to numeric IDs
    const sourceEntry = await prisma.verbs.findUnique({
      where: { code: body.sourceId } as unknown as Prisma.verbsWhereUniqueInput,
      select: { id: true }
    })
    
    const targetEntry = await prisma.verbs.findUnique({
      where: { code: body.targetId } as unknown as Prisma.verbsWhereUniqueInput,
      select: { id: true }
    })
    
    if (!sourceEntry || !targetEntry) {
      return NextResponse.json(
        { error: 'One or both entries do not exist' },
        { status: 404 }
      )
    }
    
    await prisma.verb_relations.delete({
      where: {
        source_id_type_target_id: {
          source_id: sourceEntry.id,
          target_id: targetEntry.id,
          type: body.type
        }
      }
    })
    
    return NextResponse.json({ success: true }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    })
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
