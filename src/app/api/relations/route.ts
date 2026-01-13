import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { revalidateAllEntryCaches } from '@/lib/db'
import type { lexical_unit_relation_type, Prisma } from '@prisma/client'

// Force dynamic rendering
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RelationRequest {
  sourceId: string  // code
  targetId: string  // code
  type: lexical_unit_relation_type
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
  const entry = await prisma.lexical_units.findFirst({
    where: { 
      code: entryId,
      deleted: false
    },
    select: { id: true }
  });

  if (!entry) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  }

  const newHypernymEntry = await prisma.lexical_units.findFirst({
    where: { 
      code: newHypernym,
      deleted: false
    },
    select: { id: true }
  });

  if (!newHypernymEntry) {
    return NextResponse.json({ error: 'New hypernym not found' }, { status: 404 });
  }

  // 1. Delete old hypernym relation (entry -> oldHypernym)
  if (oldHypernym) {
    const oldHypernymEntry = await prisma.lexical_units.findFirst({
      where: { 
        code: oldHypernym,
        deleted: false
      },
      select: { id: true }
    });

    if (oldHypernymEntry) {
      await prisma.lexical_unit_relations.deleteMany({
        where: {
          source_id: entry.id,
          target_id: oldHypernymEntry.id,
          type: 'hypernym'
        }
      });
    }
  }

  // 2. Create new hypernym relation (entry -> newHypernym)
  await prisma.lexical_unit_relations.upsert({
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
    const oldHypernymEntry = await prisma.lexical_units.findFirst({
      where: { 
        code: oldHypernym,
        deleted: false
      },
      select: { id: true }
    });

    if (oldHypernymEntry) {
      for (const hyponymCode of hyponymsToStay) {
        const hyponymEntry = await prisma.lexical_units.findFirst({
          where: { 
            code: hyponymCode,
            deleted: false
          },
          select: { id: true }
        });

        if (hyponymEntry) {
          // Delete relation: hyponym -> entry
          await prisma.lexical_unit_relations.deleteMany({
            where: {
              source_id: hyponymEntry.id,
              target_id: entry.id,
              type: 'hypernym'
            }
          });

          // Create relation: hyponym -> oldHypernym
          await prisma.lexical_unit_relations.upsert({
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (body.action === 'change_hypernym') {
      return handleChangeHypernym(body as ChangeHypernymRequest);
    }
    
    const relationBody = body as RelationRequest;
    
    if (!relationBody.sourceId || !relationBody.targetId || !relationBody.type) {
      return NextResponse.json(
        { error: 'Missing required fields: sourceId, targetId, type' },
        { status: 400 }
      )
    }
    
    if (relationBody.sourceId === relationBody.targetId) {
      return NextResponse.json(
        { error: 'Cannot create relation between entry and itself' },
        { status: 400 }
      )
    }
    
    // Convert codes to numeric IDs
    const sourceEntry = await prisma.lexical_units.findFirst({
      where: { code: relationBody.sourceId, deleted: false },
      select: { id: true }
    })
    
    const targetEntry = await prisma.lexical_units.findFirst({
      where: { code: relationBody.targetId, deleted: false },
      select: { id: true }
    })
    
    if (!sourceEntry || !targetEntry) {
      return NextResponse.json(
        { error: 'One or both entries do not exist' },
        { status: 400 }
      )
    }
    
    const relation = await prisma.lexical_unit_relations.create({
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
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json({ error: 'This relation already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body: RelationRequest = await request.json()
    
    if (!body.sourceId || !body.targetId || !body.type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    
    const sourceEntry = await prisma.lexical_units.findFirst({
      where: { code: body.sourceId, deleted: false },
      select: { id: true }
    })
    
    const targetEntry = await prisma.lexical_units.findFirst({
      where: { code: body.targetId, deleted: false },
      select: { id: true }
    })
    
    if (!sourceEntry || !targetEntry) {
      return NextResponse.json({ error: 'Entries not found' }, { status: 404 })
    }
    
    await prisma.lexical_unit_relations.delete({
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
