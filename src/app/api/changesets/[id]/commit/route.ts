/**
 * API Route: /api/changesets/[id]/commit
 * 
 * POST - Commit a single changeset
 * 
 * NOTE: This endpoint should be restricted to admin users only.
 * The caller should verify admin permissions before calling.
 */

import { NextRequest, NextResponse } from 'next/server';
import { commitChangeset } from '@/lib/version-control';
import { getCurrentUserName } from '@/utils/supabase/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/changesets/[id]/commit - Commit the changeset
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const changesetId = BigInt(id);
    
    const userId = await getCurrentUserName();

    // TODO: Add admin check here
    // const isAdmin = await checkIsAdmin(userId);
    // if (!isAdmin) {
    //   return NextResponse.json(
    //     { error: 'Only admin users can commit changes' },
    //     { status: 403 }
    //   );
    // }

    const result = await commitChangeset(changesetId, userId);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        committed_count: result.committed_count,
        skipped_count: result.skipped_count,
        errors: result.errors.map(e => ({
          ...e,
          changeset_id: e.changeset_id.toString(),
          entity_id: e.entity_id?.toString() ?? null,
        })),
      }, { status: 409 }); // Conflict
    }

    return NextResponse.json({
      success: true,
      committed_count: result.committed_count,
      skipped_count: result.skipped_count,
      errors: [],
    });
  } catch (error) {
    console.error('Error committing changeset:', error);
    return NextResponse.json(
      { error: 'Failed to commit changeset' },
      { status: 500 }
    );
  }
}

