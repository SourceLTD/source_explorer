'use client';

import React, { useEffect, useCallback } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '5xl';
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerActions?: React.ReactNode;
  preventClose?: boolean;
  className?: string;
  /** Custom header content - replaces default title/subtitle rendering */
  customHeader?: React.ReactNode;
  /** Whether to show the close button in the header */
  showCloseButton?: boolean;
  /** Additional classes for the content area */
  contentClassName?: string;
  /** Whether the content should be scrollable */
  scrollable?: boolean;
}

const MAX_WIDTH_CLASSES: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
};

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  maxWidth = '2xl',
  children,
  footer,
  headerActions,
  preventClose = false,
  className = '',
  customHeader,
  showCloseButton = true,
  contentClassName = '',
  scrollable = true,
}: ModalProps) {
  // Handle escape key
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !preventClose) {
        onClose();
      }
    },
    [onClose, preventClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  const handleBackdropClick = () => {
    if (!preventClose) {
      onClose();
    }
  };

  const hasHeader = customHeader || title || headerActions || showCloseButton;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}
        onClick={handleBackdropClick}
      />

      {/* Modal Container */}
      <div
        className={`bg-white rounded-xl ${MAX_WIDTH_CLASSES[maxWidth]} w-full mx-4 max-h-[90vh] overflow-hidden relative z-10 flex flex-col ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {hasHeader && (
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
            {customHeader ? (
              customHeader
            ) : (
              <div className="flex-1">
                {title && (
                  <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                )}
                {subtitle && (
                  <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              {headerActions}
              {showCloseButton && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!preventClose) {
                      onClose();
                    }
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                  title="Close (or press Escape)"
                  disabled={preventClose}
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div
          className={`${scrollable ? 'overflow-y-auto' : ''} flex-1 ${contentClassName}`}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

