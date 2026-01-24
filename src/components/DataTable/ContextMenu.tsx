'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FlagIcon } from '@heroicons/react/24/outline';
import { TableEntry, Frame } from '@/lib/types';
import { DataTableMode, getGraphBasePath } from './config';
import { ContextMenuState } from './types';

interface ContextMenuProps {
  contextMenu: ContextMenuState;
  entry: TableEntry | Frame | null;
  mode: DataTableMode;
  onClose: () => void;
  onAction: (action: 'flag' | 'unflag' | 'forbid' | 'allow') => void;
}

export function ContextMenu({
  contextMenu,
  entry,
  mode,
  onClose,
  onAction,
}: ContextMenuProps) {
  const router = useRouter();
  const graphBasePath = getGraphBasePath(mode);
  const [isNavigating, setIsNavigating] = useState(false);

  if (!contextMenu.isOpen || !contextMenu.unitId || !entry) {
    return null;
  }

  // Check if entry is a Frame
  const isFrameEntry = (mode === 'frames' || mode === 'super_frames' || mode === 'frames_only') && 'label' in entry;
  const frameEntry = isFrameEntry ? entry as Frame : null;
  const tableEntry = !isFrameEntry ? entry as TableEntry : null;

  const handleOpenInGraph = () => {
    onClose();
    // For frames, navigate to the frame ID; for entries, navigate to the entry itself
    const targetId = frameEntry ? frameEntry.id : (tableEntry?.id || '');
    router.push(`${graphBasePath}?entry=${targetId}`);
  };

  const handleViewLexicalEntries = () => {
    onClose();
    if (frameEntry) {
      router.push(`/table?frame_id=${frameEntry.id}`);
    }
  };

  const handleViewSubframes = () => {
    onClose();
    if (frameEntry) {
      // Navigate to the frames table filtered by super_frame_id
      router.push(`/table/frames?super_frame_id=${frameEntry.id}`);
    }
  };

  const handleExploreSuperframe = async () => {
    if (!frameEntry?.super_frame_id) return;
    setIsNavigating(true);
    
    try {
      const res = await fetch(`/api/frames/find-page?id=${frameEntry.super_frame_id}&limit=100`);
      const { page } = await res.json();
      onClose();
      // Navigate with sortBy=code to match the page calculation
      router.push(`/table/super-frames?page=${page}&sortBy=code&sortOrder=asc&highlightId=${frameEntry.super_frame_id}`);
    } catch (error) {
      console.error('Error finding superframe page:', error);
      onClose();
      // Fallback: navigate to first page with highlight and code sort
      router.push(`/table/super-frames?sortBy=code&sortOrder=asc&highlightId=${frameEntry.super_frame_id}`);
    } finally {
      setIsNavigating(false);
    }
  };

  const handleAction = (action: 'flag' | 'unflag' | 'forbid' | 'allow') => {
    onAction(action);
  };

  return (
    <div
      className="fixed bg-white rounded-xl border border-gray-200 py-1 z-50 min-w-48"
      style={{
        left: `${contextMenu.x}px`,
        top: `${contextMenu.y}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Entry info header */}
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
        {frameEntry ? (
          <>
            <div className="text-xs font-mono text-blue-600">{frameEntry.id}</div>
            <div className="text-xs text-gray-600 mt-1 truncate max-w-xs">
              {frameEntry.label}
            </div>
          </>
        ) : tableEntry ? (
          <>
            <div className="text-xs font-mono text-blue-600">{tableEntry.id}</div>
            <div className="text-xs text-gray-600 mt-1 truncate max-w-xs">
              {tableEntry.gloss.substring(0, 50)}{tableEntry.gloss.length > 50 ? '...' : ''}
            </div>
          </>
        ) : null}
      </div>

      {/* Menu items */}
      <div className="py-1">
        {frameEntry && (
          <button
            onClick={handleOpenInGraph}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Open in Graph Mode
          </button>
        )}

        {frameEntry && (
          <>
            {mode === 'super_frames' ? (
              <button
                onClick={handleViewSubframes}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                View Child Frames
              </button>
            ) : (
              <>
                <button
                  onClick={handleViewLexicalEntries}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                  View Lexical Entries
                </button>
                {frameEntry.super_frame_id && (
                  <button
                    onClick={handleExploreSuperframe}
                    disabled={isNavigating}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 flex items-center gap-2 disabled:opacity-50 disabled:cursor-wait"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                    </svg>
                    {isNavigating ? 'Finding...' : 'Explore Superframe'}
                  </button>
                )}
              </>
            )}
          </>
        )}

        {/* Only show flag actions for table entries, not frames */}
        {tableEntry && (
          <>
            <div className="border-t border-gray-200 my-1"></div>

            {!tableEntry.flagged ? (
              <button
                onClick={() => handleAction('flag')}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-800 flex items-center gap-2"
              >
                <FlagIcon className="w-4 h-4" />
                Flag Entry
              </button>
            ) : (
              <button
                onClick={() => handleAction('unflag')}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Unflag Entry
              </button>
            )}

            {tableEntry.verifiable !== false ? (
              <button
                onClick={() => handleAction('forbid')}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
                </svg>
                Mark as Unverifiable
              </button>
            ) : (
              <button
                onClick={() => handleAction('allow')}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-green-50 hover:text-green-800 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Allow Entry
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

