import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const frameId = BigInt(idParam);
    const body = await request.json();
    
    const { roles } = body;

    if (!Array.isArray(roles)) {
      return NextResponse.json(
        { error: 'roles must be an array' },
        { status: 400 }
      );
    }

    // Check if frame exists
    const existingFrame = await prisma.frames.findUnique({
      where: { id: frameId },
    });

    if (!existingFrame) {
      return NextResponse.json(
        { error: 'Frame not found' },
        { status: 404 }
      );
    }

    // Delete all existing frame_roles for this frame
    await prisma.frame_roles.deleteMany({
      where: { frame_id: frameId },
    });

    // Create new frame_roles
    const createdRoles = [];
    for (const role of roles) {
      const { roleType, description, notes, main, examples } = role;

      // Find role_type by label
      const roleType_record = await prisma.role_types.findUnique({
        where: { label: roleType },
      });

      if (!roleType_record) {
        return NextResponse.json(
          { error: `Role type not found: ${roleType}` },
          { status: 400 }
        );
      }

      // Create the frame_role
      const createdRole = await prisma.frame_roles.create({
        data: {
          frame_id: frameId,
          role_type_id: roleType_record.id,
          description: description || null,
          notes: notes || null,
          main: main ?? false,
          examples: examples || [],
        },
        include: {
          role_types: true,
        },
      });

      createdRoles.push(createdRole);
    }

    // Serialize BigInt fields
    const serialized = createdRoles.map(role => ({
      ...role,
      id: role.id.toString(),
      frame_id: role.frame_id.toString(),
      role_type_id: role.role_type_id.toString(),
      role_types: {
        ...role.role_types,
        id: role.role_types.id.toString(),
      },
    }));

    return NextResponse.json(serialized);
  } catch (error) {
    console.error('[API] Error updating frame roles:', error);
    return NextResponse.json(
      { error: 'Failed to update frame roles' },
      { status: 500 }
    );
  }
}

