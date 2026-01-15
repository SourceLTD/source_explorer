import { useState, useCallback } from 'react';
import { GraphNode, Frame, sortRolesByPrecedence } from '@/lib/types';
import { EditableField, EditableFrameRole, Mode } from '@/components/editing/types';

export function useEntryEditor(node: GraphNode | Frame | null, mode: Mode) {
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [editListItems, setEditListItems] = useState<string[]>([]);
  const [editFrameRoles, setEditFrameRoles] = useState<EditableFrameRole[]>([]);
  const [codeValidationMessage, setCodeValidationMessage] = useState<string>('');
  const [selectedHyponymsToMove, setSelectedHyponymsToMove] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  const startEditing = useCallback((field: EditableField) => {
    if (!node) return;
    
    setEditingField(field);
    setCodeValidationMessage('');
    
    // Frame-specific fields
    if (mode === 'frames' && 'label' in node) {
      const frameNode = node as Frame;
      if (field === 'label') {
        setEditValue(frameNode.label);
      } else if (field === 'definition') {
        setEditValue(frameNode.definition ?? '');
      } else if (field === 'short_definition') {
        setEditValue(frameNode.short_definition ?? '');
      } else if (field === 'frame_roles') {
        const preparedFrameRoles = sortRolesByPrecedence(frameNode.frame_roles || []).map((role, index) => {
          const clientId = role.id && role.id.length > 0 ? role.id : `existing-role-${index}-${role.role_type.label}`;
          return {
            id: role.id,
            clientId,
            label: role.label || '',
            description: role.description || '',
            notes: role.notes || '',
            roleType: role.role_type.label,
            main: role.main ?? false,
            examples: Array.isArray(role.examples) ? role.examples : [],
          };
        });
        setEditFrameRoles(preparedFrameRoles);
      }
      return;
    }
    
    // GraphNode-specific fields
    const graphNode = node as GraphNode;
    if (field === 'code') {
      // Extract lemma part from id (e.g., "communicate" from "communicate.v.01")
      const lemmaMatch = graphNode.id.match(/^(.+)\.[vnar]\.(\d+)$/);
      if (lemmaMatch) {
        setEditValue(lemmaMatch[1]); // Just the lemma part
      } else {
        setEditValue(graphNode.id);
      }
    } else if (field === 'hypernym') {
      // Set current hypernym and select all hyponyms to move by default
      setEditValue(graphNode.parents[0]?.id || '');
      setSelectedHyponymsToMove(new Set(graphNode.children.map(c => c.id)));
    } else if (field === 'src_lemmas') {
      setEditListItems([...(graphNode.src_lemmas || [])]);
    } else if (field === 'examples') {
      setEditListItems([...graphNode.examples]);
    } else if (field === 'gloss') {
      setEditValue(graphNode.gloss);
    } else if (field === 'vendler_class') {
      setEditValue(graphNode.vendler_class || '');
    } else if (field === 'lexfile') {
      setEditValue(graphNode.lexfile || '');
    } else if (field === 'frame') {
      setEditValue(graphNode.frame_id || '');
    }
  }, [node, mode]);

  const cancelEditing = useCallback(() => {
    setEditingField(null);
    setEditValue('');
    setEditListItems([]);
    setEditFrameRoles([]);
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

  // Frame role editing helpers
  const updateFrameRole = useCallback((clientId: string, field: 'label' | 'description' | 'notes' | 'roleType' | 'main' | 'examples', value: string | boolean | string[]) => {
    setEditFrameRoles(prev => prev.map((role) => 
      role.clientId === clientId ? { ...role, [field]: value } : role
    ));
  }, []);

  const addFrameRole = useCallback((main: boolean) => {
    const clientId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    setEditFrameRoles(prev => [...prev, { id: '', clientId, label: '', description: '', notes: '', roleType: '', main, examples: [] }]);
  }, []);

  const removeFrameRole = useCallback((clientId: string) => {
    setEditFrameRoles(prev => prev.filter(role => role.clientId !== clientId));
  }, []);

  return {
    editingField,
    editValue,
    editListItems,
    editFrameRoles,
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
    toggleHyponymSelection,
    updateFrameRole,
    addFrameRole,
    removeFrameRole,
  };
}

