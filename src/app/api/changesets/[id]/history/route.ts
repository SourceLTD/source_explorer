/**
 * API Route: /api/changesets/[id]/history
 *
 * GET — Retrieve the alternative group for a changeset: all coexisting
 * candidate changesets ("alternatives") for the logical change, plus which
 * one is currently selected. Replaces the old linear revision-chain walk.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAlternativeGroupForChangeset } from '@/lib/version-control/alternatives';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const changesetId = BigInt(id);

    const group = await getAlternativeGroupForChangeset(changesetId);

    if (!group) {
      return NextResponse.json(
        { error: 'Changeset not found' },
        { status: 404 },
      );
    }

    return NextResponse.json(group);
  } catch (error) {
    console.error('[API] Error fetching alternative group:', error);
    return NextResponse.json(
      { error: 'Failed to fetch alternatives' },
      { status: 500 },
    );
  }
}
