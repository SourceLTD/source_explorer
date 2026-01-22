'use client';

import { useState, useEffect, useCallback } from 'react';
import { DataTableMode, getColumnsForMode, NESTED_FIELD_CONFIGS, hasNestedFields } from '../config';

export interface CopyFieldSelectionState {
  [fieldKey: string]: boolean;
}

export interface UseCopyFieldSelectionReturn {
  selectedFields: CopyFieldSelectionState;
  toggleField: (fieldKey: string) => void;
  toggleNestedField: (columnKey: string, subFieldKey: string) => void;
  selectAll: () => void;
  clearAll: () => void;
  isFieldSelected: (fieldKey: string) => boolean;
  isNestedFieldSelected: (columnKey: string, subFieldKey: string) => boolean;
  getSelectedFieldKeys: () => string[];
  getSelectedNestedFieldKeys: (columnKey: string) => string[];
  hasAnyNestedFieldSelected: (columnKey: string) => boolean;
  selectAllNestedFields: (columnKey: string) => void;
  clearAllNestedFields: (columnKey: string) => void;
}

function getStorageKey(mode: DataTableMode): string {
  return `copy-field-selection-${mode}`;
}

function getDefaultSelection(mode: DataTableMode): CopyFieldSelectionState {
  const columns = getColumnsForMode(mode);
  const selection: CopyFieldSelectionState = {};
  
  // Default to all visible columns selected (except 'actions')
  columns.forEach(col => {
    if (col.key !== 'actions') {
      // For columns with nested fields, we track the parent as selected if any subfield is selected
      if (hasNestedFields(col.key)) {
        selection[col.key] = col.visible;
        // Add default nested field selections
        const nestedConfig = NESTED_FIELD_CONFIGS[col.key];
        if (nestedConfig) {
          nestedConfig.forEach(subField => {
            const nestedKey = `${col.key}.${subField.key}`;
            selection[nestedKey] = col.visible && subField.defaultSelected;
          });
        }
      } else {
        selection[col.key] = col.visible;
      }
    }
  });
  
  return selection;
}

export function useCopyFieldSelection(mode: DataTableMode): UseCopyFieldSelectionReturn {
  const [selectedFields, setSelectedFields] = useState<CopyFieldSelectionState>(() => 
    getDefaultSelection(mode)
  );

  // Load from localStorage after mount (avoids hydration mismatch)
  useEffect(() => {
    const storageKey = getStorageKey(mode);
    const saved = localStorage.getItem(storageKey);
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Merge with defaults to handle new columns/subfields that may have been added
        const defaults = getDefaultSelection(mode);
        setSelectedFields({ ...defaults, ...parsed });
      } catch {
        // Invalid JSON, keep defaults
      }
    } else {
      // No saved state, use defaults
      setSelectedFields(getDefaultSelection(mode));
    }
  }, [mode]);

  // Save to localStorage whenever selection changes
  const saveToStorage = useCallback((newSelection: CopyFieldSelectionState) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(getStorageKey(mode), JSON.stringify(newSelection));
    }
  }, [mode]);

  const toggleField = useCallback((fieldKey: string) => {
    setSelectedFields(prev => {
      const newSelection = { ...prev, [fieldKey]: !prev[fieldKey] };
      
      // If this is a column with nested fields and we're deselecting it,
      // also deselect all nested fields
      if (hasNestedFields(fieldKey) && prev[fieldKey]) {
        const nestedConfig = NESTED_FIELD_CONFIGS[fieldKey];
        if (nestedConfig) {
          nestedConfig.forEach(subField => {
            newSelection[`${fieldKey}.${subField.key}`] = false;
          });
        }
      }
      // If selecting a column with nested fields, select all nested fields with defaultSelected: true
      if (hasNestedFields(fieldKey) && !prev[fieldKey]) {
        const nestedConfig = NESTED_FIELD_CONFIGS[fieldKey];
        if (nestedConfig) {
          nestedConfig.forEach(subField => {
            newSelection[`${fieldKey}.${subField.key}`] = subField.defaultSelected;
          });
        }
      }
      
      saveToStorage(newSelection);
      return newSelection;
    });
  }, [saveToStorage]);

  const toggleNestedField = useCallback((columnKey: string, subFieldKey: string) => {
    const nestedKey = `${columnKey}.${subFieldKey}`;
    setSelectedFields(prev => {
      const newSelection = { ...prev, [nestedKey]: !prev[nestedKey] };
      
      // Update parent column selection based on whether any nested fields are selected
      const nestedConfig = NESTED_FIELD_CONFIGS[columnKey];
      if (nestedConfig) {
        const hasAnySelected = nestedConfig.some(sf => 
          newSelection[`${columnKey}.${sf.key}`]
        );
        newSelection[columnKey] = hasAnySelected;
      }
      
      saveToStorage(newSelection);
      return newSelection;
    });
  }, [saveToStorage]);

  const selectAll = useCallback(() => {
    const columns = getColumnsForMode(mode);
    const newSelection: CopyFieldSelectionState = {};
    
    columns.forEach(col => {
      if (col.key !== 'actions') {
        newSelection[col.key] = true;
        // Also select all nested fields
        if (hasNestedFields(col.key)) {
          const nestedConfig = NESTED_FIELD_CONFIGS[col.key];
          if (nestedConfig) {
            nestedConfig.forEach(subField => {
              newSelection[`${col.key}.${subField.key}`] = true;
            });
          }
        }
      }
    });
    
    setSelectedFields(newSelection);
    saveToStorage(newSelection);
  }, [mode, saveToStorage]);

  const clearAll = useCallback(() => {
    const columns = getColumnsForMode(mode);
    const newSelection: CopyFieldSelectionState = {};
    
    columns.forEach(col => {
      if (col.key !== 'actions') {
        newSelection[col.key] = false;
        // Also clear all nested fields
        if (hasNestedFields(col.key)) {
          const nestedConfig = NESTED_FIELD_CONFIGS[col.key];
          if (nestedConfig) {
            nestedConfig.forEach(subField => {
              newSelection[`${col.key}.${subField.key}`] = false;
            });
          }
        }
      }
    });
    
    setSelectedFields(newSelection);
    saveToStorage(newSelection);
  }, [mode, saveToStorage]);

  const selectAllNestedFields = useCallback((columnKey: string) => {
    setSelectedFields(prev => {
      const newSelection = { ...prev, [columnKey]: true };
      const nestedConfig = NESTED_FIELD_CONFIGS[columnKey];
      if (nestedConfig) {
        nestedConfig.forEach(subField => {
          newSelection[`${columnKey}.${subField.key}`] = true;
        });
      }
      saveToStorage(newSelection);
      return newSelection;
    });
  }, [saveToStorage]);

  const clearAllNestedFields = useCallback((columnKey: string) => {
    setSelectedFields(prev => {
      const newSelection = { ...prev, [columnKey]: false };
      const nestedConfig = NESTED_FIELD_CONFIGS[columnKey];
      if (nestedConfig) {
        nestedConfig.forEach(subField => {
          newSelection[`${columnKey}.${subField.key}`] = false;
        });
      }
      saveToStorage(newSelection);
      return newSelection;
    });
  }, [saveToStorage]);

  const isFieldSelected = useCallback((fieldKey: string): boolean => {
    return selectedFields[fieldKey] ?? false;
  }, [selectedFields]);

  const isNestedFieldSelected = useCallback((columnKey: string, subFieldKey: string): boolean => {
    return selectedFields[`${columnKey}.${subFieldKey}`] ?? false;
  }, [selectedFields]);

  const getSelectedFieldKeys = useCallback((): string[] => {
    const columns = getColumnsForMode(mode);
    return columns
      .filter(col => col.key !== 'actions' && selectedFields[col.key])
      .map(col => col.key);
  }, [selectedFields, mode]);

  const getSelectedNestedFieldKeys = useCallback((columnKey: string): string[] => {
    const nestedConfig = NESTED_FIELD_CONFIGS[columnKey];
    if (!nestedConfig) return [];
    
    return nestedConfig
      .filter(subField => selectedFields[`${columnKey}.${subField.key}`])
      .map(subField => subField.key);
  }, [selectedFields]);

  const hasAnyNestedFieldSelected = useCallback((columnKey: string): boolean => {
    const nestedConfig = NESTED_FIELD_CONFIGS[columnKey];
    if (!nestedConfig) return false;
    
    return nestedConfig.some(subField => selectedFields[`${columnKey}.${subField.key}`]);
  }, [selectedFields]);

  return {
    selectedFields,
    toggleField,
    toggleNestedField,
    selectAll,
    clearAll,
    isFieldSelected,
    isNestedFieldSelected,
    getSelectedFieldKeys,
    getSelectedNestedFieldKeys,
    hasAnyNestedFieldSelected,
    selectAllNestedFields,
    clearAllNestedFields,
  };
}
