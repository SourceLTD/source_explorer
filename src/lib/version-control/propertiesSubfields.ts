export type PropertyField = 'label' | 'description' | 'notes' | 'main' | 'examples' | '__exists';

export function isPropertiesFieldName(fieldName: string): boolean {
  return fieldName === 'properties' || fieldName.startsWith('properties.');
}

export function parsePropertiesFieldName(
  fieldName: string
): { propertyType: string; field: PropertyField } | null {
  if (!fieldName.startsWith('properties.')) return null;
  const parts = fieldName.split('.');
  // Expected: properties.<PROPERTYTYPE>.<FIELD>
  if (parts.length < 3) return null;
  const propertyType = parts[1];
  const field = parts.slice(2).join('.') as PropertyField;
  if (!propertyType) return null;
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
  return { propertyType, field };
}

export type NormalizedProperty = {
  propertyType: string;
  description: string | null;
  notes: string | null;
  main: boolean;
  examples: string[];
  label: string | null;
};

export function defaultNormalizedProperty(propertyType: string): NormalizedProperty {
  return {
    propertyType,
    description: null,
    notes: null,
    main: false,
    examples: [],
    label: null,
  };
}

export function coerceNormalizedPropertyValue(
  field: Exclude<PropertyField, '__exists'>,
  v: unknown
): NormalizedProperty[Exclude<PropertyField, '__exists'>] {
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

export function applyPropertiesSubChanges(
  baseProperties: NormalizedProperty[],
  changes: Array<{ field_name: string; new_value: unknown }>
): NormalizedProperty[] {
  const propertiesByType = new Map<string, NormalizedProperty>(baseProperties.map(r => [r.propertyType, { ...r }]));

  // Apply existence first
  for (const c of changes) {
    const parsed = parsePropertiesFieldName(c.field_name);
    if (!parsed || parsed.field !== '__exists') continue;
    const nextExists = typeof c.new_value === 'boolean' ? c.new_value : Boolean(c.new_value);

    if (!nextExists) {
      propertiesByType.delete(parsed.propertyType);
      continue;
    }

    if (!propertiesByType.has(parsed.propertyType)) {
      propertiesByType.set(parsed.propertyType, defaultNormalizedProperty(parsed.propertyType));
    }
  }

  // Then field updates
  for (const c of changes) {
    const parsed = parsePropertiesFieldName(c.field_name);
    if (!parsed || parsed.field === '__exists') continue;
    const prop = propertiesByType.get(parsed.propertyType);
    if (!prop) continue;
    (prop as any)[parsed.field] = coerceNormalizedPropertyValue(parsed.field, c.new_value);
  }

  return Array.from(propertiesByType.values()).sort((a, b) => a.propertyType.localeCompare(b.propertyType));
}

/** @deprecated Use PropertyField */
export type FrameRoleField = PropertyField;
/** @deprecated Use NormalizedProperty */
export type NormalizedFrameRole = NormalizedProperty;
/** @deprecated Use isPropertiesFieldName */
export const isFrameRolesFieldName = isPropertiesFieldName;
/** @deprecated Use parsePropertiesFieldName */
export const parseFrameRolesFieldName = parsePropertiesFieldName;
/** @deprecated Use defaultNormalizedProperty */
export const defaultNormalizedFrameRole = defaultNormalizedProperty;
/** @deprecated Use coerceNormalizedPropertyValue */
export const coerceNormalizedFrameRoleValue = coerceNormalizedPropertyValue;
/** @deprecated Use applyPropertiesSubChanges */
export const applyFrameRolesSubChanges = applyPropertiesSubChanges;
