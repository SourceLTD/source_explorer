import { useState, useCallback } from 'react';
import { GraphNode, Concept, sortRolesByPrecedence } from '@/lib/types';
import { EditableField, EditableConceptProperty, Mode } from '@/components/editing/types';

export function useEntryEditor(node: GraphNode | Concept | null, mode: Mode) {
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [editListItems, setEditListItems] = useState<string[]>([]);
  const [editProperties, setEditProperties] = useState<EditableConceptProperty[]>([]);
  const [codeValidationMessage, setCodeValidationMessage] = useState<string>('');
  const [selectedHyponymsToMove, setSelectedHyponymsToMove] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  const startEditing = useCallback((field: EditableField) => {
    if (!node) return;
    
    setEditingField(field);
    setCodeValidationMessage('');
    
    // Concept-specific fields
    if (mode === 'concepts' && 'label' in node) {
      const conceptNode = node as Concept;
      if (field === 'label') {
        setEditValue(conceptNode.label);
      } else if (field === 'definition') {
        setEditValue(conceptNode.definition ?? '');
      } else if (field === 'short_definition') {
        setEditValue(conceptNode.short_definition ?? '');
      } else if (field === 'properties') {
        const preparedProperties = sortRolesByPrecedence(conceptNode.properties || []).map((role, index) => {
          const clientId = role.id && role.id.length > 0 ? role.id : `existing-role-${index}-${role.label || 'unnamed'}`;
          return {
            id: role.id,
            clientId,
            label: role.label || '',
            description: role.description || '',
            notes: role.notes || '',
            main: role.main ?? false,
            examples: Array.isArray(role.examples) ? role.examples : [],
          };
        });
        setEditProperties(preparedProperties);
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
    } else if (field === 'concept') {
      setEditValue(graphNode.concept_id || '');
    }
  }, [node, mode]);

  const cancelEditing = useCallback(() => {
    setEditingField(null);
    setEditValue('');
    setEditListItems([]);
    setEditProperties([]);
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

  // Property editing helpers
  const updateProperty = useCallback((clientId: string, field: 'label' | 'description' | 'notes' | 'main' | 'examples', value: string | boolean | string[]) => {
    setEditProperties(prev => prev.map((role) => 
      role.clientId === clientId ? { ...role, [field]: value } : role
    ));
  }, []);

  const addProperty = useCallback((main: boolean) => {
    const clientId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    setEditProperties(prev => [...prev, { id: '', clientId, label: '', description: '', notes: '', main, examples: [] }]);
  }, []);

  const removeProperty = useCallback((clientId: string) => {
    setEditProperties(prev => prev.filter(role => role.clientId !== clientId));
  }, []);

  return {
    editingField,
    editValue,
    editListItems,
    editProperties,
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
    updateProperty,
    addProperty,
    removeProperty,
  };
}

