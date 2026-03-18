import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { updateFlagStatus } from '@/lib/db';
import { stageUpdate, stageDelete, getPendingInfoForEntity } from '@/lib/version-control';
import { getCurrentUserName } from '@/utils/supabase/server';
import { applyFrameRolesSubChanges, type NormalizedFrameRole } from '@/lib/version-control/frameRolesSubfields';

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
        frame_roles: true,
        frame_lexical_units: {
          where: { lexical_units: { deleted: false } },
          include: {
            lexical_units: {
              select: {
                id: true,
                code: true,
                gloss: true,
                lemmas: true,
                pos: true,
              },
            },
          },
          take: 100,
        },
        // Include parent super frame info with its roles (for regular frames to show inherited roles)
        frames: {
          select: {
            id: true,
            label: true,
            code: true,
            frame_roles: true,
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
      fillers: role.fillers,
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
      lexical_units: (frame as any).frame_lexical_units.map((flu: any) => ({
        ...flu.lexical_units,
        id: flu.lexical_units.id.toString(),
      })),
    };
    // Remove the raw frames relation from the response
    delete (serialized as any).frames;

    // Attach & apply pending changes so the edit overlay can immediately reflect staged updates
    const pendingInfo = await getPendingInfoForEntity('frame', id);
    if (!pendingInfo) {
      return NextResponse.json(
        { ...serialized, pending: null },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
          },
        }
      );
    }

    const serializedWithPending: any = { ...serialized, pending: pendingInfo };
    const pendingFrameRoleSubChanges: Array<{ field_name: string; new_value: unknown }> = [];

    // Apply pending/approved values onto the response shape
    for (const [fieldName, pendingField] of Object.entries(pendingInfo.pending_fields)) {
      if (pendingField.status !== 'pending' && pendingField.status !== 'approved') continue;

      if (fieldName === 'frame_roles') {
        const newValue = pendingField.new_value;
        if (!Array.isArray(newValue)) continue;

        serializedWithPending.frame_roles = newValue.map((r: unknown, index: number) => {
          const obj = (r && typeof r === 'object') ? (r as any) : {};
          return {
            id: typeof obj.id === 'string' ? obj.id : `pending-role-${index}`,
            description: typeof obj.description === 'string' ? obj.description : null,
            notes: typeof obj.notes === 'string' ? obj.notes : null,
            main: typeof obj.main === 'boolean' ? obj.main : null,
            examples: Array.isArray(obj.examples) ? obj.examples : [],
            label: typeof obj.label === 'string' ? obj.label : null,
            fillers: obj.fillers ?? null,
          };
        });

        continue;
      }
      
      if (fieldName.startsWith('frame_roles.')) {
        pendingFrameRoleSubChanges.push({ field_name: fieldName, new_value: pendingField.new_value });
        continue;
      }

      // Scalar fields: apply directly (e.g., label, definition, short_definition, super_frame_id, verifiable, etc.)
      (serializedWithPending as any)[fieldName] = pendingField.new_value;
    }

    if (pendingFrameRoleSubChanges.length > 0) {
      const baseRoles: NormalizedFrameRole[] = Array.isArray(serializedWithPending.frame_roles)
        ? serializedWithPending.frame_roles
            .map((r: any) => {
              const label: string = typeof r?.label === 'string' ? r.label : '';
              if (!label) return null;
              return {
                roleType: label,
                description: typeof r.description === 'string' ? r.description : null,
                notes: typeof r.notes === 'string' ? r.notes : null,
                main: typeof r.main === 'boolean' ? r.main : Boolean(r.main),
                examples: Array.isArray(r.examples) ? r.examples.filter((x: unknown): x is string => typeof x === 'string') : [],
                label: typeof r.label === 'string' ? r.label : null,
              };
            })
            .filter((x: unknown): x is NormalizedFrameRole => Boolean(x))
        : [];

      const patched = applyFrameRolesSubChanges(baseRoles, pendingFrameRoleSubChanges);

      serializedWithPending.frame_roles = patched.map((r, index) => {
        const existing = Array.isArray(serializedWithPending.frame_roles)
          ? serializedWithPending.frame_roles.find((er: any) => er?.label === r.roleType)
          : null;
        return {
          id: existing && typeof existing.id === 'string' ? existing.id : `pending-role-${index}`,
          description: r.description,
          notes: r.notes,
          main: r.main,
          examples: r.examples,
          label: r.label ?? r.roleType,
          fillers: existing?.fillers ?? null,
        };
      });
    }

    return NextResponse.json(serializedWithPending, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
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
    
    const flagUpdates: Record<string, any> = {};
    if (body.flagged !== undefined) flagUpdates.flagged = body.flagged;
    if (body.flaggedReason !== undefined) flagUpdates.flaggedReason = body.flaggedReason;
    
    if (body.verifiable !== undefined) updateData.verifiable = body.verifiable;
    if (body.unverifiableReason !== undefined) updateData.unverifiable_reason = body.unverifiableReason;
    if (body.frame_type !== undefined) updateData.frame_type = body.frame_type;
    if (body.vendler !== undefined) updateData.vendler = body.vendler;
    if (body.multi_perspective !== undefined) updateData.multi_perspective = body.multi_perspective;
    if (body.wikidata_id !== undefined) updateData.wikidata_id = body.wikidata_id;
    if (body.recipe !== undefined) updateData.recipe = body.recipe;

    if (Object.keys(updateData).length === 0 && Object.keys(flagUpdates).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    if (Object.keys(flagUpdates).length > 0) {
      await updateFlagStatus([idParam], flagUpdates);
      
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
