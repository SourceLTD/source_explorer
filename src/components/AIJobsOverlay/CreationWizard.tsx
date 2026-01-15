"use client";

import { memo, useCallback, useRef, useEffect } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { showGlobalAlert } from '@/lib/alerts';
import LoadingSpinner from '@/components/LoadingSpinner';
import { ScopeSelector } from './ScopeSelector';
import { STEPPER_STEPS, STEP_TITLES, MODEL_OPTIONS, buildPrompt, type StepperStep } from './constants';
import { calculateCursorPosition, truncate } from './utils';
import { ProgressBar } from './components';
import type { UseJobCreationReturn } from './hooks/useJobCreation';
import type { DataTableMode } from '../DataTable/types';

export interface CreationWizardProps {
  creation: UseJobCreationReturn;
  mode: DataTableMode;
}

export const CreationWizard = memo(function CreationWizard({
  creation,
  mode,
}: CreationWizardProps) {
  const {
    currentStep,
    stepIndex,
    isLastStep,
    label,
    setLabel,
    setLabelManuallyEdited,
    model,
    setModel,
    jobType,
    setJobType,
    targetFields,
    setTargetFields,
    reallocationEntityTypes,
    setReallocationEntityTypes,
    priority,
    setPriority,
    reasoningEffort,
    setReasoningEffort,
    agenticMode,
    setAgenticMode,
    splitMinFrames,
    setSplitMinFrames,
    splitMaxFrames,
    setSplitMaxFrames,
    scopeMode,
    setScopeMode,
    manualIdsText,
    frameIdsText,
    manualIds,
    frameIds,
    validatedManualIds,
    validatedFrameIds,
    frameIncludeLexicalUnits,
    setFrameIncludeLexicalUnits,
    frameFlagTarget,
    setFrameFlagTarget,
    filterGroup,
    setFilterGroup,
    filterLimit,
    setFilterLimit,
    filterValidateLoading,
    filterValidateError,
    filterValidateCount,
    filterValidateSample,
    manualIdInputRef,
    showManualIdMenu,
    manualIdSuggestions,
    manualIdMenuPosition,
    manualIdActiveIndex,
    handleManualIdChange,
    handleManualIdKeyDown,
    insertManualId,
    frameIdInputRef,
    showFrameIdMenu,
    frameIdSuggestions,
    frameIdMenuPosition,
    frameIdActiveIndex,
    handleFrameIdChange,
    handleFrameIdKeyDown,
    insertFrameId,
    promptMode,
    setPromptMode,
    promptTemplate,
    setPromptTemplate,
    promptRef,
    systemPrompt,
    clusterLoopListsEnabled,
    setClusterLoopListsEnabled,
    clusterKOverrideText,
    setClusterKOverrideText,
    showVariableMenu,
    variableMenuPosition,
    variableActiveIndex,
    filteredVariables,
    availableVariables,
    editorScroll,
    setEditorScroll,
    handlePromptChange,
    handlePromptKeyDown,
    insertVariable,
    preview,
    previewLoading,
    currentPreviewIndex,
    setCurrentPreviewIndex,
    estimate,
    estimateLoading,
    estimateError,
    submissionLoading,
    submissionProgress,
    isScopeValid,
    nextDisabled,
    isSubmitDisabled,
    parsedSelectionCount,
    scopeSummary,
    scopeExampleList,
    modelLabel,
    closeCreateFlow,
    goToNextStep,
    goToPreviousStep,
    handleValidateFilters,
    handleSubmit,
    cancelSubmission,
  } = creation;

  // Ref to track the active variable menu item for scrolling into view
  const activeVariableRef = useRef<HTMLButtonElement>(null);

  // Scroll active variable item into view when navigating with arrow keys
  useEffect(() => {
    if (showVariableMenu && variableActiveIndex >= 0 && activeVariableRef.current) {
      activeVariableRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [showVariableMenu, variableActiveIndex]);

  const renderHighlighted = useCallback((text: string) => {
    // Match both {{variable}} syntax and {% for/endfor %} block syntax
    const tokenRegex = /(\{\{[a-zA-Z0-9_.]+\}\}|\{%\s*(?:for\s+\w+\s+in\s+[a-zA-Z0-9_.]+|endfor)\s*%\})/g;
    const parts = text.split(tokenRegex);
    return parts.map((part, index) => {
      // Check for {{variable}} - simple interpolation
      if (/^\{\{[a-zA-Z0-9_.]+\}\}$/.test(part)) {
        return (
          <span key={`${index}-v`} className="text-blue-700 bg-blue-50/50 rounded-sm px-0.5 -mx-0.5">
            {part}
          </span>
        );
      }
      // Check for {% for/endfor %} - loop blocks
      if (/^\{%\s*(?:for|endfor)/.test(part)) {
        return (
          <span key={`${index}-b`} className="text-indigo-600 bg-indigo-50/50 rounded-sm px-0.5 -mx-0.5">
            {part}
          </span>
        );
      }
      return <span key={`${index}-t`}>{part}</span>;
    });
  }, []);

  const renderStepContent = () => {
    switch (currentStep) {
      case 'scope': {
        // Job type availability matrix (DataTableMode -> allowed job types)
        const allowAllocate = mode === 'lexical_units' || mode === 'frames_only' || mode === 'frames';
        const allowReallocateContents = mode === 'frames_only' || mode === 'frames' || mode === 'super_frames';
        const allowSplit = mode === 'frames_only' || mode === 'frames' || mode === 'super_frames';
        const allocateSubtitle =
          mode === 'lexical_units'
            ? 'Find best frame'
            : 'Find best super frame';
        const reallocateSubtitle =
          mode === 'super_frames'
            ? 'Reallocate child frames'
            : 'Reallocate lexical units';
        return (
          <div className="space-y-5">
            {/* Job Type Selection */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-gray-700">Job Type</label>
              <div className="flex gap-3">
                <label className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 transition-colors ${jobType === 'flag' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <input
                    type="radio"
                    name="jobType"
                    value="flag"
                    checked={jobType === 'flag'}
                    onChange={() => {
                      setJobType('flag');
                      setTargetFields([]);
                      setReallocationEntityTypes([]);
                    }}
                    className="sr-only"
                  />
                  <div className="text-center">
                    <div className="text-sm font-semibold">Flag</div>
                    <div className="text-[10px] opacity-70">Flag based on criteria</div>
                  </div>
                </label>
                <label className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 transition-colors ${jobType === 'edit' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <input
                    type="radio"
                    name="jobType"
                    value="edit"
                    checked={jobType === 'edit'}
                    onChange={() => {
                      setJobType('edit');
                      setReallocationEntityTypes([]);
                    }}
                    className="sr-only"
                  />
                  <div className="text-center">
                    <div className="text-sm font-semibold">Edit</div>
                    <div className="text-[10px] opacity-70">Improve data</div>
                  </div>
                </label>
                {allowAllocate && (
                  <label className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 transition-colors ${jobType === 'allocate' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <input
                      type="radio"
                      name="jobType"
                      value="allocate"
                      checked={jobType === 'allocate'}
                      onChange={() => {
                        setJobType('allocate');
                        setTargetFields([]);
                        setReallocationEntityTypes([]);
                      }}
                      className="sr-only"
                    />
                    <div className="text-center">
                      <div className="text-sm font-semibold">Allocate</div>
                      <div className="text-[10px] opacity-70">{allocateSubtitle}</div>
                    </div>
                  </label>
                )}
                {allowReallocateContents && (
                  <label className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 transition-colors ${jobType === 'allocate_contents' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <input
                      type="radio"
                      name="jobType"
                      value="allocate_contents"
                      checked={jobType === 'allocate_contents'}
                      onChange={() => {
                        setJobType('allocate_contents');
                        setTargetFields([]);
                      }}
                      className="sr-only"
                    />
                    <div className="text-center">
                      <div className="text-sm font-semibold">Allocate Contents</div>
                      <div className="text-[10px] opacity-70">{reallocateSubtitle}</div>
                    </div>
                  </label>
                )}
                {allowSplit && (
                  <label className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 transition-colors ${jobType === 'split' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <input
                      type="radio"
                      name="jobType"
                      value="split"
                      checked={jobType === 'split'}
                      onChange={() => {
                        setJobType('split');
                        setTargetFields([]);
                        setReallocationEntityTypes([]);
                      }}
                      className="sr-only"
                    />
                    <div className="text-center">
                      <div className="text-sm font-semibold">Split</div>
                      <div className="text-[10px] opacity-70">Divide into multiple</div>
                    </div>
                  </label>
                )}
              </div>
            </div>

            {/* Separator */}
            <div className="border-t border-gray-200" />

            {/* Scope Selection */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-gray-700">
                Target {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </label>
              <ScopeSelector
                mode={scopeMode}
                setMode={setScopeMode}
                selectedCount={parsedSelectionCount}
                manualIdsText={manualIdsText}
                frameIdsText={frameIdsText}
                selectionDisabled={parsedSelectionCount === 0}
                manualIdInputRef={manualIdInputRef}
                frameIdInputRef={frameIdInputRef}
                showManualIdMenu={showManualIdMenu}
                manualIdSuggestions={manualIdSuggestions}
                manualIdMenuPosition={manualIdMenuPosition}
                insertManualId={insertManualId}
                showFrameIdMenu={showFrameIdMenu}
                frameIdSuggestions={frameIdSuggestions}
                frameIdMenuPosition={frameIdMenuPosition}
                insertFrameId={insertFrameId}
                handleManualIdChange={handleManualIdChange}
                handleManualIdKeyDown={handleManualIdKeyDown}
                handleFrameIdChange={handleFrameIdChange}
                handleFrameIdKeyDown={handleFrameIdKeyDown}
                validatedManualIds={validatedManualIds}
                validatedFrameIds={validatedFrameIds}
                manualIds={manualIds}
                frameIds={frameIds}
                pos={mode}
                manualIdActiveIndex={manualIdActiveIndex}
                frameIdActiveIndex={frameIdActiveIndex}
                filterGroup={filterGroup}
                onFilterGroupChange={setFilterGroup}
                filterLimit={filterLimit}
                onFilterLimitChange={setFilterLimit}
                filterValidateLoading={filterValidateLoading}
                filterValidateError={filterValidateError}
                filterValidateCount={filterValidateCount}
                filterValidateSample={filterValidateSample}
                onValidateFilters={handleValidateFilters}
                frameIncludeLexicalUnits={frameIncludeLexicalUnits}
                onFrameIncludeLexicalUnitsChange={setFrameIncludeLexicalUnits}
                frameFlagTarget={frameFlagTarget}
                onFrameFlagTargetChange={setFrameFlagTarget}
              />
              {!isScopeValid && (
                <p className="text-xs text-red-500">
                  {scopeMode === 'manual' && manualIds.length > 0 && manualIds.some(id => !validatedManualIds.has(id))
                    ? 'Some manual IDs are invalid. Please ensure all IDs exist in the database.'
                    : scopeMode === 'frames' && (mode === 'lexical_units' || mode === 'frames') && frameIds.length > 0 && frameIds.some(id => !validatedFrameIds.has(id))
                    ? (frameIncludeLexicalUnits && mode === 'lexical_units' 
                        ? 'Some frame IDs are invalid or have no associated lexical units. Please ensure all frame IDs exist and have lexical units.'
                        : 'Some frame IDs are invalid. Please ensure all frame IDs exist in the database.')
                    : scopeMode === 'frames' && (mode !== 'lexical_units' && mode !== 'frames')
                    ? 'Frame scope is only available for lexical units and frames.'
                    : 'Choose at least one target before continuing.'}
                </p>
              )}
            </div>

            {/* Target Fields for Editing */}
            {jobType === 'edit' && isScopeValid && (
              <>
                <div className="border-t border-gray-200" />
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-gray-700">Target Fields</label>
                  <div className="flex flex-wrap gap-2">
                    {availableVariables
                      .filter(v => v.category === 'basic' && !['id', 'code', 'pos', 'flagged', 'flagged_reason'].includes(v.key))
                      .map(variable => (
                        <label
                          key={variable.key}
                          className={`flex cursor-pointer items-center justify-center rounded-xl border px-3 py-2 transition-colors ${
                            targetFields.includes(variable.key)
                              ? 'border-blue-500 bg-blue-50 text-blue-600'
                              : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={targetFields.includes(variable.key)}
                          onChange={() => {
                            setTargetFields(
                              targetFields.includes(variable.key) 
                                ? targetFields.filter(f => f !== variable.key)
                                : [...targetFields, variable.key]
                            );
                          }}
                            className="sr-only"
                          />
                          <span className="text-sm font-medium">{variable.label}</span>
                        </label>
                      ))}
                  </div>
                  {targetFields.length === 0 && (
                    <p className="text-[10px] text-amber-600 font-medium">Select at least one field the AI should be allowed to suggest changes for.</p>
                  )}
                </div>
              </>
            )}

            {/* Entity Types for Allocate Contents
                Note: For superframes, this always targets child frames (no choice), so we omit this section. */}
            {jobType === 'allocate_contents' && isScopeValid && mode !== 'super_frames' && (
              <>
                <div className="border-t border-gray-200" />
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-gray-700">Entity Types to Allocate</label>
                  <div className="flex gap-3">
                    {(['verb', 'noun', 'adjective', 'adverb'] as const).map(entityType => (
                      <label
                        key={entityType}
                        className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 transition-colors ${
                          reallocationEntityTypes.includes(entityType)
                            ? 'border-blue-500 bg-blue-50 text-blue-600'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={reallocationEntityTypes.includes(entityType)}
                          onChange={() => {
                            setReallocationEntityTypes(
                              reallocationEntityTypes.includes(entityType)
                                ? reallocationEntityTypes.filter(t => t !== entityType)
                                : [...reallocationEntityTypes, entityType]
                            );
                          }}
                          className="sr-only"
                        />
                        <div className="text-center">
                          <div className="text-sm font-semibold">{entityType.charAt(0).toUpperCase() + entityType.slice(1)}s</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  {reallocationEntityTypes.length === 0 && (
                    <p className="text-[10px] text-amber-600 font-medium">Select at least one entity type the AI can suggest moving.</p>
                  )}
                </div>
              </>
            )}

            {/* Split Configuration */}
            {jobType === 'split' && isScopeValid && (
              <>
                <div className="border-t border-gray-200" />
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-gray-700">Split Configuration</label>
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                    <div className="font-semibold mb-1">
                      {mode === 'super_frames' ? 'Splitting Superframe' : 'Splitting Frame'}
                    </div>
                    <p className="text-xs mb-3">
                      {mode === 'super_frames' 
                        ? 'The AI will split this superframe into multiple new superframes, distributing child frames among them.'
                        : 'The AI will split this frame into multiple new frames, distributing lexical units among them.'}
                    </p>
                    <div className="flex gap-4 items-center">
                      <div className="flex-1">
                        <label className="block text-[10px] font-medium text-blue-800 mb-1">Min Frames</label>
                        <input
                          type="number"
                          min={2}
                          max={splitMaxFrames}
                          value={splitMinFrames}
                          onChange={(e) => setSplitMinFrames(Math.max(2, Math.min(parseInt(e.target.value) || 2, splitMaxFrames)))}
                          className="w-full rounded-lg border border-blue-300 bg-white px-2 py-1 text-sm text-blue-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-[10px] font-medium text-blue-800 mb-1">Max Frames</label>
                        <input
                          type="number"
                          min={splitMinFrames}
                          max={10}
                          value={splitMaxFrames}
                          onChange={(e) => setSplitMaxFrames(Math.max(splitMinFrames, Math.min(parseInt(e.target.value) || 5, 10)))}
                          className="w-full rounded-lg border border-blue-300 bg-white px-2 py-1 text-sm text-blue-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-blue-600 mt-2">
                      The AI will decide the optimal number of frames within this range based on the content.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      }
      case 'model': {
        const agenticDisabled = false;
        return (
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-gray-600">Job Label</label>
              <input
                value={label}
                onChange={event => {
                  setLabel(event.target.value);
                  setLabelManuallyEdited(true);
                }}
                placeholder="Optional job label"
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-2 text-xs text-gray-500">Give the batch a short name to identify it later in the jobs list.</p>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-gray-600">Model</label>
                <select
                  value={model}
                  onChange={event => setModel(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {MODEL_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Priority</label>
                <select
                  value={priority}
                  onChange={event => setPriority(event.target.value as 'flex' | 'normal' | 'priority')}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="flex">flex</option>
                  <option value="normal">normal</option>
                  <option value="priority">priority</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Reasoning Effort</label>
                <select
                  value={reasoningEffort}
                  onChange={event => setReasoningEffort(event.target.value as 'low' | 'medium' | 'high')}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </div>
            </div>
            
            {/* Agentic Mode Toggle */}
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-900">Agentic Mode</label>
                <p className="text-xs text-gray-500 mt-0.5">
                  {jobType === 'split'
                    ? 'Optional: enable MCP tools so the AI can look up related frames/entries for extra context while proposing a split.'
                    : 'Enable AI to use MCP tools for searching frames and verbs in the database for additional context.'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={agenticMode}
                aria-disabled={agenticDisabled}
                onClick={() => {
                  if (agenticDisabled) return;
                  setAgenticMode(!agenticMode);
                }}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  agenticDisabled
                    ? 'cursor-not-allowed bg-gray-200 opacity-60'
                    : agenticMode
                      ? 'cursor-pointer bg-blue-600'
                      : 'cursor-pointer bg-gray-200'
                }`}
              >
                <span className="sr-only">Enable agentic mode</span>
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    agenticMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        );
      }
      case 'prompt': {
        const jobTypeLabel = jobType === 'flag' ? 'Flag' : jobType === 'edit' ? 'Edit' : jobType === 'allocate' ? 'Allocate' : jobType === 'split' ? 'Split' : 'Allocate Contents';
        const defaultPrompt = buildPrompt({
          entityType: mode,
          jobType,
          agenticMode,
          scopeMode,
          isSuperFrame: mode === 'super_frames',
        });
        const effectivePrompt = promptMode === 'simple' ? defaultPrompt : promptTemplate;
        const modeSuggestsClustering = mode === 'frames' || mode === 'super_frames';
        const showClustering =
          modeSuggestsClustering ||
          /\{%\s*for\s+\w+\s+in\s+(lexical_units|child_frames)\s*%\}/.test(effectivePrompt);
        
        return (
          <div className="flex h-full flex-col gap-4">
            {/* Prompt clustering */}
            {showClustering && (
            <div className="shrink-0 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-gray-800">Cluster loop lists</div>
                  <div className="text-[11px] text-gray-500">
                    Groups{' '}
                    <code className="rounded bg-white/70 px-1 py-0.5">
                      {'{% for lu in lexical_units %}...{% endfor %}'}
                    </code>{' '}
                    and{' '}
                    <code className="rounded bg-white/70 px-1 py-0.5">
                      {'{% for frame in child_frames %}...{% endfor %}'}
                    </code>{' '}
                    outputs into clusters.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={clusterLoopListsEnabled}
                  onClick={() => setClusterLoopListsEnabled(!clusterLoopListsEnabled)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    clusterLoopListsEnabled ? 'cursor-pointer bg-blue-600' : 'cursor-pointer bg-gray-200'
                  }`}
                >
                  <span className="sr-only">Enable clustering</span>
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      clusterLoopListsEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {clusterLoopListsEnabled && (
                <div className="mt-3 flex items-center gap-3">
                  <label className="text-[11px] text-gray-600 shrink-0">k override (optional)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={clusterKOverrideText}
                    onChange={(e) => setClusterKOverrideText(e.target.value)}
                    placeholder="auto"
                    className="w-28 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-[11px] text-gray-500">Leave blank to auto-pick k.</span>
                </div>
              )}
            </div>
            )}

            {/* Mode Toggle */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-gray-700">Prompt Mode</label>
              <div className="flex gap-3">
                <label className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 transition-colors ${promptMode === 'simple' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <input
                    type="radio"
                    name="promptMode"
                    value="simple"
                    checked={promptMode === 'simple'}
                    onChange={() => {
                      setPromptMode('simple');
                    }}
                    className="sr-only"
                  />
                  <div className="text-center">
                    <div className="text-sm font-semibold">Simple</div>
                    <div className="text-[10px] opacity-70">Use default prompt</div>
                  </div>
                </label>
                <label className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 transition-colors ${promptMode === 'advanced' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <input
                    type="radio"
                    name="promptMode"
                    value="advanced"
                    checked={promptMode === 'advanced'}
                    onChange={() => {
                      setPromptMode('advanced');
                      // Keep current prompt when switching to advanced
                    }}
                    className="sr-only"
                  />
                  <div className="text-center">
                    <div className="text-sm font-semibold">Advanced</div>
                    <div className="text-[10px] opacity-70">Custom prompt</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Separator */}
            <div className="border-t border-gray-200" />

            {promptMode === 'simple' ? (
              /* Simple Mode - Read-only preview */
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-600">
                    Uses optimized default prompt for <span className="font-semibold">{jobTypeLabel}</span> jobs
                  </p>
                </div>
                <div className="min-h-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 overflow-auto">
                  <pre className="whitespace-pre-wrap p-3 text-xs text-gray-700 font-mono leading-relaxed">
                    {renderHighlighted(defaultPrompt)}
                  </pre>
                </div>
              </div>
            ) : (
              /* Advanced Mode - Editable textarea */
              <div className="relative flex min-h-0 flex-1 flex-col">
                <label className="block text-xs font-medium text-gray-600">Custom Prompt</label>
                <div className="relative mt-1 min-h-0 flex-1">
                  {/* Highlight overlay - must have identical text rendering to textarea */}
                  <div 
                    className="pointer-events-none absolute inset-px overflow-hidden rounded-xl px-3 py-2 text-sm text-gray-900 font-mono"
                    style={{ 
                      wordWrap: 'break-word', 
                      overflowWrap: 'break-word',
                      whiteSpace: 'pre-wrap',
                      scrollbarGutter: 'stable',
                      lineHeight: '1.5',
                    }}
                  >
                    <div
                      className="whitespace-pre-wrap"
                      style={{ transform: `translate(${-editorScroll.left}px, ${-editorScroll.top}px)` }}
                    >
                      {renderHighlighted(promptTemplate)}
                    </div>
                  </div>
                  <textarea
                    ref={promptRef}
                    value={promptTemplate}
                    onChange={handlePromptChange}
                    onKeyDown={handlePromptKeyDown}
                    onScroll={event => {
                      const target = event.currentTarget;
                      setEditorScroll({ top: target.scrollTop, left: target.scrollLeft });
                      if (showVariableMenu) {
                        const cursorPos = target.selectionStart;
                        const pos = calculateCursorPosition(target, cursorPos);
                        // Note: This updates position through the hook's state
                      }
                    }}
                    className="h-full w-full resize-none rounded-xl border border-gray-300 bg-transparent px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ 
                      WebkitTextFillColor: 'transparent',
                      caretColor: '#111827',
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'break-word',
                      scrollbarGutter: 'stable',
                      lineHeight: '1.5',
                    }}
                    placeholder="Write instructions for the AI..."
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    data-gramm="false"
                    data-gramm_editor="false"
                    data-enable-grammarly="false"
                  />
                </div>
                {showVariableMenu && (
                  <div
                    className="fixed z-10 max-h-48 w-60 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg"
                    style={{ top: `${variableMenuPosition.top + 16}px`, left: `${variableMenuPosition.left}px` }}
                  >
                    {filteredVariables.length === 0 ? (
                      <div className="p-2 text-xs text-gray-500">No matching variables</div>
                    ) : (
                      <ul>
                        {filteredVariables.map((variable, idx) => (
                          <li key={variable.key}>
                            <button
                              ref={idx === variableActiveIndex ? activeVariableRef : null}
                              onClick={() => insertVariable(variable.key)}
                              className={`cursor-pointer flex w-full flex-col items-start px-3 py-2 text-left text-xs hover:bg-blue-50 ${idx === variableActiveIndex ? 'bg-blue-50' : ''}`}
                              type="button"
                            >
                              <span className="font-semibold text-gray-800">{variable.key}</span>
                              <span className="text-[11px] text-gray-500">{variable.label}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Help text - only show in advanced mode */}
            {promptMode === 'advanced' && (
              <div className="shrink-0 space-y-1 text-xs text-gray-500">
                <p>
                  Type <code className="rounded bg-gray-100 px-1">{'{{'}</code> to insert variables.
                  {(mode === 'lexical_units' || mode === 'frames' || mode === 'super_frames' || mode === 'frames_only') && (
                    <>
                      {' '}Use{' '}
                      <code className="rounded bg-indigo-50 px-1 text-indigo-600">
                        {mode === 'lexical_units' 
                          ? '{% for role in frame.roles %}' 
                          : mode === 'super_frames' 
                          ? '{% for frame in child_frames %}' 
                          : '{% for lu in lexical_units %}'}
                      </code>
                      {' '}for loops.
                    </>
                  )}
                </p>
                {(mode === 'lexical_units' || mode === 'frames' || mode === 'super_frames' || mode === 'frames_only') && (
                  <details className="cursor-pointer">
                    <summary className="text-gray-400 hover:text-gray-600">Loop syntax help</summary>
                    <div className="mt-1.5 rounded-lg bg-gray-50 p-2 font-mono text-[11px] leading-relaxed">
                      {mode === 'lexical_units' ? (
                        <>
                          <div className="text-gray-600">{'{%'} for role in frame.roles {'%}'}</div>
                          <div className="pl-2 text-gray-500">{'{{ role.type }}'}: {'{{ role.description }}'}</div>
                          <div className="text-gray-600">{'{%'} endfor {'%}'}</div>
                          <div className="mt-1.5 border-t border-gray-200 pt-1.5 text-gray-400">
                            Available: frame.roles, frame.lexical_units
                          </div>
                        </>
                      ) : mode === 'super_frames' ? (
                        <>
                          <div className="text-gray-600">{'{%'} for frame in child_frames {'%}'}</div>
                          <div className="pl-2 text-gray-500">- {'{{ frame.label }}'}: {'{{ frame.definition }}'}</div>
                          <div className="text-gray-600">{'{%'} endfor {'%}'}</div>
                          <div className="mt-1.5 border-t border-gray-200 pt-1.5 text-gray-400">
                            Available: roles, child_frames
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-gray-600">{'{%'} for lu in lexical_units {'%}'}</div>
                          <div className="pl-2 text-gray-500">- {'{{ lu.code }}'}: {'{{ lu.gloss }}'}</div>
                          <div className="text-gray-600">{'{%'} endfor {'%}'}</div>
                          <div className="mt-1.5 border-t border-gray-200 pt-1.5 text-gray-400">
                            Available: roles, lexical_units
                          </div>
                        </>
                      )}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* System prompt (optional viewer) */}
            <details className="shrink-0 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-gray-700">
                System prompt (optional)
              </summary>
              <p className="mt-1 text-[11px] text-gray-500">
                Sent as the OpenAI <span className="font-mono">system</span> message. This changes when Agentic Mode is toggled.
              </p>
              <div className="mt-2 relative rounded-lg border border-gray-200 bg-white p-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(systemPrompt);
                    showGlobalAlert({ message: 'Copied system prompt to clipboard', type: 'success' });
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 z-10 cursor-pointer"
                  title="Copy system prompt to clipboard"
                  type="button"
                >
                  <ClipboardDocumentIcon className="h-4 w-4" />
                </button>
                <pre className="whitespace-pre-wrap text-[11px] text-gray-800 pr-8">{systemPrompt}</pre>
              </div>
            </details>
          </div>
        );
      }
      case 'review':
        return (
          <div className="flex h-full flex-col gap-6">
            <div className="shrink-0 rounded-xl border border-gray-200 bg-gray-50 p-2">
              <h4 className="text-xs font-semibold text-gray-800 mb-1.5">Summary</h4>
              <div className="grid grid-cols-3 gap-x-4 gap-y-0.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Label:</span>
                  <span className="text-gray-900 font-medium">{label || '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Model:</span>
                  <span className="text-gray-900 font-medium">{modelLabel}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Priority:</span>
                  <span className="text-gray-900 font-medium">{priority}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Reasoning:</span>
                  <span className="text-gray-900 font-medium">{reasoningEffort}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Agentic:</span>
                  <span className={`font-medium ${agenticMode ? 'text-blue-600' : 'text-gray-500'}`}>
                    {agenticMode ? 'ON' : 'OFF'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Scope:</span>
                  <span className="text-gray-900 font-medium">{scopeSummary}</span>
                </div>
                {estimateLoading ? (
                  <div className="flex items-center justify-between col-span-3">
                    <span className="text-gray-600">Cost:</span>
                    <span className="text-gray-900 font-medium">Calculating…</span>
                  </div>
                ) : !estimate ? (
                  <div className="col-span-3"></div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Items:</span>
                      <span className="text-gray-900 font-medium">{estimate.totalItems} <span className="text-gray-500">(sample {estimate.sampleSize})</span></span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Input/item:</span>
                      <span className="text-gray-900 font-medium">{estimate.inputTokensPerItem} tok</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Output/item:</span>
                      <span className="text-gray-900 font-medium">{estimate.outputTokensPerItem} tok</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Input total:</span>
                      <span className="text-gray-900 font-medium">{estimate.totalInputTokens.toLocaleString()} tok</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Output total:</span>
                      <span className="text-gray-900 font-medium">{estimate.totalOutputTokens.toLocaleString()} tok</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Est. cost:</span>
                      <span className="text-gray-900 font-medium">${(estimate.estimatedCostUSD ?? 0).toFixed(4)}</span>
                    </div>
                  </>
                )}
              </div>
              {estimateError && (
                <div className="mt-1.5 rounded border border-red-200 bg-red-50 p-1.5 text-[10px] text-red-700">{estimateError}</div>
              )}
              {scopeExampleList.length > 0 && (
                <div className="mt-3 text-xs text-gray-500">
                  <p className="font-medium text-gray-700">Sample IDs</p>
                  <ul className="mt-1 list-disc pl-5">
                    {scopeExampleList.map(sample => (
                      <li key={sample}>{sample}</li>
                    ))}
                    {scopeMode === 'manual' && manualIds.length > scopeExampleList.length && (
                      <li key="more">…and {manualIds.length - scopeExampleList.length} more</li>
                    )}
                    {scopeMode === 'frames' && frameIds.length > scopeExampleList.length && (
                      <li key="more">…and {frameIds.length - scopeExampleList.length} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-gray-800">Preview</h4>
                <span className="text-xs text-gray-500">
                  {previewLoading ? 'Rendering…' : 'Auto-rendered'}
                </span>
              </div>
              {previewLoading && <p className="shrink-0 text-xs text-gray-500">Rendering preview for the current scope…</p>}
              {preview && !previewLoading && (
                <div className="flex min-h-0 flex-1 flex-col gap-2">
                  {preview.previews.length > 1 && (
                    <div className="flex shrink-0 items-center justify-between text-xs text-gray-600">
                      <button
                        onClick={() => setCurrentPreviewIndex(Math.max(0, currentPreviewIndex - 1))}
                        disabled={currentPreviewIndex === 0}
                        className="flex items-center gap-1 rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        title="Previous preview"
                      >
                        <ChevronLeftIcon className="h-4 w-4" />
                        <span>Previous</span>
                      </button>
                      <span className="font-medium">
                        {currentPreviewIndex + 1} of {preview.previews.length}
                        {preview.totalEntries > preview.previews.length && ` (${preview.totalEntries} total)`}
                      </span>
                      <button
                        onClick={() => setCurrentPreviewIndex(Math.min(preview.previews.length - 1, currentPreviewIndex + 1))}
                        disabled={currentPreviewIndex === preview.previews.length - 1}
                        className="flex items-center gap-1 rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        title="Next preview"
                      >
                        <span>Next</span>
                        <ChevronRightIcon className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  <div className="min-h-0 flex-1 rounded-xl border border-gray-200 bg-white text-xs text-gray-700 flex overflow-hidden">
                    {Object.keys(preview.previews[currentPreviewIndex].variables).length > 0 && (
                      <div className="w-1/5 border-r border-gray-200 p-3 space-y-1 overflow-auto">
                        <h5 className="text-[11px] font-semibold text-gray-700 mb-2">Variables</h5>
                        <div className="space-y-1">
                          {Object.entries(preview.previews[currentPreviewIndex].variables).map(([key, value]) => (
                            <div key={key} className="rounded border border-gray-100 bg-gray-50 px-2 py-1 text-[11px] text-gray-600">
                              <div className="font-semibold text-gray-700 break-words">{key}</div>
                              <div className="text-gray-600 break-words">{truncate(value, 80)}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className={`relative p-3 overflow-auto ${Object.keys(preview.previews[currentPreviewIndex].variables).length > 0 ? 'w-4/5' : 'w-full'}`}>
                      <button
                        onClick={() => {
                          const currentPreview = preview.previews[currentPreviewIndex];
                          navigator.clipboard.writeText(currentPreview.prompt);
                          showGlobalAlert({ message: 'Copied to clipboard', type: 'success' });
                        }}
                        className="absolute top-2 right-2 p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 z-10 cursor-pointer"
                        title="Copy to clipboard"
                      >
                        <ClipboardDocumentIcon className="h-4 w-4" />
                      </button>
                      <pre className="whitespace-pre-wrap text-[11px] text-gray-800 pr-8">{preview.previews[currentPreviewIndex].prompt}</pre>
                    </div>
                  </div>
                </div>
              )}
              {!preview && !previewLoading && (
                <p className="text-xs text-gray-500">Generate a preview to inspect how the prompt renders for the first entry in the batch.</p>
              )}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const nextButtonLabel = currentStep === 'prompt' ? 'Review' : 'Next';

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Progress view during batch preparation */}
      {submissionProgress?.phase === 'preparing' ? (
        <div className="flex flex-1 flex-col items-center justify-center p-12 bg-gray-50/50">
          <div className="w-full max-w-md space-y-8 text-center">
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="relative">
                  <div className="absolute inset-0 animate-ping rounded-full bg-blue-100 opacity-75"></div>
                  <div className="relative rounded-full bg-blue-50 p-4">
                    <LoadingSpinner size="lg" isSpinning className="text-blue-600" />
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Preparing Massive Job</h3>
                <p className="text-sm text-gray-500 mt-2">
                  This job contains {submissionProgress.total.toLocaleString()} entries and must be prepared in batches.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
              <ProgressBar
                label="Batch Preparation Progress"
                current={submissionProgress.current || 0}
                total={submissionProgress.total}
                variant="submitting"
                helperText={`Processing batch starting at offset ${submissionProgress.current?.toLocaleString() || 0}...`}
              />
              
              <div className="mt-8 flex flex-col gap-3">
                <button
                  onClick={cancelSubmission}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 cursor-pointer"
                  type="button"
                >
                  Cancel Submission
                </button>
                <p className="text-[11px] text-gray-400 italic">
                  Stopping will cancel the job on the server.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="border-b border-gray-200 px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Create New Job</p>
                <h3 className="text-base font-semibold text-gray-900">{STEP_TITLES[currentStep]}</h3>
              </div>
              <button
                onClick={closeCreateFlow}
                className="cursor-pointer inline-flex items-center gap-1 rounded-xl border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                type="button"
              >
                Cancel
              </button>
            </div>
            <div className="mt-4 flex items-center gap-6 text-xs font-medium">
              {STEPPER_STEPS.map((step, index) => {
                const completed = index < stepIndex;
                const active = index === stepIndex;
                return (
                  <div key={step} className="flex items-center gap-3">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] ${
                        completed
                          ? 'border-transparent bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                          : active
                          ? 'border-blue-500 text-blue-600'
                          : 'border-gray-300 text-gray-400'
                      }`}
                    >
                      {completed ? '✓' : index + 1}
                    </span>
                    <span className={`${completed || active ? 'text-blue-600' : 'text-gray-400'}`}>
                      {STEP_TITLES[step]}
                    </span>
                    {index < STEPPER_STEPS.length - 1 && <span className="mx-2 text-gray-300">—</span>}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex-1 overflow-auto px-6 py-6">{renderStepContent()}</div>
          <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={goToPreviousStep}
                disabled={stepIndex === 0}
                className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
              >
                Back
              </button>
              <div className="flex items-center gap-3">
                {!isLastStep ? (
                  <button
                    onClick={goToNextStep}
                    disabled={nextDisabled}
                    className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 disabled:pointer-events-none"
                    type="button"
                  >
                    {nextButtonLabel}
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitDisabled}
                    className="cursor-pointer inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 disabled:pointer-events-none"
                    type="button"
                  >
                    {submissionLoading ? (
                      <>
                        <LoadingSpinner size="sm" className="shrink-0 text-white" noPadding />
                        Submitting...
                      </>
                    ) : (
                      'Submit Job'
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

