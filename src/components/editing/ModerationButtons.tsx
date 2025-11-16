import React from 'react';

interface ModerationButtonsProps {
  flagged: boolean;
  forbidden: boolean;
  onFlagToggle: () => void;
  onForbidToggle: () => void;
}

export function ModerationButtons({ flagged, forbidden, onFlagToggle, onForbidToggle }: ModerationButtonsProps) {
  return (
    <div className="border-b border-gray-200 bg-gray-50">
      <div className="px-6 py-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Moderation</h4>
        <div className="flex items-center gap-2">
          <button
            onClick={onFlagToggle}
            className={`flex items-center gap-1 px-3 py-1 text-sm font-medium border rounded-md transition-colors cursor-pointer ${
              flagged 
                ? 'text-orange-700 bg-orange-100 border-orange-200 hover:bg-orange-200' 
                : 'text-gray-700 bg-gray-100 border-gray-200 hover:bg-gray-200'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 2H21l-3 6 3 6h-8.5l-1-2H5a2 2 0 00-2 2zm9-13.5V9" />
            </svg>
            {flagged ? 'Unflag' : 'Flag'}
          </button>
          <button
            onClick={onForbidToggle}
            className={`flex items-center gap-1 px-3 py-1 text-sm font-medium border rounded-md transition-colors cursor-pointer ${
              forbidden 
                ? 'text-red-700 bg-red-100 border-red-200 hover:bg-red-200' 
                : 'text-gray-700 bg-gray-100 border-gray-200 hover:bg-gray-200'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
            </svg>
            {forbidden ? 'Allow' : 'Forbid'}
          </button>
        </div>
      </div>
    </div>
  );
}

