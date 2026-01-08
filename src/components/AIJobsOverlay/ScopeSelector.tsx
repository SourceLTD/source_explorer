import { memo } from 'react';
import BooleanFilterBuilder from '@/components/BooleanFilterBuilder';
import type { BooleanFilterGroup } from '@/lib/filters/types';
import type { ScopeMode } from './types';
import { getManualIdPlaceholder } from './utils';

export const ScopeSelector = memo(function ScopeSelector({
  mode,
  setMode,
  selectedCount,
  manualIdsText,
  frameIdsText,
  selectionDisabled,
  manualIdInputRef,
  frameIdInputRef,
  showManualIdMenu,
  manualIdSuggestions,
  manualIdMenuPosition,
  insertManualId,
  showFrameIdMenu,
  frameIdSuggestions,
  frameIdMenuPosition,
  insertFrameId,
  handleManualIdChange,
  handleManualIdKeyDown,
  handleFrameIdChange,
  handleFrameIdKeyDown,
  validatedManualIds,
  validatedFrameIds,
  manualIds,
  frameIds,
  pos,
  manualIdActiveIndex,
  frameIdActiveIndex,
  filterGroup,
  onFilterGroupChange,
  filterLimit,
  onFilterLimitChange,
  filterValidateLoading,
  filterValidateError,
  filterValidateCount,
  filterValidateSample,
  onValidateFilters,
  frameIncludeVerbs,
  onFrameIncludeVerbsChange,
  frameFlagTarget,
  onFrameFlagTargetChange,
}: {
  mode: ScopeMode;
  setMode: (mode: ScopeMode) => void;
  selectedCount: number;
  manualIdsText: string;
  frameIdsText: string;
  selectionDisabled: boolean;
  manualIdInputRef: React.RefObject<HTMLTextAreaElement>;
  frameIdInputRef: React.RefObject<HTMLTextAreaElement>;
  showManualIdMenu: boolean;
  manualIdSuggestions: Array<{ code: string; gloss: string }>;
  manualIdMenuPosition: { top: number; left: number };
  insertManualId: (code: string) => void;
  showFrameIdMenu: boolean;
  frameIdSuggestions: Array<{ id: string; frame_name: string }>;
  frameIdMenuPosition: { top: number; left: number };
  insertFrameId: (id: string) => void;
  handleManualIdChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleManualIdKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handleFrameIdChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleFrameIdKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  validatedManualIds: Set<string>;
  validatedFrameIds: Set<string>;
  manualIds: string[];
  frameIds: string[];
  pos: 'verbs' | 'nouns' | 'adjectives' | 'adverbs' | 'frames';
  manualIdActiveIndex: number;
  frameIdActiveIndex: number;
  filterGroup: BooleanFilterGroup;
  onFilterGroupChange: (g: BooleanFilterGroup) => void;
  filterLimit: number;
  onFilterLimitChange: (n: number) => void;
  filterValidateLoading: boolean;
  filterValidateError: string | null;
  filterValidateCount: number | null;
  filterValidateSample: Array<{ code: string; gloss: string }>;
  onValidateFilters: () => void;
  frameIncludeVerbs?: boolean;
  onFrameIncludeVerbsChange?: (include: boolean) => void;
  frameFlagTarget?: 'frame' | 'verb' | 'both';
  onFrameFlagTargetChange?: (target: 'frame' | 'verb' | 'both') => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
      <div className="text-xs font-semibold text-gray-700">Scope</div>
      <div className="space-y-2">
        <label className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${mode === 'selection' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
          <input
            type="radio"
            name="scope"
            value="selection"
            disabled={selectionDisabled}
            checked={mode === 'selection'}
            onChange={() => setMode('selection')}
            className="mt-1"
          />
          <div>
            <div className="text-sm font-medium text-gray-800">Selected rows ({selectedCount})</div>
            <p className="text-xs text-gray-500">Use the currently selected table entries.</p>
            {selectionDisabled && <p className="text-xs text-red-500">Select rows in the table to enable this option.</p>}
          </div>
        </label>

        <label className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${mode === 'all' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
          <input
            type="radio"
            name="scope"
            value="all"
            checked={mode === 'all'}
            onChange={() => setMode('all')}
            className="mt-1"
          />
          <div>
            <div className="text-sm font-medium text-gray-800">All {pos}</div>
            <p className="text-xs text-gray-500">Target all {pos}. Preview shows the first entry.</p>
          </div>
        </label>

        <label className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${mode === 'filters' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
          <input
            type="radio"
            name="scope"
            value="filters"
            checked={mode === 'filters'}
            onChange={() => setMode('filters')}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-800">Filters (advanced)</div>
            <p className="text-xs text-gray-500">Build boolean conditions with AND/OR. Leave empty to target all.</p>
            {mode === 'filters' && (
              <div className="mt-2 space-y-2">
                <BooleanFilterBuilder pos={pos} value={filterGroup} onChange={onFilterGroupChange} />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-600">Limit</label>
                  <input
                    type="number"
                    min={0}
                    value={filterLimit}
                    onChange={e => onFilterLimitChange(Number(e.target.value))}
                    className="w-24 rounded border border-gray-300 px-2 py-1 text-xs text-gray-800"
                  />
                  <button
                    onClick={onValidateFilters}
                    className="cursor-pointer rounded-xl border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                    type="button"
                  >
                    {filterValidateLoading ? 'Validating…' : 'Validate filters'}
                  </button>
                </div>
                {(filterValidateError || filterValidateCount !== null) && (
                  <div className="rounded border border-gray-200 bg-gray-50 p-2">
                    {filterValidateError && (
                      <div className="text-xs text-red-600">{filterValidateError}</div>
                    )}
                    {filterValidateCount !== null && !filterValidateError && (
                      <div className="text-xs text-gray-700">
                        {filterValidateCount} {pos} will be examined.
                        {filterValidateSample.length > 0 && (
                          <div className="mt-1">
                            <div className="font-medium">Preview (up to 5):</div>
                            <ul className="list-disc pl-5">
                              {filterValidateSample.map(s => (
                                <li key={s.code} className="text-gray-700">
                                  <span className="font-mono font-semibold">{s.code}</span>
                                  <span className="ml-2 text-gray-600">{s.gloss}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </label>

        <label className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${mode === 'manual' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
          <input
            type="radio"
            name="scope"
            value="manual"
            checked={mode === 'manual'}
            onChange={() => setMode('manual')}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-800">Manual IDs</div>
            <p className="text-xs text-gray-500">Paste lexical IDs separated by commas, spaces, or new lines.</p>
            {mode === 'manual' && (
              <div className="relative mt-2">
                <textarea
                  ref={manualIdInputRef}
                  value={manualIdsText}
                  onChange={handleManualIdChange}
                  onKeyDown={handleManualIdKeyDown}
                  rows={3}
                  className="w-full rounded-xl border border-gray-300 px-2 py-1 text-xs text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder={getManualIdPlaceholder(pos)}
                />
                {showManualIdMenu && manualIdSuggestions.length > 0 && (
                  <div
                    className="fixed z-10 max-h-48 w-60 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg"
                    style={{ top: `${manualIdMenuPosition.top}px`, left: `${manualIdMenuPosition.left}px` }}
                  >
                    <ul>
                      {manualIdSuggestions.map((suggestion, idx) => (
                        <li key={suggestion.code}>
                          <button
                            onClick={() => insertManualId(suggestion.code)}
                            className={`cursor-pointer flex w-full flex-col items-start px-3 py-2 text-left text-xs hover:bg-blue-50 ${idx === manualIdActiveIndex ? 'bg-blue-50' : ''}`}
                            type="button"
                          >
                            <span className="font-semibold text-gray-800">{suggestion.code}</span>
                            <span className="text-[11px] text-gray-500">{suggestion.gloss}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {manualIds.length > 0 && (
                  <div className="mt-1 space-y-1">
                    {manualIds.map(id => (
                      <div key={id} className="flex items-center gap-1 text-[11px]">
                        <span className={validatedManualIds.has(id) ? 'text-green-600' : 'text-red-600'}>
                          {validatedManualIds.has(id) ? '✓' : '✗'}
                        </span>
                        <span className={validatedManualIds.has(id) ? 'text-gray-700' : 'text-red-600'}>{id}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </label>

        {/* Frame IDs scope - only for verbs and frames */}
        {(pos === 'verbs' || pos === 'frames') && (
          <label className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${mode === 'frames' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
          <input
            type="radio"
            name="scope"
            value="frames"
            checked={mode === 'frames'}
            onChange={() => setMode('frames')}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-800">Frame IDs</div>
            <p className="text-xs text-gray-500">Enter frame names or numeric IDs only.</p>
            {mode === 'frames' && (
              <div className="relative mt-2 space-y-3">
                <textarea
                  ref={frameIdInputRef}
                  value={frameIdsText}
                  onChange={handleFrameIdChange}
                  onKeyDown={handleFrameIdKeyDown}
                  rows={2}
                  className="w-full rounded-xl border border-gray-300 px-2 py-1 text-xs text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g., Communication, 1023"
                />
                {showFrameIdMenu && frameIdSuggestions.length > 0 && (
                  <div
                    className="fixed z-10 max-h-48 w-60 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg"
                    style={{ top: `${frameIdMenuPosition.top}px`, left: `${frameIdMenuPosition.left}px` }}
                  >
                    <ul>
                      {frameIdSuggestions.map((suggestion, idx) => (
                        <li key={suggestion.id}>
                          <button
                            onClick={() => insertFrameId(suggestion.frame_name)}
                            className={`cursor-pointer flex w-full flex-col items-start px-3 py-2 text-left text-xs hover:bg-blue-50 ${idx === frameIdActiveIndex ? 'bg-blue-50' : ''}`}
                            type="button"
                          >
                            <span className="font-semibold text-gray-800">{suggestion.frame_name}</span>
                            <span className="text-[11px] text-gray-500">ID: {suggestion.id}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {frameIds.length > 0 && (
                  <div className="mt-1 space-y-1">
                    {frameIds.map(id => (
                      <div key={id} className="flex items-center gap-1 text-[11px]">
                        <span className={validatedFrameIds.has(id) ? 'text-green-600' : 'text-red-600'}>
                          {validatedFrameIds.has(id) ? '✓' : '✗'}
                        </span>
                        <span className={validatedFrameIds.has(id) ? 'text-gray-700' : 'text-red-600'}>{id}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Frames-specific controls (only when pos='frames') */}
                {pos === 'frames' && (
                  <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="frameIncludeVerbs"
                        checked={frameIncludeVerbs ?? false}
                        onChange={(e) => onFrameIncludeVerbsChange?.(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="frameIncludeVerbs" className="text-xs font-medium text-gray-800">
                        Include associated verbs in scope
                      </label>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-gray-800">What to flag:</div>
                      <div className="space-y-1">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="frameFlagTarget"
                            value="verb"
                            checked={frameFlagTarget === 'verb'}
                            onChange={() => onFrameFlagTargetChange?.('verb')}
                            className="text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-xs text-gray-700">Verbs only</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="frameFlagTarget"
                            value="frame"
                            checked={frameFlagTarget === 'frame'}
                            onChange={() => onFrameFlagTargetChange?.('frame')}
                            className="text-blue-600 focus:ring-blue-500"
                            disabled={true}
                          />
                          <span className="text-xs text-gray-500">Frame only (not supported yet)</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="frameFlagTarget"
                            value="both"
                            checked={frameFlagTarget === 'both'}
                            onChange={() => onFrameFlagTargetChange?.('both')}
                            className="text-blue-600 focus:ring-blue-500"
                            disabled={true}
                          />
                          <span className="text-xs text-gray-500">Both frame and verbs (not supported yet)</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </label>
        )}

      </div>
    </div>
  );
});

