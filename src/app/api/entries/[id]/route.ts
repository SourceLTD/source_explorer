import { NextRequest, NextResponse } from 'next/server';
import { getEntryById } from '@/lib/db';
import { handleDatabaseError } from '@/lib/db-utils';
import { stageUpdate, stageDelete, stageRolesUpdate } from '@/lib/version-control';
import { getCurrentUserName } from '@/utils/supabase/server';

// Force dynamic rendering - no static optimization
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const entry = await getEntryById(id);
    
    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    return NextResponse.json(entry);
  } catch (error) {
    const { message, status, shouldRetry } = handleDatabaseError(error, 'GET /api/entries/[id]');
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

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const updates = await request.json();
    
    // Validate that only allowed fields are being updated
    const allowedFields = ['id', 'gloss', 'lemmas', 'src_lemmas', 'examples', 'roles', 'role_groups', 'vendler_class', 'lexfile', 'frame_id'];
    const updateData: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateData[key] = value;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Check if this is a roles update
    const hasRoles = 'roles' in updateData;
    const hasRoleGroups = 'role_groups' in updateData;
    
    // Separate roles from other fields
    const { roles, role_groups, ...otherFields } = updateData;

    const userId = await getCurrentUserName();

    // Stage roles update if present
    if (hasRoles || hasRoleGroups) {
      const rolesResponse = await stageRolesUpdate(
        id,
        roles as unknown[] ?? [],
        hasRoleGroups ? role_groups as unknown[] : undefined,
        userId
      );

      // If only roles are being updated, return the roles response
      if (Object.keys(otherFields).length === 0) {
        return NextResponse.json(rolesResponse, {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
          },
        });
      }
    }

    // Stage other field updates
    if (Object.keys(otherFields).length > 0) {
      const response = await stageUpdate('verb', id, otherFields, userId);
      
      return NextResponse.json(response, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
        },
      });
    }

    // If we got here with roles, return a combined response
    return NextResponse.json({
      staged: true,
      message: 'Changes staged for review',
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    const { message, status, shouldRetry } = handleDatabaseError(error, 'PATCH /api/entries/[id]');
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

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const userId = await getCurrentUserName();
    
    const response = await stageDelete('verb', id, userId);

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    const { message, status, shouldRetry } = handleDatabaseError(error, `DELETE /api/entries/${id}`);
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
