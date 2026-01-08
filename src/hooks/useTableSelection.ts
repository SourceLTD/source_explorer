'use client';

import { useState, useCallback, useMemo } from 'react';

export interface UseTableSelectionOptions<T extends { id: string }> {
  /** All items that can potentially be selected */
  items?: T[];
  /** Items on the current page (for selectAll behavior on paginated tables) */
  pageItems?: T[];
  /** Initial selection (optional) */
  initialSelection?: Set<string>;
}

export interface UseTableSelectionReturn<T extends { id: string }> {
  /** Set of currently selected item IDs */
  selectedIds: Set<string>;
  /** Whether all items on the current page are selected */
  selectAll: boolean;
  /** Check if a specific item is selected */
  isSelected: (id: string) => boolean;
  /** Toggle selection for a single item */
  toggleSelect: (id: string) => void;
  /** Toggle select all for the current page */
  toggleSelectAll: () => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Select multiple items at once */
  selectItems: (ids: string[]) => void;
  /** Deselect multiple items at once */
  deselectItems: (ids: string[]) => void;
  /** Number of selected items */
  selectedCount: number;
  /** Get items from the page that are currently selected */
  getSelectedPageItems: () => T[];
}

/**
 * Custom hook for managing table row selection state.
 * Supports both single-page and paginated table selection patterns.
 */
export function useTableSelection<T extends { id: string }>({
  items = [],
  pageItems,
  initialSelection,
}: UseTableSelectionOptions<T> = {}): UseTableSelectionReturn<T> {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    initialSelection ?? new Set()
  );

  // Use pageItems if provided, otherwise fall back to items
  const currentPageItems = pageItems ?? items;

  // Check if all items on the current page are selected
  const selectAll = useMemo(() => {
    if (currentPageItems.length === 0) return false;
    return currentPageItems.every((item) => selectedIds.has(item.id));
  }, [currentPageItems, selectedIds]);

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allCurrentPageSelected = currentPageItems.every((item) =>
        prev.has(item.id)
      );

      if (allCurrentPageSelected) {
        // Deselect all items on the current page
        const next = new Set(prev);
        currentPageItems.forEach((item) => next.delete(item.id));
        return next;
      } else {
        // Select all items on the current page
        const next = new Set(prev);
        currentPageItems.forEach((item) => next.add(item.id));
        return next;
      }
    });
  }, [currentPageItems]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectItems = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const deselectItems = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  const getSelectedPageItems = useCallback(() => {
    return currentPageItems.filter((item) => selectedIds.has(item.id));
  }, [currentPageItems, selectedIds]);

  return {
    selectedIds,
    selectAll,
    isSelected,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    selectItems,
    deselectItems,
    selectedCount: selectedIds.size,
    getSelectedPageItems,
  };
}

export default useTableSelection;

