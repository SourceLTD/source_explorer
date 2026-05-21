export type FrameRoleField = 'label' | 'description' | 'notes' | 'main' | 'examples' | '__exists';

export function isFrameRolesFieldName(fieldName: string): boolean {
  return fieldName === 'frame_roles' || fieldName.startsWith('frame_roles.');
}

export function parseFrameRolesFieldName(
  fieldName: string
): { roleType: string; field: FrameRoleField } | null {
  if (!fieldName.startsWith('frame_roles.')) return null;
  const parts = fieldName.split('.');
  // Expected: frame_roles.<ROLETYPE>.<FIELD>
  if (parts.length < 3) return null;
  const roleType = parts[1];
  const field = parts.slice(2).join('.') as FrameRoleField;
  if (!roleType) return null;
  if (
    field !== '__exists' &&
    field !== 'label' &&
    field !== 'description' &&
    field !== 'notes' &&
    field !== 'main' &&
    field !== 'examples'
  ) {
    return null;
  }
  return { roleType, field };
}

export type NormalizedFrameRole = {
  roleType: string;
  description: string | null;
  notes: string | null;
  main: boolean;
  examples: string[];
  label: string | null;
};

export function defaultNormalizedFrameRole(roleType: string): NormalizedFrameRole {
  return {
    roleType,
    description: null,
    notes: null,
    main: false,
    examples: [],
    label: null,
  };
}

export function coerceNormalizedFrameRoleValue(
  field: Exclude<FrameRoleField, '__exists'>,
  v: unknown
): NormalizedFrameRole[Exclude<FrameRoleField, '__exists'>] {
  switch (field) {
    case 'label':
    case 'description':
    case 'notes':
      return typeof v === 'string' ? v : null;
    case 'main':
      return typeof v === 'boolean' ? v : Boolean(v);
    case 'examples':
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  }
}

export function applyFrameRolesSubChanges(
  baseRoles: NormalizedFrameRole[],
  changes: Array<{ field_name: string; new_value: unknown }>
): NormalizedFrameRole[] {
  const rolesByType = new Map<string, NormalizedFrameRole>(baseRoles.map(r => [r.roleType, { ...r }]));

  // Apply existence first
  for (const c of changes) {
    const parsed = parseFrameRolesFieldName(c.field_name);
    if (!parsed || parsed.field !== '__exists') continue;
    const nextExists = typeof c.new_value === 'boolean' ? c.new_value : Boolean(c.new_value);

    if (!nextExists) {
      rolesByType.delete(parsed.roleType);
      continue;
    }

    if (!rolesByType.has(parsed.roleType)) {
      rolesByType.set(parsed.roleType, defaultNormalizedFrameRole(parsed.roleType));
    }
  }

  // Then field updates
  for (const c of changes) {
    const parsed = parseFrameRolesFieldName(c.field_name);
    if (!parsed || parsed.field === '__exists') continue;
    const role = rolesByType.get(parsed.roleType);
    if (!role) continue;
    (role as any)[parsed.field] = coerceNormalizedFrameRoleValue(parsed.field, c.new_value);
  }

  return Array.from(rolesByType.values()).sort((a, b) => a.roleType.localeCompare(b.roleType));
}

