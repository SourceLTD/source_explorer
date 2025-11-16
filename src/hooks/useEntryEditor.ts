import { useState, useCallback } from 'react';
import { GraphNode, sortRolesByPrecedence } from '@/lib/types';
import { EditableField, EditableRole, EditableRoleGroup, EditingState, Mode } from '@/components/editing/types';

export function useEntryEditor(node: GraphNode | null, mode: Mode) {
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [editListItems, setEditListItems] = useState<string[]>([]);
  const [editRoles, setEditRoles] = useState<EditableRole[]>([]);
  const [editRoleGroups, setEditRoleGroups] = useState<EditableRoleGroup[]>([]);
  const [codeValidationMessage, setCodeValidationMessage] = useState<string>('');
  const [selectedHyponymsToMove, setSelectedHyponymsToMove] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  const startEditing = useCallback((field: EditableField) => {
    if (!node) return;
    
    setEditingField(field);
    setCodeValidationMessage('');
    
    if (field === 'code') {
      // Extract lemma part from id (e.g., "communicate" from "communicate.v.01")
      const lemmaMatch = node.id.match(/^(.+)\.[vnar]\.(\d+)$/);
      if (lemmaMatch) {
        setEditValue(lemmaMatch[1]); // Just the lemma part
      } else {
        setEditValue(node.id);
      }
    } else if (field === 'hypernym') {
      // Set current hypernym and select all hyponyms to move by default
      setEditValue(node.parents[0]?.id || '');
      setSelectedHyponymsToMove(new Set(node.children.map(c => c.id)));
    } else if (field === 'src_lemmas') {
      setEditListItems([...(node.src_lemmas || [])]);
    } else if (field === 'examples') {
      setEditListItems([...node.examples]);
    } else if (field === 'legal_constraints') {
      setEditListItems([...(node.legal_constraints || [])]);
    } else if (field === 'gloss') {
      setEditValue(node.gloss);
    } else if (field === 'vendler_class') {
      setEditValue(node.vendler_class || '');
    } else if (field === 'lexfile') {
      setEditValue(node.lexfile || '');
    } else if (field === 'frame') {
      setEditValue(node.frame_id || '');
    } else if (field === 'roles') {
      const preparedRoles = sortRolesByPrecedence(node.roles || []).map((role, index) => {
        const clientId = role.id && role.id.length > 0 ? role.id : `existing-role-${index}-${role.role_type.label}`;
        return {
          id: role.id,
          clientId,
          description: role.description || '',
          roleType: role.role_type.label,
          exampleSentence: role.example_sentence || '',
          main: role.main,
        };
      });

      const idToClientId = new Map<string, string>();
      preparedRoles.forEach(role => {
        if (role.id) {
          idToClientId.set(role.id, role.clientId);
        }
      });

      setEditRoles(preparedRoles);
      setEditRoleGroups(
        (node.role_groups || []).map(group => ({
          id: group.id,
          description: group.description || '',
          role_ids: group.role_ids.map(roleId => idToClientId.get(roleId) ?? roleId)
        }))
      );
    }
  }, [node]);

  const cancelEditing = useCallback(() => {
    setEditingField(null);
    setEditValue('');
    setEditListItems([]);
    setEditRoles([]);
    setEditRoleGroups([]);
    setCodeValidationMessage('');
    setSelectedHyponymsToMove(new Set());
  }, []);

  // List editing helpers
  const updateListItem = useCallback((index: number, value: string) => {
    const newItems = [...editListItems];
    newItems[index] = value;
    setEditListItems(newItems);
  }, [editListItems]);

  const addListItem = useCallback(() => {
    setEditListItems([...editListItems, '']);
  }, [editListItems]);

  const removeListItem = useCallback((index: number) => {
    const newItems = editListItems.filter((_, i) => i !== index);
    setEditListItems(newItems);
  }, [editListItems]);

  // Role editing helpers
  const updateRole = useCallback((clientId: string, field: 'description' | 'roleType' | 'exampleSentence' | 'main', value: string | boolean) => {
    setEditRoles(prev => prev.map((role) => 
      role.clientId === clientId ? { ...role, [field]: value } : role
    ));
  }, []);

  const addRole = useCallback((main: boolean) => {
    const clientId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    setEditRoles(prev => [...prev, { id: '', clientId, description: '', roleType: '', exampleSentence: '', main }]);
  }, []);

  const removeRole = useCallback((clientId: string) => {
    const identifiersToRemove: string[] = [];
    setEditRoles(prev => prev.filter(role => {
      if (role.clientId === clientId) {
        identifiersToRemove.push(role.clientId);
        if (role.id) {
          identifiersToRemove.push(role.id);
        }
        return false;
      }
      return true;
    }));

    if (identifiersToRemove.length > 0) {
      setEditRoleGroups(prev => prev.map(group => ({
        ...group,
        role_ids: group.role_ids.filter(id => !identifiersToRemove.includes(id))
      })).filter(group => group.role_ids.length >= 2));
    }
  }, []);

  // Role group editing helpers
  const addRoleGroup = useCallback(() => {
    const tempId = `temp-group-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    setEditRoleGroups(prev => [...prev, { id: tempId, description: '', role_ids: [] }]);
  }, []);

  const removeRoleGroup = useCallback((index: number) => {
    setEditRoleGroups(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateRoleGroup = useCallback((index: number, field: 'description' | 'role_ids', value: string | string[]) => {
    setEditRoleGroups(prev => prev.map((group, i) => 
      i === index ? { ...group, [field]: value } : group
    ));
  }, []);

  const toggleRoleInGroup = useCallback((groupIndex: number, roleId: string) => {
    setEditRoleGroups(prev => prev.map((group, i) => {
      if (i !== groupIndex) return group;
      const isInGroup = group.role_ids.includes(roleId);
      return {
        ...group,
        role_ids: isInGroup 
          ? group.role_ids.filter(id => id !== roleId)
          : [...group.role_ids, roleId]
      };
    }));
  }, []);

  const toggleHyponymSelection = useCallback((hyponymId: string) => {
    setSelectedHyponymsToMove(prev => {
      const newSet = new Set(prev);
      if (newSet.has(hyponymId)) {
        newSet.delete(hyponymId);
      } else {
        newSet.add(hyponymId);
      }
      return newSet;
    });
  }, []);

  return {
    editingField,
    editValue,
    editListItems,
    editRoles,
    editRoleGroups,
    codeValidationMessage,
    selectedHyponymsToMove,
    isSaving,
    setEditingField,
    setEditValue,
    setEditListItems,
    setCodeValidationMessage,
    setIsSaving,
    startEditing,
    cancelEditing,
    updateListItem,
    addListItem,
    removeListItem,
    updateRole,
    addRole,
    removeRole,
    addRoleGroup,
    removeRoleGroup,
    updateRoleGroup,
    toggleRoleInGroup,
    toggleHyponymSelection,
  };
}

