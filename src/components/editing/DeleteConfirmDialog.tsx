import React from 'react';
import { GraphNode, Frame } from '@/lib/types';
import { ConfirmDialog } from '@/components/ui';

interface DeleteConfirmDialogProps {
  node: GraphNode | Frame;
  isOpen: boolean;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmDialog({ node, isOpen, isDeleting, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  const hasChildren = 'children' in node && node.children.length > 0;
  const hasParents = 'parents' in node && node.parents.length > 0;

  const message = (
    <>
      <p className="text-sm text-gray-600 mb-4">
        Are you sure you want to delete <strong>{node.id}</strong>?
      </p>
      {hasChildren && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
          <p className="text-sm text-blue-600 font-medium mb-1">
            This entry has {node.children.length} hyponym{node.children.length !== 1 ? 's' : ''}:
          </p>
          <ul className="text-xs text-blue-600 list-disc list-inside max-h-32 overflow-y-auto">
            {node.children.slice(0, 5).map(child => (
              <li key={child.id}>{child.id}</li>
            ))}
            {node.children.length > 5 && (
              <li className="text-blue-600 italic">...and {node.children.length - 5} more</li>
            )}
          </ul>
          <p className="text-xs text-blue-600 mt-2">
            {hasParents ? (
              <>They will be reassigned to <strong>{node.parents[0].id}</strong></>
            ) : (
              <>They will become root nodes</>
            )}
          </p>
        </div>
      )}
    </>
  );

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onConfirm={onConfirm}
      onCancel={onCancel}
      title="Delete Entry"
      message={message}
      confirmLabel={isDeleting ? 'Deleting...' : 'Delete'}
      cancelLabel="Cancel"
      variant="danger"
      loading={isDeleting}
    />
  );
}
