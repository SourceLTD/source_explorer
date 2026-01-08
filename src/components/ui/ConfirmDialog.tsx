'use client';

import React from 'react';
import Modal from './Modal';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  /** Main message - can be a string or custom React content */
  message: string | React.ReactNode;
  /** Label for the confirm button */
  confirmLabel?: string;
  /** Label for the cancel button */
  cancelLabel?: string;
  /** Visual variant that affects confirm button styling */
  variant?: 'danger' | 'warning' | 'info' | 'success';
  /** Whether the confirm action is loading */
  loading?: boolean;
  /** Additional content to show between message and buttons */
  children?: React.ReactNode;
}

const VARIANT_STYLES: Record<string, string> = {
  danger: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
  warning: 'bg-orange-600 hover:bg-orange-700 focus:ring-orange-500',
  info: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
  success: 'bg-green-600 hover:bg-green-700 focus:ring-green-500',
};

export default function ConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  children,
}: ConfirmDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      maxWidth="md"
      preventClose={loading}
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 ${VARIANT_STYLES[variant]}`}
            disabled={loading}
          >
            {loading ? 'Loading...' : confirmLabel}
          </button>
        </div>
      }
    >
      <div className="p-6">
        {typeof message === 'string' ? (
          <p className="text-sm text-gray-600">{message}</p>
        ) : (
          message
        )}
        {children}
      </div>
    </Modal>
  );
}

