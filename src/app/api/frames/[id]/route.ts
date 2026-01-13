import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { updateModerationStatus } from '@/lib/db';
import { stageUpdate, stageDelete } from '@/lib/version-control';
import { getCurrentUserName } from '@/utils/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const id = BigInt(idParam);

    const frame = await (prisma.frames as any).findUnique({
      where: { id },
      include: {
        frame_roles: {
          include: {
            role_types: true,
          },
        },
        lexical_units: {
          where: {
            deleted: false,
          },
          select: {
            id: true,
            code: true,
            gloss: true,
            lemmas: true,
            pos: true,
          },
          take: 100,
        },
        // Include parent super frame info with its roles (for regular frames to show inherited roles)
        frames: {
          select: {
            id: true,
            label: true,
            code: true,
            frame_roles: {
              include: {
                role_types: true,
              },
            },
          },
        },
      },
    });

    if (!frame) {
      return NextResponse.json(
        { error: 'Frame not found' },
        { status: 404 }
      );
    }

    // Helper to serialize roles
    const serializeRoles = (roles: any[]) => roles.map((role: any) => ({
      id: role.id.toString(),
      description: role.description,
      notes: role.notes,
      main: role.main,
      examples: role.examples,
      label: role.label,
      role_type: {
        id: role.role_types.id.toString(),
        code: role.role_types.code,
        label: role.role_types.label,
        generic_description: role.role_types.generic_description,
        explanation: role.role_types.explanation,
      },
    }));

    // For regular frames, use parent's roles; for super frames, use own roles
    const isRegularFrame = frame.super_frame_id !== null;
    const rolesToUse = isRegularFrame && frame.frames?.frame_roles 
      ? frame.frames.frame_roles 
      : frame.frame_roles;

    const serialized = {
      ...frame,
      id: frame.id.toString(),
      super_frame_id: frame.super_frame_id?.toString() ?? null,
      super_frame: frame.frames ? {
        id: frame.frames.id.toString(),
        label: frame.frames.label,
        code: frame.frames.code,
      } : null,
      frame_roles: serializeRoles(rolesToUse || []),
      lexical_units: (frame as any).lexical_units.map((lu: any) => ({
        ...lu,
        id: lu.id.toString(),
      })),
    };
    // Remove the raw frames relation from the response
    delete (serialized as any).frames;

    return NextResponse.json(serialized);
  } catch (error) {
    console.error('[API] Error fetching frame:', error);
    return NextResponse.json(
      { error: 'Failed to fetch frame' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    
    if (body.label !== undefined) updateData.label = body.label;
    if (body.definition !== undefined) updateData.definition = body.definition;
    if (body.short_definition !== undefined) updateData.short_definition = body.short_definition;
    if (body.super_frame_id !== undefined) updateData.super_frame_id = body.super_frame_id;
    
    const moderationUpdates: Record<string, any> = {};
    if (body.flagged !== undefined) moderationUpdates.flagged = body.flagged;
    if (body.flaggedReason !== undefined) moderationUpdates.flaggedReason = body.flaggedReason;
    
    if (body.verifiable !== undefined) updateData.verifiable = body.verifiable;
    if (body.unverifiableReason !== undefined) updateData.unverifiable_reason = body.unverifiableReason;

    if (Object.keys(updateData).length === 0 && Object.keys(moderationUpdates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    if (Object.keys(moderationUpdates).length > 0) {
      await updateModerationStatus([idParam], moderationUpdates);
      
      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ 
          success: true, 
          message: 'Flagging status updated successfully' 
        });
      }
    }

    const userId = await getCurrentUserName();
    const response = await stageUpdate('frame', idParam, updateData, userId);

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[API] Error staging frame update:', error);
    return NextResponse.json(
      { error: 'Failed to stage frame update' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const userId = await getCurrentUserName();
    const response = await stageDelete('frame', idParam, userId);

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[API] Error staging frame delete:', error);
    return NextResponse.json(
      { error: 'Failed to stage frame deletion' },
      { status: 500 }
    );
  }
}
