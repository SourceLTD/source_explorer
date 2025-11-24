import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const id = BigInt(idParam);

    const frame = await prisma.frames.findUnique({
      where: { id },
      include: {
        frame_roles: {
          include: {
            role_types: true,
          },
        },
        verbs: {
          where: {
            deleted: false,
          },
          select: {
            id: true,
            code: true,
            gloss: true,
            lemmas: true,
          },
          take: 100,
        },
      },
    });

    if (!frame) {
      return NextResponse.json(
        { error: 'Frame not found' },
        { status: 404 }
      );
    }

    // Serialize BigInt fields
    const serialized = {
      ...frame,
      id: frame.id.toString(),
      frame_roles: frame.frame_roles.map(role => ({
        id: role.id.toString(),
        description: role.description,
        notes: role.notes,
        main: role.main,
        examples: role.examples,
        role_type: {
          id: role.role_types.id.toString(),
          code: role.role_types.code,
          label: role.role_types.label,
          generic_description: role.role_types.generic_description,
          explanation: role.role_types.explanation,
        },
      })),
      verbs: frame.verbs.map(verb => ({
        ...verb,
        id: verb.id.toString(),
      })),
    };

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
    const id = BigInt(idParam);
    const body = await request.json();

    // Build update object dynamically based on provided fields
    const updateData: Record<string, unknown> = {};
    
    // Handle frame fields
    if (body.frame_name !== undefined) updateData.frame_name = body.frame_name;
    if (body.definition !== undefined) updateData.definition = body.definition;
    if (body.short_definition !== undefined) updateData.short_definition = body.short_definition;
    if (body.prototypical_synset !== undefined) updateData.prototypical_synset = body.prototypical_synset;
    if (body.is_supporting_frame !== undefined) updateData.is_supporting_frame = body.is_supporting_frame;
    if (body.communication !== undefined) updateData.communication = body.communication;
    if (body.code !== undefined) updateData.code = body.code;
    
    // Handle moderation fields
    if (body.flagged !== undefined) updateData.flagged = body.flagged;
    if (body.flaggedReason !== undefined) updateData.flagged_reason = body.flaggedReason;
    if (body.forbidden !== undefined) updateData.forbidden = body.forbidden;
    if (body.forbiddenReason !== undefined) updateData.forbidden_reason = body.forbiddenReason;
    
    // Update timestamp
    updateData.updated_at = new Date();

    // Check if frame exists
    const existingFrame = await prisma.frames.findUnique({
      where: { id },
    });

    if (!existingFrame) {
      return NextResponse.json(
        { error: 'Frame not found' },
        { status: 404 }
      );
    }

    // Update the frame
    const updatedFrame = await prisma.frames.update({
      where: { id },
      data: updateData,
      include: {
        frame_roles: {
          include: {
            role_types: true,
          },
        },
      },
    });

    // Serialize BigInt fields
    const serialized = {
      ...updatedFrame,
      id: updatedFrame.id.toString(),
      frame_roles: updatedFrame.frame_roles.map(role => ({
        id: role.id.toString(),
        description: role.description,
        notes: role.notes,
        main: role.main,
        examples: role.examples,
        role_type: {
          id: role.role_types.id.toString(),
          code: role.role_types.code,
          label: role.role_types.label,
          generic_description: role.role_types.generic_description,
          explanation: role.role_types.explanation,
        },
      })),
    };

    return NextResponse.json(serialized);
  } catch (error) {
    console.error('[API] Error updating frame:', error);
    return NextResponse.json(
      { error: 'Failed to update frame' },
      { status: 500 }
    );
  }
}

