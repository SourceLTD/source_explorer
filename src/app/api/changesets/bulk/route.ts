/**
 * API Route: /api/changesets/bulk
 * 
 * POST - Bulk operations on multiple changesets by IDs:
 *   - approve_and_commit: Approve all fields and commit
 *   - reject: Reject all fields (or discard for CREATE/DELETE)
 *   - discard: Discard changesets entirely
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  bulkApproveAndCommit,
  bulkReject,
  bulkDiscard,
} from '@/lib/version-control';
import { getCurrentUserName } from '@/utils/supabase/server';
import { emitChangesetStatusEvents } from '@/lib/issues/events';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, action } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'ids must be a non-empty array of changeset IDs' },
        { status: 400 }
      );
    }

    if (!action || !['approve_and_commit', 'reject', 'discard'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "approve_and_commit", "reject", or "discard"' },
        { status: 400 }
      );
    }

    const userId = await getCurrentUserName();
    const changesetIds = ids.map((id: string) => BigInt(id));

    let result;
    switch (action) {
      case 'approve_and_commit':
        result = await bulkApproveAndCommit(changesetIds, userId);
        break;
      case 'reject':
        result = await bulkReject(changesetIds, userId);
        break;
      case 'discard':
        result = await bulkDiscard(changesetIds);
        break;
    }

    // Return 409 Conflict if there was a conflict
    if (result?.conflict) {
      return NextResponse.json(result, { status: 409 });
    }

    // Emit timeline events for any changesets that were linked to issues.
    // For `reject` and `discard` we treat both as "discarded" from the
    // issue's perspective; the underlying changeset row is kept but moved
    // out of `pending`.
    //
    // NOTE: emitChangesetStatusEvents reads the changesets' current
    // `issue_id`, which is still set after commit/discard (we never null
    // the link), so it correctly surfaces the event on the issue.
    if (action === 'approve_and_commit') {
      void emitChangesetStatusEvents({
        actor: userId,
        changesetIds,
        eventType: 'changeset_committed',
      });
    } else if (action === 'reject' || action === 'discard') {
      void emitChangesetStatusEvents({
        actor: userId,
        changesetIds,
        eventType: 'changeset_discarded',
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error performing bulk operation:', error);
    return NextResponse.json(
      { error: 'Failed to perform bulk operation' },
      { status: 500 }
    );
  }
}

