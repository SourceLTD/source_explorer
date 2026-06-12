import { memo, useMemo } from 'react';
import BooleanFilterBuilder from '@/components/BooleanFilterBuilder';
import type { BooleanFilterGroup } from '@/lib/filters/types';
import type { ScopeMode } from './types';
import { getManualIdPlaceholder } from './utils';
import type { DataTableMode } from '../DataTable/types';

// Normalize DataTableMode to the simpler Pos type used by BooleanFilterBuilder
type FilterBuilderPos = 'verbs' | 'nouns' | 'adjectives' | 'adverbs' | 'concepts' | 'lexical_units';
function normalizeToFilterPos(mode: DataTableMode): FilterBuilderPos {
  return mode as FilterBuilderPos;
}

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
  showConceptIdMenu,
  frameIdSuggestions,
  frameIdMenuPosition,
  insertConceptId,
  handleManualIdChange,
  handleManualIdKeyDown,
  handleConceptIdChange,
  handleConceptIdKeyDown,
  validatedManualIds,
  validatedConceptIds,
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
  frameIncludeLexicalUnits,
  onConceptIncludeLexicalUnitsChange,
  frameFlagTarget,
  onConceptFlagTargetChange,
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
  showConceptIdMenu: boolean;
  frameIdSuggestions: Array<{ id: string; label: string }>;
  frameIdMenuPosition: { top: number; left: number };
  insertConceptId: (id: string) => void;
  handleManualIdChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleManualIdKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handleConceptIdChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleConceptIdKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  validatedManualIds: Set<string>;
  validatedConceptIds: Set<string>;
  manualIds: string[];
  frameIds: string[];
  pos: DataTableMode;
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
  frameIncludeLexicalUnits?: boolean;
  onConceptIncludeLexicalUnitsChange?: (include: boolean) => void;
  frameFlagTarget?: 'concept' | 'lexical_unit' | 'both';
  onConceptFlagTargetChange?: (target: 'concept' | 'lexical_unit' | 'both') => void;
}) {
  return (
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
                <BooleanFilterBuilder pos={normalizeToFilterPos(pos)} value={filterGroup} onChange={onFilterGroupChange} />
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
            <div className="text-sm font-medium text-gray-800">Codes</div>
            <p className="text-xs text-gray-500">Paste codes separated by commas, spaces, or new lines.</p>
            {mode === 'manual' && (
              <div className="relative mt-2">
                <textarea
                  ref={manualIdInputRef}
                  value={manualIdsText}
                  onChange={handleManualIdChange}
                  onKeyDown={handleManualIdKeyDown}
                  rows={3}
                  className="w-full rounded-xl border border-gray-300 px-2 py-1 text-xs text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  style={{ scrollbarGutter: 'stable' }}
                  placeholder={getManualIdPlaceholder(pos)}
                />
                {showManualIdMenu && manualIdSuggestions.length > 0 && (
                  <div
                    className="fixed z-10 max-h-48 w-80 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg"
                    style={{ top: `${manualIdMenuPosition.top + 16}px`, left: `${manualIdMenuPosition.left}px` }}
                  >
                    <ul>
                      {manualIdSuggestions.map((suggestion, idx) => {
                        const isConceptMode = pos === 'concepts';
                        return (
                          <li key={suggestion.code}>
                            <button
                              onClick={() => insertManualId(suggestion.code)}
                              className={`cursor-pointer flex w-full flex-col items-start px-3 py-2 text-left text-xs hover:bg-blue-50 ${idx === manualIdActiveIndex ? 'bg-blue-50' : ''}`}
                              type="button"
                            >
                              <span className="font-semibold text-gray-800">{suggestion.code}</span>
                              <span className="text-[11px] text-gray-500 font-mono">
                                {isConceptMode ? `ID: ${suggestion.gloss}` : suggestion.gloss}
                              </span>
                            </button>
                          </li>
                        );
                      })}
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

        {/* Concept IDs scope - only for lexical_units and concepts */}
        {(pos === 'lexical_units' || pos === 'concepts') && (
          <label className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${mode === 'concepts' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
          <input
            type="radio"
            name="scope"
            value="concepts"
            checked={mode === 'concepts'}
            onChange={() => setMode('concepts')}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-800">Concept IDs</div>
            <p className="text-xs text-gray-500">Enter concept names or numeric IDs only.</p>
            {mode === 'concepts' && (
              <div className="relative mt-2 space-y-3">
                <textarea
                  ref={frameIdInputRef}
                  value={frameIdsText}
                  onChange={handleConceptIdChange}
                  onKeyDown={handleConceptIdKeyDown}
                  rows={2}
                  className="w-full rounded-xl border border-gray-300 px-2 py-1 text-xs text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  style={{ scrollbarGutter: 'stable' }}
                  placeholder="e.g., Communication, 1023"
                />
                {showConceptIdMenu && frameIdSuggestions.length > 0 && (
                  <div
                    className="fixed z-10 max-h-48 w-60 overflow-y-auto rounded-xl border border-gray-200 bg-white"
                    style={{ top: `${frameIdMenuPosition.top}px`, left: `${frameIdMenuPosition.left}px` }}
                  >
                    <ul>
                      {frameIdSuggestions.map((suggestion, idx) => (
                        <li key={suggestion.id}>
                          <button
                            onClick={() => insertConceptId(suggestion.label)}
                            className={`cursor-pointer flex w-full flex-col items-start px-3 py-2 text-left text-xs hover:bg-blue-50 ${idx === frameIdActiveIndex ? 'bg-blue-50' : ''}`}
                            type="button"
                          >
                            <span className="font-semibold text-gray-800">{suggestion.label}</span>
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
                        <span className={validatedConceptIds.has(id) ? 'text-green-600' : 'text-red-600'}>
                          {validatedConceptIds.has(id) ? '✓' : '✗'}
                        </span>
                        <span className={validatedConceptIds.has(id) ? 'text-gray-700' : 'text-red-600'}>{id}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Concepts-specific controls (only when pos='concepts') */}
                {pos === 'concepts' && (
                  <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="frameIncludeLexicalUnits"
                        checked={frameIncludeLexicalUnits ?? false}
                        onChange={(e) => onConceptIncludeLexicalUnitsChange?.(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="frameIncludeLexicalUnits" className="text-xs font-medium text-gray-800">
                        Include associated lexical units in scope
                      </label>
                    </div>
                    
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-gray-800">What to flag:</div>
                      <div className="space-y-1">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="frameFlagTarget"
                            value="lexical_unit"
                            checked={frameFlagTarget === 'lexical_unit'}
                            onChange={() => onConceptFlagTargetChange?.('lexical_unit')}
                            className="text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-xs text-gray-700">Lexical units only</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="frameFlagTarget"
                            value="concept"
                            checked={frameFlagTarget === 'concept'}
                            onChange={() => onConceptFlagTargetChange?.('concept')}
                            className="text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-xs text-gray-700">Concept only</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="frameFlagTarget"
                            value="both"
                            checked={frameFlagTarget === 'both'}
                            onChange={() => onConceptFlagTargetChange?.('both')}
                            className="text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-xs text-gray-700">Both concept and lexical units</span>
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
  );
});

