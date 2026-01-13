import { useCallback } from 'react';
import { Mode } from '@/components/editing/types';

function getApiPrefix(mode: Mode): string {
  switch (mode) {
    case 'frames': return '/api/frames';
    case 'lexical_units':
    case 'verbs':
    case 'nouns':
    case 'adjectives':
    case 'adverbs':
    default:
      return '/api/lexical-units';
  }
}

export function useFieldValidation(mode: Mode) {
  const apiPrefix = getApiPrefix(mode);

  const findUniqueCode = useCallback(async (baseLemma: string, pos: string): Promise<string> => {
    // Start checking from .01
    for (let num = 1; num <= 99; num++) {
      const numStr = num.toString().padStart(2, '0');
      const candidateId = `${baseLemma}.${pos}.${numStr}`;
      
      try {
        const response = await fetch(`${apiPrefix}/${candidateId}`);
        if (!response.ok) {
          // ID doesn't exist, it's available
          return candidateId;
        }
      } catch {
        // Error fetching means it doesn't exist
        return candidateId;
      }
    }
    
    throw new Error('No available numeric suffix found (checked up to 99)');
  }, [apiPrefix]);

  const validateField = useCallback((field: string, value: unknown): string | null => {
    // Add any field-specific validation logic here
    // Returns error message or null if valid
    
    if (field === 'gloss' && typeof value === 'string' && value.trim().length === 0) {
      return 'Definition cannot be empty';
    }
    
    return null;
  }, []);

  return {
    findUniqueCode,
    validateField,
  };
}

