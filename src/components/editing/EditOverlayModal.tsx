import React from 'react';

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
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-50"
      onClick={(e) => {
        // Close only if clicking the backdrop directly
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}
      ></div>
      <div className="bg-white rounded-xl shadow-lg w-full max-w-5xl mx-4 max-h-[85vh] overflow-hidden relative z-10 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
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
          <div className="flex items-center gap-2">
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
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              title="Close (or press Escape)"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}

