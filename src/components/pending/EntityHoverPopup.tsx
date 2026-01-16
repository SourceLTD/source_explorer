import React, { useState, useRef, useEffect } from 'react';
import FocusEntityCard from './FocusEntityCard';

type JsonRecord = Record<string, unknown>;

interface EntityHoverPopupProps {
  entityType: string;
  entityId: string | null;
  beforeSnapshot: JsonRecord | null;
  afterSnapshot: JsonRecord | null;
  operation: 'create' | 'update' | 'delete';
  fieldChanges?: any[];
  children: React.ReactNode;
}

function applyPreviewSnapshot(
  operation: 'create' | 'update' | 'delete',
  beforeSnapshot: JsonRecord | null,
  afterSnapshot: JsonRecord | null,
  fieldChanges: any[]
): { current: JsonRecord | null; preview: JsonRecord | null } {
  if (operation === 'create') {
    return { current: null, preview: afterSnapshot ? { ...afterSnapshot } : null };
  }
  if (operation === 'delete') {
    return { current: beforeSnapshot ? { ...beforeSnapshot } : null, preview: null };
  }

  const current = beforeSnapshot ? { ...beforeSnapshot } : {};
  const preview: JsonRecord = { ...current };

  for (const fc of fieldChanges) {
    if (fc.status !== 'pending' && fc.status !== 'approved') continue;
    if (fc.field_name.includes('.')) continue;
    preview[fc.field_name] = fc.new_value;
  }

  return { current, preview };
}

export default function EntityHoverPopup({
  entityType,
  entityId,
  beforeSnapshot,
  afterSnapshot,
  operation,
  fieldChanges = [],
  children,
}: EntityHoverPopupProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { current, preview } = applyPreviewSnapshot(
    operation,
    beforeSnapshot,
    afterSnapshot,
    fieldChanges
  );

  const summarySnapshot = operation === 'create' ? preview : current;

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      
      // Position the popup below the trigger using viewport-relative coordinates
      setPosition({
        top: rect.bottom + 8,
        left: rect.left,
      });
    }
    
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 150);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div 
      ref={triggerRef}
      className="inline-block relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      
      {isVisible && summarySnapshot && (
        <div 
          ref={popupRef}
          style={{ 
            position: 'fixed',
            top: `${position.top}px`,
            left: `${position.left}px`,
            zIndex: 9999,
          }}
          className="w-80 pointer-events-auto"
          onMouseEnter={() => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            setIsVisible(true);
          }}
          onMouseLeave={handleMouseLeave}
        >
          <FocusEntityCard
            entityType={entityType}
            entityId={entityId}
            summarySnapshot={summarySnapshot}
            className="shadow-xl border-blue-100 border-2"
          />
        </div>
      )}
    </div>
  );
}
