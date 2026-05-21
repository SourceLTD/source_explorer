import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/frame-role-mappings?parent_id=...&child_id=...
 *
 * Returns the role mappings from a parent frame to a child frame along
 * a parent-of edge. One row per parent role, describing the fate of that
 * parent role in the child (identical, renamed, merged, incorporated,
 * absorbed, or dropped).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parentIdParam = searchParams.get('parent_id');
    const childIdParam = searchParams.get('child_id');

    if (!parentIdParam || !childIdParam) {
      return NextResponse.json(
        { error: 'Missing required query params: parent_id and child_id' },
        { status: 400 }
      );
    }

    const parentId = Number(parentIdParam);
    const childId = Number(childIdParam);

    if (!Number.isFinite(parentId) || !Number.isFinite(childId)) {
      return NextResponse.json(
        { error: 'parent_id and child_id must be numeric' },
        { status: 400 }
      );
    }

    const [parentFrame, childFrame, mappings] = await Promise.all([
      prisma.frames.findUnique({
        where: { id: BigInt(parentId) },
        select: { id: true, label: true },
      }),
      prisma.frames.findUnique({
        where: { id: BigInt(childId) },
        select: { id: true, label: true },
      }),
      prisma.frame_role_mappings.findMany({
        where: {
          parent_frame_id: parentId,
          child_frame_id: childId,
        },
        orderBy: [
          { parent_role_label: 'asc' },
          { created_at: 'desc' },
        ],
      }),
    ]);

    if (!parentFrame || !childFrame) {
      return NextResponse.json(
        { error: 'Parent or child frame not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      parent: {
        id: parentFrame.id.toString(),
        label: parentFrame.label,
      },
      child: {
        id: childFrame.id.toString(),
        label: childFrame.label,
      },
      mappings: mappings.map(m => ({
        id: m.id.toString(),
        parent_role_label: m.parent_role_label,
        child_role_label: m.child_role_label,
        is_absorbed: m.is_absorbed,
        incorporated_value: m.incorporated_value,
        model: m.model,
        run_id: m.run_id,
        created_at: m.created_at.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[API] Error fetching frame role mappings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch frame role mappings' },
      { status: 500 }
    );
  }
}
