'use client';

import React from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

interface RevisionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  revisionCount?: number;
}

export function RevisionButton({ onClick, disabled, revisionCount }: RevisionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-700 border border-indigo-200 rounded-md bg-white hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed"
      title="Revise this changeset with AI"
    >
      <ArrowPathIcon className="w-4 h-4" />
      Revise
      {revisionCount != null && revisionCount > 1 && (
        <span className="ml-0.5 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-indigo-100 text-indigo-700">
          {revisionCount}
        </span>
      )}
    </button>
  );
}
