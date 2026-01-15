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
        // Pending frame_roles are stored in the client payload shape (roleType, etc).
        // Convert them back into the API response shape with nested role_type.
        const newValue = pendingField.new_value;
        if (!Array.isArray(newValue)) continue;

        const roleTypeLabels = Array.from(new Set(
          newValue
            .map((r: unknown) => {
              if (!r || typeof r !== 'object') return null;
              const obj = r as any;
              if (typeof obj.roleType === 'string') return obj.roleType;
              if (typeof obj.role_type_label === 'string') return obj.role_type_label;
              if (obj.role_type && typeof obj.role_type === 'object' && typeof obj.role_type.label === 'string') return obj.role_type.label;
              return null;
            })
            .filter((v: unknown): v is string => typeof v === 'string' && v.length > 0)
        ));

        const roleTypes = roleTypeLabels.length > 0
          ? await prisma.role_types.findMany({
              where: { label: { in: roleTypeLabels } },
            })
          : [];

        const roleTypeByLabel = new Map(roleTypes.map(rt => [rt.label, rt]));

        serializedWithPending.frame_roles = newValue.map((r: unknown, index: number) => {
          const obj = (r && typeof r === 'object') ? (r as any) : {};

          const roleTypeLabel: string =
            typeof obj.roleType === 'string' ? obj.roleType :
            typeof obj.role_type_label === 'string' ? obj.role_type_label :
            (obj.role_type && typeof obj.role_type === 'object' && typeof obj.role_type.label === 'string') ? obj.role_type.label :
            '';

          const rt = roleTypeByLabel.get(roleTypeLabel);
          const role_type = rt ? {
            id: rt.id.toString(),
            code: rt.code,
            label: rt.label,
            generic_description: rt.generic_description,
            explanation: rt.explanation,
          } : {
            id: '',
            code: undefined,
            label: roleTypeLabel || 'Unknown',
            generic_description: '',
            explanation: null,
          };

          return {
            id: typeof obj.id === 'string' ? obj.id : `pending-role-${index}`,
            description: typeof obj.description === 'string' ? obj.description : null,
            notes: typeof obj.notes === 'string' ? obj.notes : null,
            main: typeof obj.main === 'boolean' ? obj.main : null,
            examples: Array.isArray(obj.examples) ? obj.examples : [],
            label: typeof obj.label === 'string' ? obj.label : null,
            role_type,
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
              const roleType: string =
                typeof r?.role_type?.label === 'string' ? r.role_type.label :
                typeof r?.roleType === 'string' ? r.roleType :
                typeof r?.role_type_label === 'string' ? r.role_type_label :
                '';
              if (!roleType) return null;
              return {
                roleType,
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

      const roleTypeLabels = Array.from(new Set(patched.map(r => r.roleType)));
      const roleTypes = roleTypeLabels.length > 0
        ? await prisma.role_types.findMany({ where: { label: { in: roleTypeLabels } } })
        : [];
      const roleTypeByLabel = new Map(roleTypes.map(rt => [rt.label, rt]));

      const existingByRoleTypeLabel = new Map<string, any>();
      if (Array.isArray(serializedWithPending.frame_roles)) {
        for (const r of serializedWithPending.frame_roles) {
          const lbl = typeof r?.role_type?.label === 'string' ? r.role_type.label : '';
          if (lbl) existingByRoleTypeLabel.set(lbl, r);
        }
      }

      serializedWithPending.frame_roles = patched.map((r, index) => {
        const existing = existingByRoleTypeLabel.get(r.roleType);
        const rt = roleTypeByLabel.get(r.roleType);
        const role_type = rt ? {
          id: rt.id.toString(),
          code: rt.code,
          label: rt.label,
          generic_description: rt.generic_description,
          explanation: rt.explanation,
        } : {
          id: '',
          code: undefined,
          label: r.roleType || 'Unknown',
          generic_description: '',
          explanation: null,
        };

        return {
          id: existing && typeof existing.id === 'string' ? existing.id : `pending-role-${index}`,
          description: r.description,
          notes: r.notes,
          main: r.main,
          examples: r.examples,
          label: r.label,
          role_type,
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
