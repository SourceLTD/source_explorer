import React from 'react';
import { FlagIcon } from '@heroicons/react/24/outline';

interface FlagButtonsProps {
  flagged: boolean;
  verifiable: boolean;
  onFlagToggle: () => void;
  onVerifiableToggle: () => void;
}

export function FlagButtons({ flagged, verifiable, onFlagToggle, onVerifiableToggle }: FlagButtonsProps) {
  return (
    <div className="border-b border-gray-200 bg-gray-50">
      <div className="px-6 py-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Flagging</h4>
        <div className="flex items-center gap-2">
          <button
            onClick={onFlagToggle}
            className={`flex items-center gap-1 px-3 py-1 text-sm font-medium border rounded-xl transition-colors cursor-pointer ${
              flagged 
                ? 'text-blue-700 bg-blue-100 border-blue-200 hover:bg-blue-200' 
                : 'text-gray-700 bg-gray-100 border-gray-200 hover:bg-gray-200'
            }`}
          >
            <FlagIcon className="w-4 h-4" />
            {flagged ? 'Unflag' : 'Flag'}
          </button>
          <button
            onClick={onVerifiableToggle}
            className={`flex items-center gap-1 px-3 py-1 text-sm font-medium border rounded-xl transition-colors cursor-pointer ${
              !verifiable 
                ? 'text-gray-700 bg-gray-200 border-gray-300 hover:bg-gray-300' 
                : 'text-gray-700 bg-gray-100 border-gray-200 hover:bg-gray-200'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {verifiable ? 'Mark Unverifiable' : 'Mark Verifiable'}
          </button>
        </div>
      </div>
    </div>
  );
}

