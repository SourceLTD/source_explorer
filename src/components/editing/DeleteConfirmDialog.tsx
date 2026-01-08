import React from 'react';
import { GraphNode, Frame } from '@/lib/types';

interface DeleteConfirmDialogProps {
  node: GraphNode | Frame;
  isOpen: boolean;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog({ node, isOpen, isDeleting, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center z-20">
      <div 
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onCancel}
      ></div>
      <div className="bg-white rounded-xl p-6 max-w-md mx-4 relative z-30">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Entry</h3>
        <p className="text-sm text-gray-600 mb-4">
          Are you sure you want to delete <strong>{node.id}</strong>?
        </p>
        {'children' in node && node.children.length > 0 && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
            <p className="text-sm text-blue-900 font-medium mb-1">
              This entry has {node.children.length} hyponym{node.children.length !== 1 ? 's' : ''}:
            </p>
            <ul className="text-xs text-blue-800 list-disc list-inside max-h-32 overflow-y-auto">
              {node.children.slice(0, 5).map(child => (
                <li key={child.id}>{child.id}</li>
              ))}
              {node.children.length > 5 && (
                <li className="text-blue-600 italic">...and {node.children.length - 5} more</li>
              )}
            </ul>
            <p className="text-xs text-blue-700 mt-2">
              {'parents' in node && node.parents.length > 0 ? (
                <>They will be reassigned to <strong>{node.parents[0].id}</strong></>
              ) : (
                <>They will become root nodes</>
              )}
            </p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors cursor-pointer disabled:cursor-not-allowed"
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

