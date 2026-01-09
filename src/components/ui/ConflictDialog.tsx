'use client';

import React from 'react';
import { ExclamationTriangleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import Modal from './Modal';

export interface ConflictError {
  changeset_id: string;
  entity_type: string;
  entity_id: string | null;
  error: string;
  conflict?: {
    field_name: string;
    expected_value: unknown;
    current_value: unknown;
    proposed_value: unknown;
  };
}

export interface ConflictDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onDiscard: () => void;
  onRetry?: () => void;
  errors: ConflictError[];
  entityDisplay?: string;
  loading?: boolean;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(empty)';
  if (typeof value === 'string') return value || '(empty string)';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.join(', ') || '(empty array)';
  return JSON.stringify(value);
}

export default function ConflictDialog({
  isOpen,
  onClose,
  onDiscard,
  onRetry,
  errors,
  entityDisplay,
  loading = false,
}: ConflictDialogProps) {
  const primaryError = errors[0];
  const hasVersionConflict = primaryError?.conflict?.field_name === 'version';

  const customHeader = (
    <div className="flex items-center gap-3 w-full -mx-6 -my-4 px-6 py-4 bg-orange-50 border-b border-orange-200">
      <div className="p-2 rounded-lg bg-orange-100">
        <ExclamationTriangleIcon className="w-5 h-5 text-orange-600" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Version Conflict</h3>
        <p className="text-sm text-gray-600">
          This entity was modified while your changes were pending
        </p>
      </div>
    </div>
  );

  const footer = (
    <div className="flex justify-between items-center">
      <p className="text-xs text-gray-500">
        Discarding will remove these pending changes permanently
      </p>
      <div className="flex gap-3">
        <button
          onClick={onClose}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Keep Pending
        </button>
        <button
          onClick={onDiscard}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-xl hover:bg-orange-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Discarding...' : 'Discard Changes'}
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      customHeader={customHeader}
      showCloseButton={false}
      footer={footer}
      className="shadow-2xl"
      preventClose={loading}
    >
      <div className="p-6 space-y-4">
        {/* Entity Info */}
        {entityDisplay && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Entity:</span>
            <span className="font-medium text-gray-900 font-mono">{entityDisplay}</span>
            {primaryError?.entity_type && (
              <span className="px-2 py-0.5 text-xs font-semibold uppercase bg-gray-100 text-gray-600 rounded">
                {primaryError.entity_type}
              </span>
            )}
          </div>
        )}

        {/* Error Message */}
        <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
          <p className="text-sm text-orange-800">{primaryError?.error}</p>
        </div>

        {/* Version Conflict Details */}
        {hasVersionConflict && primaryError?.conflict && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">What happened</h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-xs text-gray-500 uppercase font-medium mb-1">
                  Version when you edited
                </div>
                <div className="text-lg font-mono font-semibold text-gray-700">
                  {formatValue(primaryError.conflict.expected_value)}
                </div>
              </div>
              <div className="p-3 bg-red-50 rounded-lg border border-red-200 relative">
                <div className="text-xs text-red-600 uppercase font-medium mb-1">
                  Current version
                </div>
                <div className="text-lg font-mono font-semibold text-red-700">
                  {formatValue(primaryError.conflict.current_value)}
                </div>
                <div className="absolute -left-2 top-1/2 -translate-y-1/2 text-gray-400">
                  <ArrowPathIcon className="w-4 h-4" />
                </div>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-xs text-blue-600 uppercase font-medium mb-1">
                  Your changes target
                </div>
                <div className="text-lg font-mono font-semibold text-blue-700">
                  {formatValue(primaryError.conflict.proposed_value)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Explanation */}
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-2">What should you do?</h4>
          <ul className="text-sm text-gray-600 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-orange-500 mt-0.5">•</span>
              <span>
                <strong>Discard Changes:</strong> Remove these pending changes. You can then re-edit the entity with the latest data.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-400 mt-0.5">•</span>
              <span>
                <strong>Keep Pending:</strong> Leave the changes as pending. They will remain in the list but cannot be committed until the conflict is resolved.
              </span>
            </li>
          </ul>
        </div>

        {/* Multiple errors */}
        {errors.length > 1 && (
          <div className="text-xs text-gray-500">
            + {errors.length - 1} additional error{errors.length > 2 ? 's' : ''}
          </div>
        )}
      </div>
    </Modal>
  );
}

