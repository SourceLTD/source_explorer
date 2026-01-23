import { useCallback } from 'react';
import { Mode, EditableFrameRole } from '@/components/editing/types';
import { refreshPendingChangesCount } from './usePendingChangesCount';

function getApiPrefix(mode: Mode): string {
  if (mode === 'frames') return '/api/frames';
  return '/api/lexical-units';
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
    unitId: string,
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
        unitId,
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
    unitId: string, 
    field: string, 
    value: unknown
  ): Promise<void> => {
    const updateData: Record<string, unknown> = { [field]: value };
    
    const response = await fetch(`${apiPrefix}/${unitId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to update entry');
    }
    
    // Refresh pending changes count since this stages a change
    refreshPendingChangesCount();
  }, [apiPrefix]);

  const deleteEntry = useCallback(async (unitId: string): Promise<void> => {
    const response = await fetch(`${apiPrefix}/${unitId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to delete entry');
    }
    
    // Refresh pending changes count since this stages a delete
    refreshPendingChangesCount();
  }, [apiPrefix]);

  const toggleFlag = useCallback(async (unitId: string, currentFlagged: boolean): Promise<void> => {
    const response = await fetch(`${apiPrefix}/flag`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: [unitId],
        updates: {
          flagged: !currentFlagged,
          flaggedReason: null
        }
      })
    });

    if (!response.ok) {
      throw new Error('Failed to update flag status');
    }
    // Note: No refreshPendingChangesCount() - flagging is a direct update, not a staged change
  }, [apiPrefix]);

  const toggleVerifiable = useCallback(async (unitId: string, currentVerifiable: boolean): Promise<void> => {
    const response = await fetch(`${apiPrefix}/flag`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: [unitId],
        updates: {
          verifiable: !currentVerifiable
        }
      })
    });

    if (!response.ok) {
      throw new Error('Failed to update verifiable status');
    }
    
    // Refresh pending changes count since this stages a change
    refreshPendingChangesCount();
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
        // Normalize label (per-frame display name)
        label: role.label?.trim?.() ?? '',
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
    
    // Refresh pending changes count since this stages a change
    refreshPendingChangesCount();
  }, [apiPrefix]);

  /**
   * Delete a pending field change (used when user reverts to original value)
   */
  const deleteFieldChange = useCallback(async (fieldChangeId: string): Promise<void> => {
    const response = await fetch(`/api/field-changes/${fieldChangeId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to delete field change');
    }
    
    // Refresh pending changes count since this removes a change
    refreshPendingChangesCount();
  }, []);

  return {
    updateCode,
    updateHypernym,
    updateField,
    updateFrameRoles,
    deleteEntry,
    toggleFlag,
    toggleVerifiable,
    deleteFieldChange,
  };
}

