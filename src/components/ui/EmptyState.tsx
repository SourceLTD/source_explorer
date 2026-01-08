'use client';

import React from 'react';

export interface EmptyStateProps {
  /** Custom icon to display - defaults to a document icon */
  icon?: React.ReactNode;
  /** Main title text */
  title: string;
  /** Optional description text */
  description?: string;
  /** Optional action button or element */
  action?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

// Default document icon used when no icon is provided
const DefaultIcon = () => (
  <svg
    className="h-24 w-24 mx-auto mb-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    />
  </svg>
);

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`px-4 py-12 text-center ${className}`}>
      <div className="text-gray-400">
        {icon || <DefaultIcon />}
        <p className="text-lg">{title}</p>
        {description && <p className="text-sm mt-2">{description}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

