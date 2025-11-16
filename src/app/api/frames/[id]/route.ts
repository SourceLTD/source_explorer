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
        ...role,
        id: role.id.toString(),
        frame_id: role.frame_id.toString(),
        role_type_id: role.role_type_id.toString(),
        role_types: {
          ...role.role_types,
          id: role.role_types.id.toString(),
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

