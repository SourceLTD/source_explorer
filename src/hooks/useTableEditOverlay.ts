import { useState, useCallback } from 'react';
import { GraphNode, Frame, TableEntry } from '@/lib/types';
import { Mode } from '@/components/editing/types';

type EntityData = GraphNode | Frame | null;

interface UseTableEditOverlayReturn {
  isEditOverlayOpen: boolean;
  currentEntity: EntityData;
  selectedEntityId: string;
  refreshTrigger: number;
  isLoading: boolean;
  handleEditClick: (entry: TableEntry | Frame) => Promise<void>;
  handleUpdate: () => Promise<void>;
  handleCloseOverlay: () => void;
}

/**
 * Gets the API endpoint for fetching entity data based on mode
 */
function getApiEndpoint(mode: Mode, id: string, forUpdate: boolean = false): string {
  if (mode === 'frames') {
    // Frames use a different endpoint structure
    return `/api/frames/${id}`;
  }
  // Lexical units use unified endpoint
  const baseUrl = `/api/lexical-units/${id}/graph`;
  return forUpdate ? `${baseUrl}?invalidate=true&t=${Date.now()}` : baseUrl;
}

/**
 * Shared hook for table page edit overlay functionality.
 * Handles all state management, API calls, and callbacks for editing entities.
 */
export function useTableEditOverlay(mode: Mode): UseTableEditOverlayReturn {
  const [isEditOverlayOpen, setIsEditOverlayOpen] = useState(false);
  const [currentEntity, setCurrentEntity] = useState<EntityData>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const handleEditClick = useCallback(async (entry: TableEntry | Frame) => {
    setIsEditOverlayOpen(true);
    setSelectedEntityId(entry.id);
    setCurrentEntity(null);
    setIsLoading(true);

    try {
      const response = await fetch(getApiEndpoint(mode, entry.id));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to fetch ${mode} entity:`, response.status, errorText);
        setIsEditOverlayOpen(false);
        return;
      }
      
      const data = await response.json();
      setCurrentEntity(data);
    } catch (error) {
      console.error(`Error loading ${mode} entity for editing:`, error);
      setIsEditOverlayOpen(false);
    } finally {
      setIsLoading(false);
    }
  }, [mode]);

  const handleUpdate = useCallback(async () => {
    // Trigger table refresh
    setRefreshTrigger(prev => prev + 1);

    // Reload current entity if we have one
    if (currentEntity) {
      try {
        const fetchOptions = mode !== 'frames' ? { cache: 'no-store' as RequestCache } : {};
        const response = await fetch(getApiEndpoint(mode, currentEntity.id, true), fetchOptions);
        
        if (response.ok) {
          const updatedEntity = await response.json();
          setCurrentEntity(updatedEntity);
        }
      } catch (error) {
        console.error(`Error reloading ${mode} entity:`, error);
      }
    }
  }, [mode, currentEntity]);

  const handleCloseOverlay = useCallback(() => {
    setIsEditOverlayOpen(false);
    setCurrentEntity(null);
    setSelectedEntityId('');
  }, []);

  return {
    isEditOverlayOpen,
    currentEntity,
    selectedEntityId,
    refreshTrigger,
    isLoading,
    handleEditClick,
    handleUpdate,
    handleCloseOverlay,
  };
}
