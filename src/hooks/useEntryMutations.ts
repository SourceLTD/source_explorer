import { useCallback } from 'react';
import { Mode, EditableRole, EditableRoleGroup, EditableFrameRole } from '@/components/editing/types';

function getApiPrefix(mode: Mode): string {
  switch (mode) {
    case 'verbs': return '/api/verbs';
    case 'nouns': return '/api/nouns';
    case 'adjectives': return '/api/adjectives';
    case 'adverbs': return '/api/adverbs';
    case 'frames': return '/api/frames';
  }
}

export function useEntryMutations(mode: Mode) {
  const apiPrefix = getApiPrefix(mode);

  const updateCode = useCallback(async (currentId: string, newLemma: string): Promise<string> => {
    const sanitizedLemma = newLemma.trim().toLowerCase().replace(/\s+/g, '_');
    
    if (!sanitizedLemma) {
      throw new Error('Lemma cannot be empty');
    }
    
    // Extract POS from current ID
    const posMatch = currentId.match(/\.([vnar])\.(\d+)$/);
    if (!posMatch) {
      throw new Error('Invalid ID format');
    }
    
    const pos = posMatch[1];
    
    // Find unique code
    let newId = '';
    for (let num = 1; num <= 99; num++) {
      const numStr = num.toString().padStart(2, '0');
      const candidateId = `${sanitizedLemma}.${pos}.${numStr}`;
      
      try {
        const response = await fetch(`${apiPrefix}/${candidateId}`);
        if (!response.ok) {
          newId = candidateId;
          break;
        }
      } catch {
        newId = candidateId;
        break;
      }
    }
    
    if (!newId) {
      throw new Error('No available numeric suffix found (checked up to 99)');
    }
    
    // Update with new ID
    const response = await fetch(`${apiPrefix}/${currentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: newId })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to update code');
    }

    return newId;
  }, [apiPrefix]);

  const updateHypernym = useCallback(async (
    entryId: string,
    oldHypernym: string | undefined,
    newHypernym: string,
    hyponymsToMove: string[],
    hyponymsToStay: string[]
  ): Promise<void> => {
    const response = await fetch('/api/relations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'change_hypernym',
        entryId,
        oldHypernym,
        newHypernym,
        hyponymsToMove,
        hyponymsToStay,
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to update hypernym');
    }
  }, []);

  const updateField = useCallback(async (
    entryId: string, 
    field: string, 
    value: unknown
  ): Promise<void> => {
    const updateData: Record<string, unknown> = { [field]: value };
    
    const response = await fetch(`${apiPrefix}/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to update entry');
    }
  }, [apiPrefix]);

  const updateRoles = useCallback(async (
    entryId: string,
    roles: EditableRole[],
    roleGroups: EditableRoleGroup[]
  ): Promise<void> => {
    const filteredRoles = roles.filter(role => role.description.trim());

    const roleIdLookup = new Map<string, string>();
    roles.forEach(role => {
      if (role.id) {
        roleIdLookup.set(role.clientId, role.id);
        roleIdLookup.set(role.id, role.id);
      }
    });

    const filteredRoleGroups = roleGroups
      .map(group => {
        const resolvedRoleIds = group.role_ids
          .map(roleId => roleIdLookup.get(roleId))
          .filter((id): id is string => Boolean(id));
        return {
          ...group,
          role_ids: resolvedRoleIds,
        };
      })
      .filter(group => group.role_ids.length >= 2);

    const response = await fetch(`${apiPrefix}/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roles: filteredRoles,
        role_groups: filteredRoleGroups
      })
    });

    if (!response.ok) {
      throw new Error('Failed to update roles');
    }
  }, [apiPrefix]);

  const deleteEntry = useCallback(async (entryId: string): Promise<void> => {
    const response = await fetch(`${apiPrefix}/${entryId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to delete entry');
    }
  }, [apiPrefix]);

  const toggleFlag = useCallback(async (entryId: string, currentFlagged: boolean): Promise<void> => {
    const response = await fetch(`${apiPrefix}/moderation`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: [entryId],
        updates: {
          flagged: !currentFlagged
        }
      })
    });

    if (!response.ok) {
      throw new Error('Failed to update flag status');
    }
  }, [apiPrefix]);

  const toggleVerifiable = useCallback(async (entryId: string, currentVerifiable: boolean): Promise<void> => {
    const response = await fetch(`${apiPrefix}/moderation`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: [entryId],
        updates: {
          verifiable: !currentVerifiable
        }
      })
    });

    if (!response.ok) {
      throw new Error('Failed to update verifiable status');
    }
  }, [apiPrefix]);

  const updateFrameRoles = useCallback(async (
    frameId: string,
    frameRoles: EditableFrameRole[]
  ): Promise<void> => {
    // Filter out roles without a role type and clean up examples array
    const filteredRoles = frameRoles
      .filter(role => role.roleType.trim())
      .map(role => ({
        ...role,
        // Remove empty/whitespace-only examples when saving
        examples: role.examples.filter(ex => ex.trim())
      }));

    const response = await fetch(`${apiPrefix}/${frameId}/roles`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roles: filteredRoles
      })
    });

    if (!response.ok) {
      throw new Error('Failed to update frame roles');
    }
  }, [apiPrefix]);

  return {
    updateCode,
    updateHypernym,
    updateField,
    updateRoles,
    updateFrameRoles,
    deleteEntry,
    toggleFlag,
    toggleVerifiable,
  };
}

