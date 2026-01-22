'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui';
import LoadingSpinner from '@/components/LoadingSpinner';
import { TableLexicalUnit, Frame } from '@/lib/types';
import { FlagModalState, FrameOption } from './types';

interface ExistingReason {
  id: string;
  reason: string;
  isFlagged?: boolean;
}

interface FlagModalProps {
  isOpen: boolean;
  modalState: FlagModalState;
  selectedCount: number;
  selectedEntriesOnPage: (TableLexicalUnit | Frame)[];
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onReasonChange: (reason: string) => void;
}

export function FlagModal({
  isOpen,
  modalState,
  selectedCount,
  selectedEntriesOnPage,
  isLoading,
  onClose,
  onConfirm,
  onReasonChange,
}: FlagModalProps) {
  if (!isOpen) return null;

  const hasMultiPageSelection = selectedCount > selectedEntriesOnPage.length;
  
  // Filter to only TableLexicalUnit items (frames don't have flagged/verifiable)
  const flaggableEntries = selectedEntriesOnPage.filter((e): e is TableLexicalUnit => 'flagged' in e);
  const existingReasons = {
    flagged: flaggableEntries
      .filter(e => e.flaggedReason)
      .map(e => ({ id: e.id, reason: e.flaggedReason!, isFlagged: e.flagged })),
    unverifiable: flaggableEntries
      .filter(e => e.verifiable === false && e.unverifiableReason)
      .map(e => ({ id: e.id, reason: e.unverifiableReason! }))
  };

  const modalTitle = 
    modalState.action === 'flag' ? 'Flag Entries' :
    modalState.action === 'unflag' ? 'Unflag Entries' :
    modalState.action === 'forbid' ? 'Mark as Unverifiable' :
    'Mark as Verifiable';

  const modalFooter = (
    <div className="flex justify-end gap-3">
      <button
        onClick={onClose}
        disabled={isLoading}
        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Cancel
      </button>
      <button
        onClick={onConfirm}
        disabled={isLoading}
        className={`px-4 py-2 text-sm font-medium rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
          modalState.action === 'flag' || modalState.action === 'unflag'
            ? 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500'
            : modalState.action === 'forbid'
            ? 'text-gray-900 focus:ring-red-300'
            : 'bg-green-600 hover:bg-green-700 text-white focus:ring-green-500'
        }`}
        style={modalState.action === 'forbid' ? {
          backgroundColor: '#ff8799',
          borderColor: '#ff8799'
        } : {}}
        onMouseEnter={(e) => {
          if (modalState.action === 'forbid' && !isLoading) {
            e.currentTarget.style.backgroundColor = '#ff6b81';
          }
        }}
        onMouseLeave={(e) => {
          if (modalState.action === 'forbid' && !isLoading) {
            e.currentTarget.style.backgroundColor = '#ff8799';
          }
        }}
      >
        {isLoading && <LoadingSpinner size="sm" noPadding className="!py-0" />}
        {isLoading ? 'Confirming...' : 'Confirm'}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={modalTitle}
      maxWidth="2xl"
      footer={modalFooter}
    >
      <div className="p-6">
        <p className="text-sm text-gray-600 mb-4">
          You are about to {
            modalState.action === 'forbid' ? 'mark' :
            modalState.action === 'allow' ? 'mark' :
            modalState.action
          } {selectedCount} {selectedCount === 1 ? 'entry' : 'entries'}{
            modalState.action === 'forbid' ? ' as unverifiable' :
            modalState.action === 'allow' ? ' as verifiable' :
            ''
          }.
        </p>

        {/* Warning for multi-page selections */}
        {hasMultiPageSelection && (
          <MultiPageWarning
            totalSelected={selectedCount}
            visibleCount={selectedEntriesOnPage.length}
            itemLabel="entry"
            itemLabelPlural="entries"
          />
        )}

        {/* Show existing reasons */}
        {modalState.action === 'unflag' && existingReasons.flagged.length > 0 && (
          <ExistingReasonsSection
            title="Existing AI Reasons:"
            reasons={existingReasons.flagged}
            bgColor="bg-orange-50"
            borderColor="border-orange-200"
            textColor="text-orange-900"
            itemTextColor="text-orange-800"
            idColor="text-orange-600"
          />
        )}

        {modalState.action === 'allow' && existingReasons.unverifiable.length > 0 && (
          <ExistingReasonsSection
            title="Existing Unverifiable Reasons:"
            reasons={existingReasons.unverifiable}
            bgColor="bg-gray-50"
            borderColor="border-gray-200"
            textColor="text-gray-900"
            itemTextColor="text-gray-800"
            idColor="text-gray-600"
          />
        )}

        {(modalState.action === 'flag' || modalState.action === 'forbid') && (
          <div className="mb-4">
            <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-2">
              Reason (optional)
            </label>
            <textarea
              id="reason"
              value={modalState.reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder={`Enter reason for ${modalState.action === 'flag' ? 'flagging' : 'marking as unverifiable'}...`}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={4}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

interface MultiPageWarningProps {
  totalSelected: number;
  visibleCount: number;
  itemLabel: string;
  itemLabelPlural: string;
}

function MultiPageWarning({ totalSelected, visibleCount, itemLabel, itemLabelPlural }: MultiPageWarningProps) {
  return (
    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl">
      <div className="flex items-start gap-2">
        <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="text-sm text-blue-600">
          <p className="font-medium">Multi-page selection detected</p>
          <p className="text-blue-600 mt-1">
            You have selected {totalSelected} {totalSelected === 1 ? itemLabel : itemLabelPlural} across multiple pages. 
            Only {visibleCount} {visibleCount === 1 ? 'is' : 'are'} visible on the current page. 
            The operation will affect all {totalSelected} selected {totalSelected === 1 ? itemLabel : itemLabelPlural}.
          </p>
        </div>
      </div>
    </div>
  );
}

interface ExistingReasonsSectionProps {
  title: string;
  reasons: ExistingReason[];
  bgColor: string;
  borderColor: string;
  textColor: string;
  itemTextColor: string;
  idColor: string;
}

function ExistingReasonsSection({
  title,
  reasons,
  bgColor,
  borderColor,
  textColor,
  itemTextColor,
  idColor,
}: ExistingReasonsSectionProps) {
  return (
    <div className={`mb-4 p-3 ${bgColor} border ${borderColor} rounded-xl`}>
      <h4 className={`text-sm font-medium ${textColor} mb-2`}>{title}</h4>
      <div className="space-y-2 max-h-32 overflow-y-auto">
        {reasons.map(({ id, reason, isFlagged }) => (
          <div key={id} className={`text-xs ${itemTextColor}`}>
            <span className={`font-mono ${idColor}`}>{id}:</span>{' '}
            <span className={isFlagged ? 'font-medium' : 'font-normal text-gray-500'}>
              {!isFlagged && <span className="italic">(not flagged) </span>}
              {reason}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface FrameChangeModalProps {
  isOpen: boolean;
  selectedCount: number;
  selectedEntriesOnCurrentPage: (TableLexicalUnit | Frame)[];
  frameOptions: FrameOption[];
  filteredFrameOptions: FrameOption[];
  frameOptionsLoading: boolean;
  frameOptionsError: string | null;
  selectedFrameValue: string;
  frameSearchQuery: string;
  isFrameUpdating: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onFrameValueChange: (value: string) => void;
  onSearchQueryChange: (query: string) => void;
  onClearError: () => void;
  onRetryLoad: () => void;
}

export function FrameChangeModal({
  isOpen,
  selectedCount,
  selectedEntriesOnCurrentPage,
  frameOptions,
  filteredFrameOptions,
  frameOptionsLoading,
  frameOptionsError,
  selectedFrameValue,
  frameSearchQuery,
  isFrameUpdating,
  onClose,
  onConfirm,
  onFrameValueChange,
  onSearchQueryChange,
  onClearError,
  onRetryLoad,
}: FrameChangeModalProps) {
  const hasMultiPageSelection = selectedCount > selectedEntriesOnCurrentPage.length;
  const [frameDropdownOpen, setFrameDropdownOpen] = useState(false);
  const frameDropdownContainerRef = useRef<HTMLDivElement>(null);
  
  const frameSummary = useMemo(() => {
    if (selectedEntriesOnCurrentPage.length === 0) return [];
    const counts = new Map<string, { label: string; count: number }>();
    // Only verbs have frame property
    const verbEntries = selectedEntriesOnCurrentPage.filter((e): e is TableLexicalUnit => 'frame' in e);
    verbEntries.forEach(entry => {
      const key = entry.frame ?? '__NONE__';
      const label = entry.frame ?? 'No frame assigned';
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, { label, count: 1 });
      }
    });
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [selectedEntriesOnCurrentPage]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!frameDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        frameDropdownContainerRef.current &&
        !frameDropdownContainerRef.current.contains(event.target as Node)
      ) {
        setFrameDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [frameDropdownOpen]);

  if (!isOpen) return null;

  const frameModalFooter = (
    <div className="flex justify-end gap-3">
      <button
        onClick={onClose}
        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isFrameUpdating}
      >
        Cancel
      </button>
      <button
        onClick={onConfirm}
        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isFrameUpdating || frameOptionsLoading || selectedFrameValue === ''}
      >
        {isFrameUpdating ? 'Applying...' : 'Apply Frame'}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={true}
      onClose={isFrameUpdating ? () => {} : onClose}
      title="Change Frame"
      subtitle={`You are about to update the frame for ${selectedCount} ${selectedCount === 1 ? 'entry' : 'entries'}.`}
      maxWidth="2xl"
      preventClose={isFrameUpdating}
      footer={frameModalFooter}
    >
      <div className="p-6 space-y-5">
        {/* Warning for multi-page selections */}
        {hasMultiPageSelection && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-600">
                <p className="font-medium">Multi-page selection</p>
                <p className="text-blue-600 mt-1">
                  You selected {selectedCount} verbs across multiple pages. 
                  The breakdown below shows only the {selectedEntriesOnCurrentPage.length} verbs on this page. 
                  All {selectedCount} verbs will be updated.
                </p>
              </div>
            </div>
          </div>
        )}

        {frameSummary.length > 0 && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
            <h4 className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">
              Current Frame Breakdown
            </h4>
            <ul className="space-y-1 text-sm text-blue-600">
              {frameSummary.map(({ label, count }) => (
                <li key={`${label}-${count}`} className="flex justify-between">
                  <span>{label}</span>
                  <span className="font-medium">{count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-2" ref={frameDropdownContainerRef}>
          <label htmlFor="frame-search" className="block text-sm font-medium text-gray-700">
            Frame ID
          </label>
          <div className="relative">
            <input
              id="frame-search"
              type="text"
              value={frameSearchQuery}
              onChange={(e) => {
                onClearError();
                onSearchQueryChange(e.target.value);
              }}
              onFocus={() => setFrameDropdownOpen(true)}
              placeholder="Search frames by id, code, or label..."
              disabled={isFrameUpdating}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 disabled:bg-gray-50"
            />

            {frameDropdownOpen && (
              <div className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto border border-gray-300 rounded-xl bg-white shadow-sm">
                {frameOptionsLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <LoadingSpinner size="sm" noPadding />
                  </div>
                ) : frameOptionsError ? (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 space-y-2 m-2">
                    <p>{frameOptionsError}</p>
                    <button
                      type="button"
                      onClick={onRetryLoad}
                      className="inline-flex items-center gap-1 px-3 py-1 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onFrameValueChange('__CLEAR__');
                        onSearchQueryChange('');
                        setFrameDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-gray-900">
                          No frame (clear existing frame)
                        </div>
                        {selectedFrameValue === '__CLEAR__' && (
                          <span className="text-xs text-blue-600 font-medium">Selected</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        Removes the frame assignment from all selected entries.
                      </div>
                    </button>

                    {filteredFrameOptions.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-500">No frames found</div>
                    ) : (
                      filteredFrameOptions.map(frame => {
                        const isSelected = selectedFrameValue === frame.id;
                        const displayValue = frame.code?.trim() || frame.label;
                        const dotIndex = displayValue.indexOf('.');
                        return (
                          <button
                            key={frame.id}
                            type="button"
                            onClick={() => {
                              onFrameValueChange(frame.id);
                              onSearchQueryChange('');
                              setFrameDropdownOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900 truncate">
                                  {dotIndex !== -1 ? (
                                    <>
                                      {displayValue.substring(0, dotIndex + 1)}
                                      <span className="font-bold">{displayValue.substring(dotIndex + 1)}</span>
                                    </>
                                  ) : (
                                    displayValue
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 font-mono truncate">
                                  {frame.id}{frame.code ? ` · ${frame.label}` : ''}
                                </div>
                              </div>
                              {isSelected && <span className="text-xs text-blue-600 font-medium">Selected</span>}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {!frameOptionsError && (
            <p className="text-xs text-gray-500">
              Selecting &quot;No frame&quot; will remove the frame assignment from all selected entries.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

