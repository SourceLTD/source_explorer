/**
 * API Route: /api/changesets
 * 
 * GET - List changesets with optional filters
 * POST - Create a new changeset
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { 
  createChangesetFromUpdate,
  createChangesetFromCreate,
  createChangesetFromDelete,
  EntityType,
} from '@/lib/version-control';

// GET /api/changesets - List changesets
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const status = searchParams.get('status') as 'pending' | 'committed' | 'discarded' | null;
    const entity_type = searchParams.get('entity_type') as EntityType | null;
    const entity_id = searchParams.get('entity_id');
    const changegroup_id = searchParams.get('changegroup_id');
    const created_by = searchParams.get('created_by');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const page_size = parseInt(searchParams.get('page_size') || '20', 10);

    // Build where clause
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (entity_type) where.entity_type = entity_type;
    if (entity_id) where.entity_id = BigInt(entity_id);
    if (changegroup_id) where.changegroup_id = BigInt(changegroup_id);
    if (created_by) where.created_by = created_by;

    // Get total count
    const total = await prisma.changesets.count({ where });

    // Get changesets with pagination
    const changesets = await prisma.changesets.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * page_size,
      take: page_size,
      include: {
        field_changes: true,
      },
    });

    return NextResponse.json({
      data: changesets.map(cs => ({
        ...cs,
        id: cs.id.toString(),
        changegroup_id: cs.changegroup_id?.toString() ?? null,
        entity_id: cs.entity_id?.toString() ?? null,
        field_changes: cs.field_changes.map(fc => ({
          ...fc,
          id: fc.id.toString(),
          changeset_id: fc.changeset_id.toString(),
        })),
      })),
      total,
      page,
      page_size,
      total_pages: Math.ceil(total / page_size),
    });
  } catch (error) {
    console.error('Error listing changesets:', error);
    return NextResponse.json(
      { error: 'Failed to list changesets' },
      { status: 500 }
    );
  }
}

// POST /api/changesets - Create a new changeset
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { 
      entity_type, 
      entity_id, 
      operation, 
      updates,
      entity_data,
      current_entity,
      created_by,
      changegroup_id,
      comment,
    } = body;

    if (!entity_type || !operation || !created_by) {
      return NextResponse.json(
        { error: 'entity_type, operation, and created_by are required' },
        { status: 400 }
      );
    }

    let changeset;

    switch (operation) {
      case 'update':
        if (!entity_id || !updates || !current_entity) {
          return NextResponse.json(
            { error: 'entity_id, updates, and current_entity are required for update operation' },
            { status: 400 }
          );
        }
        changeset = await createChangesetFromUpdate(
          entity_type,
          BigInt(entity_id),
          current_entity,
          updates,
          created_by,
          changegroup_id ? BigInt(changegroup_id) : undefined,
        );
        break;

      case 'create':
        if (!entity_data) {
          return NextResponse.json(
            { error: 'entity_data is required for create operation' },
            { status: 400 }
          );
        }
        changeset = await createChangesetFromCreate(
          entity_type,
          entity_data,
          created_by,
          changegroup_id ? BigInt(changegroup_id) : undefined,
        );
        break;

      case 'delete':
        if (!entity_id || !current_entity) {
          return NextResponse.json(
            { error: 'entity_id and current_entity are required for delete operation' },
            { status: 400 }
          );
        }
        changeset = await createChangesetFromDelete(
          entity_type,
          BigInt(entity_id),
          current_entity,
          created_by,
          changegroup_id ? BigInt(changegroup_id) : undefined,
        );
        break;

      default:
        return NextResponse.json(
          { error: 'operation must be "create", "update", or "delete"' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      ...changeset,
      id: changeset.id.toString(),
      changegroup_id: changeset.changegroup_id?.toString() ?? null,
      entity_id: changeset.entity_id?.toString() ?? null,
      field_changes: changeset.field_changes.map(fc => ({
        ...fc,
        id: fc.id.toString(),
        changeset_id: fc.changeset_id.toString(),
      })),
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating changeset:', error);
    return NextResponse.json(
      { error: 'Failed to create changeset' },
      { status: 500 }
    );
  }
}

