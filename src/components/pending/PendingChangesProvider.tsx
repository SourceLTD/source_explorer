'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type PendingChangesContextType = {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
};

const PendingChangesContext = createContext<PendingChangesContextType | null>(null);

export function PendingChangesProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'p') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <PendingChangesContext.Provider value={{ isOpen, setIsOpen }}>
      {children}
    </PendingChangesContext.Provider>
  );
}

export function usePendingChangesContext() {
  const ctx = useContext(PendingChangesContext);
  if (!ctx) throw new Error('usePendingChangesContext must be used within PendingChangesProvider');
  return ctx;
}
