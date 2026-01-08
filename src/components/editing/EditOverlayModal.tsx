import React from 'react';
import { Modal } from '@/components/ui';

interface EditOverlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodeId: string;
  validationMessage?: string;
  onDelete: () => void;
  children: React.ReactNode;
}

export function EditOverlayModal({ 
  isOpen, 
  onClose, 
  nodeId, 
  validationMessage, 
  onDelete, 
  children 
}: EditOverlayModalProps) {
  const customHeader = (
    <div className="flex-1">
      <h3 className="text-lg font-semibold text-gray-900">Edit Entry</h3>
      <div className="flex items-center gap-2 mt-1">
        <p className="text-sm text-gray-600">{nodeId}</p>
        {validationMessage && (
          <span className="text-xs text-green-600 font-medium">
            {validationMessage}
          </span>
        )}
      </div>
    </div>
  );

  const headerActions = (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onDelete();
      }}
      className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors cursor-pointer"
      title="Delete Entry"
    >
      Delete
    </button>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="5xl"
      customHeader={customHeader}
      headerActions={headerActions}
      className="max-h-[85vh]"
    >
      {children}
    </Modal>
  );
}
