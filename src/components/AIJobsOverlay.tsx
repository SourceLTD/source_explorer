"use client";

import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import BooleanFilterBuilder from '@/components/BooleanFilterBuilder';
import { createEmptyGroup, type BooleanFilterGroup } from '@/lib/filters/types';
import { parseURLToFilterAST } from '@/lib/filters/url';
import { useSearchParams } from 'next/navigation';
import { showGlobalAlert } from '@/lib/alerts';
import type { SerializedJob, JobScope } from '@/lib/llm/types';
import { getVariablesForEntityType } from '@/lib/llm/schema-variables';
import { ChevronLeftIcon, ChevronRightIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';

type ScopeMode = 'selection' | 'manual' | 'frames' | 'all' | 'filters';

interface AIJobsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'verbs' | 'nouns' | 'adjectives' | 'adverbs' | 'frames';
  selectedIds: string[];
  onJobsUpdated?: (pendingJobs: number) => void;
  onUnseenCountChange?: (count: number) => void;
}

interface JobListResponse {
  jobs: SerializedJob[];
}

interface PreviewResponse {
  previews: Array<{
    prompt: string;
    variables: Record<string, string>;
  }>;
  totalEntries: number;
}

const MODEL_OPTIONS = [
  { value: 'gpt-5-nano', label: 'GPT-5 Nano (cheapest)' },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini (balanced)' },
  { value: 'gpt-5', label: 'GPT-5 (highest quality)' },
];

// Dynamic variables removed - now loaded from schema-variables utility

const DEFAULT_PROMPT = `You are reviewing lexical entries for quality assurance.

Entry ID: {{id}}
Part of Speech: {{pos}}
Gloss: {{gloss}}
Lemmas: {{lemmas}}
Examples:\n{{examples}}
Currently Flagged: {{flagged}}
Flagged Reason: {{flagged_reason}}

Decide whether the entry should be flagged. Respond using the provided JSON schema.`;

const DEFAULT_LABEL = 'AI Flagging Review';
const STEPPER_STEPS = ['details', 'scope', 'prompt', 'review'] as const;
type StepperStep = typeof STEPPER_STEPS[number];
const STEP_TITLES: Record<StepperStep, string> = {
  details: 'Job Details',
  scope: 'Scope Selection',
  prompt: 'Prompt Template',
  review: 'Review & Submit',
};

function calculateCursorPosition(textarea: HTMLTextAreaElement, cursorPos: number) {
  const textareaRect = textarea.getBoundingClientRect();
  const style = getComputedStyle(textarea);

  const mirror = document.createElement('div');
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  // Safari sometimes returns an empty composite font string; copy individual props as a fallback
  if (style.font && style.font.trim().length > 0) {
    mirror.style.font = style.font;
  } else {
    mirror.style.fontFamily = style.fontFamily;
    mirror.style.fontSize = style.fontSize;
    mirror.style.fontWeight = style.fontWeight as string;
    mirror.style.fontStyle = style.fontStyle;
  }
  mirror.style.lineHeight = style.lineHeight;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.style.padding = style.padding;
  mirror.style.border = 'none';
  mirror.style.boxSizing = style.boxSizing;
  mirror.style.overflow = 'hidden';
  mirror.style.width = `${textarea.clientWidth}px`;

  const before = document.createTextNode(textarea.value.substring(0, cursorPos));
  const marker = document.createElement('span');
  // Use zero-width space so marker sits exactly at caret
  marker.textContent = '\u200b';

  mirror.appendChild(before);
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const markerTop = marker.offsetTop;
  const markerLeft = marker.offsetLeft;

  document.body.removeChild(mirror);

  const top = textareaRect.top + markerTop - textarea.scrollTop + 4;
  const left = textareaRect.left + markerLeft - textarea.scrollLeft + 4;

  return { top, left };
}

export function AIJobsOverlay({
  isOpen,
  onClose,
  mode,
  selectedIds,
  onJobsUpdated,
  onUnseenCountChange,
}: AIJobsOverlayProps) {
  const [jobs, setJobs] = useState<SerializedJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [selectedJobDetails, setSelectedJobDetails] = useState<SerializedJob | null>(null);
  const [selectedJobLoading, setSelectedJobLoading] = useState(false);
  const [itemLimits, setItemLimits] = useState({ pending: 10, succeeded: 10, failed: 10 });
  const [model, setModel] = useState<string>(MODEL_OPTIONS[0].value);
  const [priority, setPriority] = useState<'flex' | 'normal' | 'priority'>('normal');
  const [reasoningEffort, setReasoningEffort] = useState<'low' | 'medium' | 'high'>('medium');
  const [label, setLabel] = useState(DEFAULT_LABEL);
  const [scopeMode, setScopeMode] = useState<ScopeMode>('selection');
  const [filterGroup, setFilterGroup] = useState<BooleanFilterGroup>(createEmptyGroup());
  const [filterLimit, setFilterLimit] = useState<number>(50);
  const [filterValidateLoading, setFilterValidateLoading] = useState(false);
  const [filterValidateError, setFilterValidateError] = useState<string | null>(null);
  const [filterValidateCount, setFilterValidateCount] = useState<number | null>(null);
  const [filterValidateSample, setFilterValidateSample] = useState<Array<{ code: string; gloss: string }>>([]);
  const [manualIdsText, setManualIdsText] = useState('');
  const [frameIdsText, setFrameIdsText] = useState('');
  const [showManualIdMenu, setShowManualIdMenu] = useState(false);
  const [, setManualIdQuery] = useState('');
  const [manualIdMenuPosition, setManualIdMenuPosition] = useState({ top: 0, left: 0 });
  const [manualIdSuggestions, setManualIdSuggestions] = useState<Array<{ code: string; gloss: string }>>([]);
  const [showFrameIdMenu, setShowFrameIdMenu] = useState(false);
  const [, setFrameIdQuery] = useState('');
  const [frameIdMenuPosition, setFrameIdMenuPosition] = useState({ top: 0, left: 0 });
  const [frameIdSuggestions, setFrameIdSuggestions] = useState<Array<{ id: string; frame_name: string }>>([]);
  const [validatedManualIds, setValidatedManualIds] = useState<Set<string>>(new Set());
  const [validatedFrameIds, setValidatedFrameIds] = useState<Set<string>>(new Set());
  const [frameIncludeVerbs, setFrameIncludeVerbs] = useState(false);
  const [frameFlagTarget, setFrameFlagTarget] = useState<'frame' | 'verb' | 'both'>('verb');
  const [manualIdActiveIndex, setManualIdActiveIndex] = useState<number>(-1);
  const [frameIdActiveIndex, setFrameIdActiveIndex] = useState<number>(-1);
  const manualIdInputRef = useRef<HTMLTextAreaElement | null>(null);
  const frameIdInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [promptTemplate, setPromptTemplate] = useState(DEFAULT_PROMPT);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [estimate, setEstimate] = useState<{
    totalItems: number;
    sampleSize: number;
    inputTokensPerItem: number;
    outputTokensPerItem: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedCostUSD: number | null;
  } | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [submissionLoading, setSubmissionLoading] = useState(false);
  const [, setSubmissionError] = useState<string | null>(null);
  const [showVariableMenu, setShowVariableMenu] = useState(false);
  const [variableQuery, setVariableQuery] = useState('');
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const [editorScroll, setEditorScroll] = useState({ top: 0, left: 0 });
  const previewTimerRef = useRef<number | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [currentStep, setCurrentStep] = useState<StepperStep>('details');
  const [variableActiveIndex, setVariableActiveIndex] = useState<number>(-1);
  const [submissionProgress, setSubmissionProgress] = useState<{
    jobId: string;
    submitted: number;
    total: number;
    failed: number;
    isSubmitting: boolean;
  } | null>(null);
  const searchParams = useSearchParams();
  const loadJobsInProgressRef = useRef(false);
  const pollingInProgressRef = useRef(false);
  const [unseenCount, setUnseenCount] = useState(0);
  const unseenPollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const parsedSelectionCount = selectedIds.length;

  const pendingJobsCount = useMemo(
    () => jobs.filter(job => job.status === 'queued' || job.status === 'running').length,
    [jobs]
  );

  const resetCreationFields = useCallback(() => {
    setLabel(DEFAULT_LABEL);
    setModel(MODEL_OPTIONS[0].value);
    setPriority('normal');
    setReasoningEffort('medium');
    setScopeMode('selection');
    setManualIdsText('');
    setFrameIdsText('');
    setPromptTemplate(DEFAULT_PROMPT);
    setPreview(null);
    setSubmissionError(null);
    setSubmissionLoading(false);
    setShowVariableMenu(false);
    setVariableQuery('');
    setShowManualIdMenu(false);
    setManualIdQuery('');
    setShowFrameIdMenu(false);
    setFrameIdQuery('');
    setValidatedManualIds(new Set());
    setValidatedFrameIds(new Set());
  }, []);

  const startCreateFlow = useCallback(() => {
    resetCreationFields();
    setIsCreating(true);
    setCurrentStep('details');
  }, [resetCreationFields]);

  const closeCreateFlow = useCallback(() => {
    setIsCreating(false);
    setCurrentStep('details');
    resetCreationFields();
  }, [resetCreationFields]);

  const loadJobSettings = useCallback((job: SerializedJob) => {
    // Parse config JSON
    const config = job.config as { 
      model?: string; 
      promptTemplate?: string; 
      serviceTier?: string | null;
      reasoning?: { effort?: 'low' | 'medium' | 'high' } | null;
    } | null;
    
    const scope = job.scope as JobScope | null;

    // Load basic settings
    setLabel(job.label ?? DEFAULT_LABEL);
    setModel(config?.model ?? MODEL_OPTIONS[0].value);
    setPriority(serviceTierToPriority(config?.serviceTier));
    setReasoningEffort(config?.reasoning?.effort ?? 'medium');
    setPromptTemplate(config?.promptTemplate ?? DEFAULT_PROMPT);

    // Parse and load scope settings
    if (scope) {
      if (scope.kind === 'ids') {
        // Check if the IDs match current selection
        const scopeIds = scope.ids ?? [];
        if (scopeIds.length > 0 && scopeIds.length === selectedIds.length && 
            scopeIds.every(id => selectedIds.includes(id))) {
          setScopeMode('selection');
        } else {
          setScopeMode('manual');
          setManualIdsText(idsToText(scopeIds));
        }
      } else if (scope.kind === 'frame_ids') {
        setScopeMode('frames');
        setFrameIdsText(idsToText(scope.frameIds ?? []));
        setFrameIncludeVerbs(scope.includeVerbs ?? false);
        setFrameFlagTarget(scope.flagTarget ?? 'verb');
      } else if (scope.kind === 'filters') {
        const filters = scope.filters;
        const hasNoFilters = !filters?.where || (filters.where.children && filters.where.children.length === 0);
        const isAll = (filters?.limit === 0 || !filters?.limit) && hasNoFilters;
        
        if (isAll) {
          setScopeMode('all');
        } else {
          setScopeMode('filters');
          setFilterGroup(filters?.where ?? createEmptyGroup());
          setFilterLimit(filters?.limit ?? 50);
        }
      }
    }

    // Manually start the creation flow (don't call startCreateFlow as it resets fields)
    setIsCreating(true);
    setCurrentStep('details');
  }, [selectedIds]);

  useEffect(() => {
    if (currentStep !== 'prompt') {
      setShowVariableMenu(false);
      setVariableQuery('');
    }
  }, [currentStep]);

  useEffect(() => {
    if (!showVariableMenu || !promptRef.current) return;

    const textarea = promptRef.current;
    const updatePosition = () => {
      if (textarea && showVariableMenu) {
        const cursorPos = textarea.selectionStart;
        const position = calculateCursorPosition(textarea, cursorPos);
        setMenuPosition(position);
        // Ensure correct metrics after web fonts load (Safari)
        if ((document as any).fonts?.ready) {
          (document as any).fonts.ready.then(() => {
            if (textarea && showVariableMenu) {
              const pos2 = calculateCursorPosition(textarea, textarea.selectionStart);
              setMenuPosition(pos2);
            }
          });
        }
      }
    };

    // Update position on scroll
    textarea.addEventListener('scroll', updatePosition);
    
    // Update position when cursor moves (using selectionchange)
    document.addEventListener('selectionchange', updatePosition);

    return () => {
      textarea.removeEventListener('scroll', updatePosition);
      document.removeEventListener('selectionchange', updatePosition);
    };
  }, [showVariableMenu]);

  useEffect(() => {
    if (!isCreating) {
      setSubmissionError(null);
      setPreview(null);
    }
  }, [isCreating]);

  

  useEffect(() => {
    if (!isOpen) {
      closeCreateFlow();
    }
  }, [isOpen, closeCreateFlow]);

  // Poll for unseen count when overlay is closed
  useEffect(() => {
    if (!isOpen) {
      const pollUnseen = async () => {
        try {
          const response = await fetch(`/api/llm-jobs/unseen-count?pos=${mode}`);
          const data = await response.json();
          setUnseenCount(data.count || 0);
        } catch (error) {
          console.error('Failed to fetch unseen count:', error);
        }
      };
      
      pollUnseen(); // Initial fetch
      unseenPollIntervalRef.current = setInterval(pollUnseen, 30000); // Every 30s
      
      return () => {
        if (unseenPollIntervalRef.current) {
          clearInterval(unseenPollIntervalRef.current);
        }
      };
    } else {
      setUnseenCount(0); // Reset when overlay opens
    }
  }, [isOpen, mode]);

  // Notify parent of unseen count changes
  useEffect(() => {
    if (onUnseenCountChange) {
      onUnseenCountChange(unseenCount);
    }
  }, [unseenCount, onUnseenCountChange]);

  const manualIds = useMemo(() => parseIds(manualIdsText), [manualIdsText]);
  const frameIds = useMemo(() => parseIds(frameIdsText), [frameIdsText]);

  const isScopeValid = useMemo(() => {
    switch (scopeMode) {
      case 'selection':
        return parsedSelectionCount > 0;
      case 'all':
        return true;
      case 'filters':
        return true;
      case 'manual':
        return manualIds.length > 0 && manualIds.every(id => validatedManualIds.has(id));
      case 'frames':
        return frameIds.length > 0 && frameIds.every(id => validatedFrameIds.has(id));
      default:
        return false;
    }
  }, [scopeMode, parsedSelectionCount, manualIds, frameIds, validatedManualIds, validatedFrameIds]);

  const promptIsValid = useMemo(() => promptTemplate.trim().length > 0, [promptTemplate]);

  const isSubmitDisabled = useMemo(() => {
    if (submissionLoading) return true;
    if (!promptIsValid) return true;
    if (!model) return true;
    switch (scopeMode) {
      case 'selection':
        return parsedSelectionCount === 0;
      case 'all':
        return false;
      case 'filters':
        return false;
      case 'manual':
        return manualIds.length === 0 || !manualIds.every(id => validatedManualIds.has(id));
      case 'frames':
        return frameIds.length === 0 || !frameIds.every(id => validatedFrameIds.has(id));
      default:
        return true;
    }
  }, [submissionLoading, promptIsValid, model, scopeMode, parsedSelectionCount, manualIds, frameIds, validatedManualIds, validatedFrameIds]);

  const stepIndex = STEPPER_STEPS.indexOf(currentStep);
  const isLastStep = stepIndex === STEPPER_STEPS.length - 1;

  const nextDisabled = useMemo(() => {
    if (currentStep === 'scope') return !isScopeValid;
    if (currentStep === 'prompt') return !promptIsValid;
    return false;
  }, [currentStep, isScopeValid, promptIsValid]);

    const handlePreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreview(null);
    setCurrentPreviewIndex(0);
    try {
      const scope = buildScope(scopeMode, mode, selectedIds, manualIdsText, frameIdsText, filterGroup, filterLimit, frameIncludeVerbs, frameFlagTarget);
      const response = await api.post<PreviewResponse>('/api/llm-jobs/preview', {
        model,
        promptTemplate,
        scope,
        serviceTier: priority === 'normal' ? 'default' : priority,
        reasoning: { effort: reasoningEffort },
      });
      setPreview(response);
    } catch (error) {
      setPreview({
        previews: [{
          prompt: error instanceof Error ? error.message : 'Failed to render preview',
          variables: {},
        }],
        totalEntries: 0,
      });
    } finally {
      setPreviewLoading(false);
    }
  }, [
    scopeMode,
    mode,
    selectedIds,
    manualIdsText,
    frameIdsText,
    filterGroup,
    filterLimit,
    frameIncludeVerbs,
    frameFlagTarget,
    model,
    promptTemplate,
    priority,
    reasoningEffort,
  ]);

  const handleEstimate = useCallback(async () => {
    setEstimateLoading(true);
    setEstimateError(null);
    setEstimate(null);
    try {
      const scope = buildScope(scopeMode, mode, selectedIds, manualIdsText, frameIdsText, filterGroup, filterLimit, frameIncludeVerbs, frameFlagTarget);
      const response = await api.post<{
        totalItems: number;
        sampleSize: number;
        inputTokensPerItem: number;
        outputTokensPerItem: number;
        totalInputTokens: number;
        totalOutputTokens: number;
        estimatedCostUSD: number | null;
      }>('/api/llm-jobs/estimate', {
        model,
        promptTemplate,
        scope,
        serviceTier: priority === 'normal' ? 'default' : priority,
        reasoning: { effort: reasoningEffort },
        outputTokensPerItem: 5000,
      });
      setEstimate(response);
    } catch (error) {
      setEstimateError(error instanceof Error ? error.message : 'Failed to estimate cost');
    } finally {
      setEstimateLoading(false);
    }
  }, [
    scopeMode,
    mode,
    selectedIds,
    manualIdsText,
    frameIdsText,
    filterGroup,
    filterLimit,
    frameIncludeVerbs,
    frameFlagTarget,
    model,
    promptTemplate,
    priority,
    reasoningEffort,
  ]);

  // Auto-render preview on Review step with debounce, using the same API used for submission rendering
  useEffect(() => {
    if (!isOpen) return;
    if (!isCreating) return;
    if (currentStep !== 'review') return;
    if (!isScopeValid || !promptIsValid) return;
    if (previewTimerRef.current) {
      window.clearTimeout(previewTimerRef.current);
    }
    previewTimerRef.current = window.setTimeout(() => {
      void handlePreview();
      void handleEstimate();
    }, 350);
    return () => {
      if (previewTimerRef.current) {
        window.clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
    };
  }, [
    isOpen,
    isCreating,
    currentStep,
    isScopeValid,
    promptIsValid,
    scopeMode,
    manualIdsText,
    frameIdsText,
    promptTemplate,
    model,
    selectedIds,
    handlePreview,
    handleEstimate,
  ]);

  const scopeSummary = useMemo(() => {
    switch (scopeMode) {
      case 'selection':
        return parsedSelectionCount > 0
          ? `${parsedSelectionCount} selected entr${parsedSelectionCount === 1 ? 'y' : 'ies'}`
          : 'No table rows selected';
      case 'all':
        return `All ${mode}`;
      case 'filters':
        return 'Advanced filters';
      case 'manual':
        return manualIds.length > 0 ? `${manualIds.length} manual ID${manualIds.length === 1 ? '' : 's'}` : 'No manual IDs provided';
      case 'frames':
        return frameIds.length > 0 ? `${frameIds.length} frame ID${frameIds.length === 1 ? '' : 's'}` : 'No frame IDs provided';
      default:
        return '';
    }
  }, [scopeMode, mode, parsedSelectionCount, manualIds, frameIds]);

  const scopeExampleList = useMemo(() => {
    if (scopeMode === 'manual') {
      return manualIds.slice(0, 5);
    }
    if (scopeMode === 'frames') {
      return frameIds.slice(0, 5);
    }
    return [];
  }, [scopeMode, manualIds, frameIds]);

  const goToNextStep = useCallback(() => {
    if (isLastStep) return;
    setCurrentStep(STEPPER_STEPS[stepIndex + 1]);
  }, [isLastStep, stepIndex]);

  const goToPreviousStep = useCallback(() => {
    if (stepIndex === 0) return;
    setCurrentStep(STEPPER_STEPS[stepIndex - 1]);
  }, [stepIndex]);

  const modelLabel = useMemo(() => MODEL_OPTIONS.find(option => option.value === model)?.label ?? model, [model]);

  const renderStepContent = () => {
    switch (currentStep) {
      case 'details':
        return (
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-gray-600">Job Label</label>
              <input
                value={label}
                onChange={event => setLabel(event.target.value)}
                placeholder="Optional job label"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-2 text-xs text-gray-500">Give the batch a short name to identify it later in the jobs list.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">Model</label>
              <select
                value={model}
                onChange={event => setModel(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {MODEL_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-gray-500">Higher accuracy models cost more tokens but produce better moderation decisions.</p>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-600">Priority</label>
                <select
                  value={priority}
                  onChange={event => setPriority(event.target.value as 'flex' | 'normal' | 'priority')}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="flex">flex</option>
                  <option value="normal">normal</option>
                  <option value="priority">priority</option>
                </select>
                <p className="mt-2 text-xs text-gray-500">Maps to OpenAI service tiers: flex, default, or priority.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Reasoning Effort</label>
                <select
                  value={reasoningEffort}
                  onChange={event => setReasoningEffort(event.target.value as 'low' | 'medium' | 'high')}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
                <p className="mt-2 text-xs text-gray-500">Controls model's internal reasoning effort where supported.</p>
              </div>
            </div>
          </div>
        );
      case 'scope':
        return (
          <div className="space-y-4">
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
                onImportFromUrl={() => {
                  const ast = parseURLToFilterAST(mode, searchParams?.toString() ?? '');
                  if (ast) setFilterGroup(ast);
                }}
                filterValidateLoading={filterValidateLoading}
                filterValidateError={filterValidateError}
                filterValidateCount={filterValidateCount}
                filterValidateSample={filterValidateSample}
                onValidateFilters={handleValidateFilters}
                frameIncludeVerbs={frameIncludeVerbs}
                onFrameIncludeVerbsChange={setFrameIncludeVerbs}
                frameFlagTarget={frameFlagTarget}
                onFrameFlagTargetChange={setFrameFlagTarget}
            />
            {!isScopeValid && (
              <p className="text-xs text-red-500">
                {scopeMode === 'manual' && manualIds.length > 0 && manualIds.some(id => !validatedManualIds.has(id))
                  ? 'Some manual IDs are invalid. Please ensure all IDs exist in the database.'
                  : scopeMode === 'frames' && frameIds.length > 0 && frameIds.some(id => !validatedFrameIds.has(id))
                  ? (frameIncludeVerbs && mode === 'verbs' 
                      ? 'Some frame IDs are invalid or have no associated verbs. Please ensure all frame IDs exist and have verbs.'
                      : 'Some frame IDs are invalid. Please ensure all frame IDs exist in the database.')
                  : 'Choose at least one target before continuing.'}
              </p>
            )}
            <p className="text-xs text-gray-500">Scope defines which entries the AI will review in this batch.</p>
          </div>
        );
      case 'prompt':
        return (
          <div className="space-y-4">
            <div className="relative">
              <label className="block text-xs font-medium text-gray-600">Prompt Template</label>
              <div className="relative mt-1">
                {/* Highlight overlay (behind the textarea) */}
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-md px-3 py-2 text-sm text-gray-900">
                  <div
                    className="whitespace-pre-wrap break-words"
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
                    // keep menu aligned if visible
                    if (showVariableMenu) {
                      const cursorPos = target.selectionStart;
                      const pos = calculateCursorPosition(target, cursorPos);
                      setMenuPosition(pos);
                    }
                  }}
                  rows={12}
                  className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ color: 'transparent', caretColor: '#111827' }}
                  placeholder="Write instructions for the AI..."
                />
              </div>
              {showVariableMenu && (
                <div
                  className="fixed z-10 max-h-48 w-60 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg"
                  style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
                >
                  {filteredVariables.length === 0 ? (
                    <div className="p-2 text-xs text-gray-500">No matching variables</div>
                  ) : (
                    <ul>
                      {filteredVariables.map((variable, idx) => (
                        <li key={variable.key}>
                          <button
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
              <p className="mt-2 text-xs text-gray-500">
                Type <code className="rounded bg-gray-100 px-1">{'{{'}</code> to insert dynamic variables from each lexical entry.
              </p>
            </div>
          </div>
        );
      case 'review':
        return (
          <div className="space-y-6">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-2">
              <h4 className="text-xs font-semibold text-gray-800 mb-1.5">Summary</h4>
              <div className="grid grid-cols-3 gap-x-4 gap-y-0.5 text-[11px]">
                {/* Row 1: Label, Model, Priority */}
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
                
                {/* Row 2: Reasoning, Scope, Items */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Reasoning:</span>
                  <span className="text-gray-900 font-medium">{reasoningEffort}</span>
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
                    {/* Items (completes row 2, col 3) */}
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Items:</span>
                      <span className="text-gray-900 font-medium">{estimate.totalItems} <span className="text-gray-500">(sample {estimate.sampleSize})</span></span>
                    </div>
                    
                    {/* Row 3: Input/item, Output/item, Input total */}
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
                    
                    {/* Row 4: Output total, Est. cost, (empty) */}
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

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-gray-800">Preview</h4>
                <span className="text-xs text-gray-500">
                  {previewLoading ? 'Rendering…' : 'Auto-rendered'}
                </span>
              </div>
              {previewLoading && <p className="text-xs text-gray-500">Rendering preview for the current scope…</p>}
              {preview && !previewLoading && (
                <div className="space-y-2">
                  {preview.previews.length > 1 && (
                    <div className="flex items-center justify-between text-xs text-gray-600">
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
                  <div className="rounded-md border border-gray-200 bg-white text-xs text-gray-700 flex">
                    {/* Variables Section - 1/5 width */}
                    {Object.keys(preview.previews[currentPreviewIndex].variables).length > 0 && (
                      <div className="w-1/5 border-r border-gray-200 p-3 space-y-1">
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
                    {/* Prompt Section - 4/5 width */}
                    <div className={`relative p-3 ${Object.keys(preview.previews[currentPreviewIndex].variables).length > 0 ? 'w-4/5' : 'w-full'}`}>
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
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-gray-800 pr-8">{preview.previews[currentPreviewIndex].prompt}</pre>
                    </div>
                  </div>
                </div>
              )}
              {!preview && !previewLoading && (
                <p className="text-xs text-gray-500">Generate a preview to inspect how the prompt renders for the first entry in the batch.</p>
              )}
            </div>

            

            {/* Submission errors are shown as a global alert banner */}
          </div>
        );
      default:
        return null;
    }
  };

  const nextButtonLabel = currentStep === 'prompt' ? 'Review' : 'Next';

  const loadJobs = useCallback(async (silent = false) => {
    if (loadJobsInProgressRef.current) {
      console.log('[loadJobs] Already in progress, skipping');
      return;
    }
    
    loadJobsInProgressRef.current = true;
    if (!silent) {
      setJobsLoading(true);
      setJobsError(null);
    }
    
    try {
      // Don't pass entityType - we removed that filtering for performance
      const response = await api.get<JobListResponse>(`/api/llm-jobs?includeCompleted=true&limit=50`);
      
      // Smart update: only update state if jobs actually changed
      setJobs(prevJobs => {
        // Quick check: if lengths differ, definitely update
        if (prevJobs.length !== response.jobs.length) {
          return response.jobs;
        }
        
        // Check if any job has changed
        let hasChanges = false;
        for (let i = 0; i < prevJobs.length; i++) {
          const prev = prevJobs[i];
          const next = response.jobs.find(j => j.id === prev.id);
          
          if (!next) {
            hasChanges = true;
            break;
          }
          
          // Compare relevant fields
          if (
            prev.status !== next.status ||
            prev.submitted_items !== next.submitted_items ||
            prev.processed_items !== next.processed_items ||
            prev.succeeded_items !== next.succeeded_items ||
            prev.failed_items !== next.failed_items ||
            prev.flagged_items !== next.flagged_items ||
            prev.updated_at !== next.updated_at
          ) {
            hasChanges = true;
            break;
          }
        }
        
        // If nothing changed, return same reference to prevent re-render
        return hasChanges ? response.jobs : prevJobs;
      });
      
      setActiveJobId(prev => prev ?? response.jobs[0]?.id ?? null);
      
      // Clear any previous errors on success
      if (!silent) {
        setJobsError(null);
      }
    } catch (error) {
      // Don't show transient database errors in the UI - they resolve themselves
      // Only log them to console for debugging
      const errorMessage = error instanceof Error ? error.message : 'Failed to load jobs';
      const isTransient = errorMessage.includes('connection') ||
                         errorMessage.includes('unavailable') ||
                         errorMessage.includes('timed out') ||
                         errorMessage.includes('try again');
      
      if (isTransient) {
        console.warn('[loadJobs] Transient database error, will retry on next poll:', errorMessage);
        // Don't set error state for transient errors - just silently retry on next poll
      } else {
        // Only show persistent errors to users
        setJobsError(errorMessage);
      }
    } finally {
      if (!silent) {
        setJobsLoading(false);
      }
      loadJobsInProgressRef.current = false;
    }
  }, [mode]);

  const loadJobDetails = useCallback(async (jobId: string, silent = false) => {
    if (!silent) {
      setSelectedJobLoading(true);
    }
    try {
      const params = new URLSearchParams({
        pendingLimit: itemLimits.pending.toString(),
        succeededLimit: itemLimits.succeeded.toString(),
        failedLimit: itemLimits.failed.toString(),
      });
      const job = await api.get<SerializedJob>(`/api/llm-jobs/${jobId}?${params}`);
      
      // Smart update: only update state if job actually changed
      setSelectedJobDetails(prev => {
        if (!prev || prev.id !== job.id) {
          // Different job, always update
          return job;
        }
        
        // Same job - check if any fields changed
        const hasMetadataChanges = 
          prev.status !== job.status ||
          prev.total_items !== job.total_items ||
          prev.submitted_items !== job.submitted_items ||
          prev.processed_items !== job.processed_items ||
          prev.succeeded_items !== job.succeeded_items ||
          prev.failed_items !== job.failed_items ||
          prev.flagged_items !== job.flagged_items ||
          prev.updated_at !== job.updated_at;
        
        // Check if items changed
        const hasItemChanges = prev.items.length !== job.items.length || 
          prev.items.some((item, idx) => {
            const newItem = job.items[idx];
            return !newItem || 
              item.status !== newItem.status ||
              item.updated_at !== newItem.updated_at ||
              item.flagged !== newItem.flagged;
          });
        
        // If nothing changed, return same reference to prevent re-render
        if (!hasMetadataChanges && !hasItemChanges) {
          return prev;
        }
        
        // If only metadata changed (not items), preserve items array
        if (hasMetadataChanges && !hasItemChanges) {
          return {
            ...prev,
            status: job.status,
            total_items: job.total_items,
            submitted_items: job.submitted_items,
            processed_items: job.processed_items,
            succeeded_items: job.succeeded_items,
            failed_items: job.failed_items,
            flagged_items: job.flagged_items,
            updated_at: job.updated_at,
          };
        }
        
        // Otherwise, full update
        return job;
      });

      // Mark job as seen when user clicks on it (not during background polling)
      if (!silent) {
        try {
          await fetch(`/api/llm-jobs/${jobId}/mark-seen`, { method: 'POST' });
        } catch (error) {
          console.error('Failed to mark job as seen:', error);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // If job not found, it was likely deleted - clear selection
      if (errorMessage.includes('Job not found') || errorMessage.includes('404')) {
        console.log('Job not found, clearing selection');
        setSelectedJobDetails(null);
        setActiveJobId(null);
      } else {
        console.error('Failed to load job details:', error);
        if (!silent) {
          setSelectedJobDetails(null);
        }
      }
    } finally {
      if (!silent) {
        setSelectedJobLoading(false);
      }
    }
  }, [itemLimits]);

  const loadMoreItems = useCallback((status: 'pending' | 'succeeded' | 'failed') => {
    setItemLimits(prev => ({
      ...prev,
      [status]: prev[status] + 10,
    }));
  }, []);

  // Reset itemLimits when active job changes
  useEffect(() => {
    if (activeJobId) {
      setItemLimits({ pending: 10, succeeded: 10, failed: 10 });
    }
  }, [activeJobId]);

  // Note: Lambda function now handles all submission automatically
  // This function is kept for backward compatibility but just tracks progress from DB
  const startJobSubmission = useCallback(async (jobId: string) => {
    // Lambda handles submission - this just shows progress based on DB values
    console.log(`[Submit] Job ${jobId} submission handled by Lambda function`);
    
    // Initialize progress tracking from current DB values
    const job = jobs.find(j => j.id === jobId);
    if (job) {
      setSubmissionProgress({
        jobId: job.id,
        submitted: job.submitted_items ?? 0,
        total: job.total_items,
        failed: job.failed_items ?? 0,
        isSubmitting: job.status === 'queued' || (job.submitted_items ?? 0) < job.total_items,
      });
    }
  }, [jobs]);

  useEffect(() => {
    if (isOpen) {
      void loadJobs();
    }
  }, [isOpen, loadJobs]);

  // Load job details when a job is selected
  useEffect(() => {
    if (activeJobId && isOpen && !isCreating) {
      void loadJobDetails(activeJobId);
    }
  }, [activeJobId, isOpen, isCreating, loadJobDetails]);

  // Track submission progress for active jobs (Lambda handles actual submission)
  useEffect(() => {
    if (!isOpen || jobs.length === 0) return;
    
    // Find jobs that are actively being submitted/processed
    const activeJob = jobs.find(job => 
      (job.status === 'queued' || job.status === 'running') &&
      (job.submitted_items ?? 0) < job.total_items
    );
    
    if (activeJob) {
      // Show progress for the active job (updated by Lambda in DB)
      setSubmissionProgress({
        jobId: activeJob.id,
        submitted: activeJob.submitted_items ?? 0,
        total: activeJob.total_items,
        failed: activeJob.failed_items ?? 0,
        isSubmitting: true,
      });
    } else if (submissionProgress?.isSubmitting) {
      // Clear progress when job is complete
      setSubmissionProgress(null);
    }
  }, [isOpen, jobs, submissionProgress?.isSubmitting]);

  // Simple periodic refresh - Lambda function handles both submission and polling
  // This just fetches the latest data from the database to show progress
  useEffect(() => {
    if (!isOpen) return;
    
    const activeJobs = jobs.filter(job => job.status === 'queued' || job.status === 'running');
    if (activeJobs.length === 0) return;

    // Reload data from database every 5 seconds
    // AWS Lambda is doing the actual OpenAI polling in the background
    const interval = setInterval(async () => {
      if (pollingInProgressRef.current) {
        console.log('[Refresh] Skipping - previous refresh still in progress');
        return;
      }

      pollingInProgressRef.current = true;
      try {
        // Use silent=true to avoid loading spinners and only update if data changed
        await loadJobs(true);
        if (activeJobId && !isCreating) {
          await loadJobDetails(activeJobId, true);
        }
      } catch (error) {
        // Check if this is a "Job not found" error (likely because job was deleted)
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('Job not found') || errorMessage.includes('404')) {
          console.log('[Refresh] Active job no longer exists, clearing selection');
          setActiveJobId(null);
          setSelectedJobDetails(null);
        } else {
          console.error('Failed to refresh job data:', error);
        }
      } finally {
        pollingInProgressRef.current = false;
      }
    }, 5000); // 5 second refresh interval

    return () => clearInterval(interval);
  }, [isOpen, jobs, loadJobDetails, activeJobId, isCreating, loadJobs]);

  useEffect(() => {
    if (typeof onJobsUpdated === 'function') {
      onJobsUpdated(pendingJobsCount);
    }
  }, [pendingJobsCount, onJobsUpdated]);

  // Dynamic variables based on mode
  const availableVariables = useMemo(() => {
    return getVariablesForEntityType(mode);
  }, [mode]);

  const filteredVariables = useMemo(() => {
    const query = variableQuery.trim().toLowerCase();
    if (!query) return availableVariables;
    return availableVariables.filter(variable =>
      variable.key.toLowerCase().includes(query) || variable.label.toLowerCase().includes(query)
    );
  }, [variableQuery, availableVariables]);
  const renderHighlighted = (text: string) => {
    // Only highlight well-formed {{variable_name}} tokens (no nested braces)
    const tokenRegex = /(\{\{[a-zA-Z0-9_]+\}\})/g;
    const parts = text.split(tokenRegex);
    return parts.map((part, index) => {
      if (tokenRegex.test(part)) {
        return (
          <strong key={`${index}-b`} className="font-semibold text-gray-900">
            {part}
          </strong>
        );
      }
      return <span key={`${index}-t`}>{part}</span>;
    });
  };

  const handlePromptChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { value, selectionStart } = event.target;
    setPromptTemplate(value);

    const uptoCursor = value.slice(0, selectionStart);
    const openIndex = uptoCursor.lastIndexOf('{{');
    const closeIndex = uptoCursor.lastIndexOf('}}');

    if (openIndex !== -1 && openIndex > closeIndex) {
      setShowVariableMenu(true);
      const query = uptoCursor.slice(openIndex + 2).trim();
      setVariableQuery(query);
      setVariableActiveIndex(0);
      
      // Calculate cursor position for menu placement
      requestAnimationFrame(() => {
        if (promptRef.current) {
          const position = calculateCursorPosition(promptRef.current, selectionStart);
          setMenuPosition(position);
        }
      });
    } else {
      setShowVariableMenu(false);
      setVariableQuery('');
      setVariableActiveIndex(-1);
    }
  };

  const handlePromptKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showVariableMenu || filteredVariables.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setVariableActiveIndex(prev => (prev + 1) % filteredVariables.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setVariableActiveIndex(prev => (prev - 1 + filteredVariables.length) % filteredVariables.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const idx = variableActiveIndex >= 0 ? variableActiveIndex : 0;
      const choice = filteredVariables[idx];
      if (choice) insertVariable(choice.key);
    } else if (event.key === 'Escape') {
      setShowVariableMenu(false);
      setVariableActiveIndex(-1);
    }
  };

  const getReplacementRange = (text: string, caretStart: number, caretEnd: number) => {
    // Find the earliest unmatched '{{' before the caret using a simple stack
    const tokenRegex = /\{\{|\}\}/g;
    let match: RegExpExecArray | null;
    const stack: number[] = [];
    while ((match = tokenRegex.exec(text)) && match.index < caretStart) {
      if (match[0] === '{{') {
        stack.push(match.index);
      } else if (stack.length > 0) {
        stack.pop();
      }
    }
    // If not inside any unmatched token, fallback to last '{{'
    if (stack.length === 0) {
      const lastOpen = text.lastIndexOf('{{', caretStart);
      if (lastOpen === -1) return { start: caretStart, end: caretEnd };
      return { start: lastOpen, end: caretEnd };
    }
    const openIndex = stack[0]; // earliest unmatched open
    // Find the closing that balances that earliest unmatched open
    let depth = stack.length;
    while ((match = tokenRegex.exec(text))) {
      if (match[0] === '{{') depth += 1;
      else depth -= 1;
      if (depth === 0) {
        return { start: openIndex, end: match.index + 2 };
      }
    }
    // If no closing found, replace up to the caret
    return { start: openIndex, end: caretEnd };
  };

  // Search for manual IDs
  const searchManualIds = useCallback(async (query: string) => {
    if (!query || query.trim().length < 2) {
      setManualIdSuggestions([]);
      setManualIdActiveIndex(-1);
      return;
    }
    try {
      const response = await api.get<{ results: Array<{ code: string; gloss: string }> }>(
        `/api/llm-jobs/search-ids?q=${encodeURIComponent(query)}&pos=${mode}&limit=10`
      );
      setManualIdSuggestions(response.results);
      setManualIdActiveIndex(response.results.length > 0 ? 0 : -1);
    } catch (error) {
      console.error('Failed to search manual IDs:', error);
      setManualIdSuggestions([]);
      setManualIdActiveIndex(-1);
    }
  }, [mode]);

  // Search for frame IDs
  const searchFrameIds = useCallback(async (query: string) => {
    if (!query || query.trim().length < 2) {
      setFrameIdSuggestions([]);
      setFrameIdActiveIndex(-1);
      return;
    }
    try {
      const response = await api.get<{ results: Array<{ id: string; frame_name: string }> }>(
        `/api/llm-jobs/search-frames?q=${encodeURIComponent(query)}&limit=10`
      );
      setFrameIdSuggestions(response.results);
      setFrameIdActiveIndex(response.results.length > 0 ? 0 : -1);
    } catch (error) {
      console.error('Failed to search frame IDs:', error);
      setFrameIdSuggestions([]);
      setFrameIdActiveIndex(-1);
    }
  }, []);

  // Validate manual IDs
  useEffect(() => {
    if (scopeMode !== 'manual' || manualIds.length === 0) {
      setValidatedManualIds(new Set());
      return;
    }
    const validateIds = async () => {
      const validIds = new Set<string>();
      for (const id of manualIds) {
        try {
          const normalized = normalizeLexicalCode(id);
          const response = await api.get<{ results: Array<{ code: string }> }>(
            `/api/llm-jobs/search-ids?q=${encodeURIComponent(normalized)}&pos=${mode}&limit=1`
          );
          if (response.results.some(r => r.code.toLowerCase() === normalized.toLowerCase())) {
            validIds.add(id);
          }
        } catch (error) {
          console.error(`Failed to validate ID ${id}:`, error);
        }
      }
      setValidatedManualIds(validIds);
    };
    const timeoutId = setTimeout(validateIds, 500);
    return () => clearTimeout(timeoutId);
  }, [manualIds, scopeMode, mode]);

  // Validate frame IDs
  useEffect(() => {
    if (scopeMode !== 'frames' || frameIds.length === 0) {
      setValidatedFrameIds(new Set());
      return;
    }
    const validateIds = async () => {
      const validIds = new Set<string>();
      for (const id of frameIds) {
        try {
          const response = await api.get<{ results: Array<{ id: string; frame_name: string }> }>(
            `/api/llm-jobs/search-frames?q=${encodeURIComponent(id)}&limit=1`
          );
          // Match by numeric id or frame_name (case-insensitive)
          const frameResult = response.results.find(r => 
            r.id === id || r.frame_name.toLowerCase() === id.toLowerCase()
          );
          
          if (frameResult) {
            // If we're including verbs, validate that the frame has verbs
            if (frameIncludeVerbs && mode === 'verbs') {
              try {
                // Check if frame has verbs using the paginated endpoint which includes counts
                // Use the numeric ID for the search
                const frameDetailsResponse = await api.get(`/api/frames/paginated?search=${encodeURIComponent(frameResult.frame_name)}&limit=1`);
                const frameData = frameDetailsResponse as { data?: Array<{ verbs_count?: number }> };
                // Only mark as valid if frame has verbs
                if (frameData.data && frameData.data.length > 0 && frameData.data[0].verbs_count && frameData.data[0].verbs_count > 0) {
                  validIds.add(id);
                }
              } catch (error) {
                console.error(`Failed to check verb count for frame ${id}:`, error);
              }
            } else {
              validIds.add(id);
            }
          }
        } catch (error) {
          console.error(`Failed to validate frame ID ${id}:`, error);
        }
      }
      setValidatedFrameIds(validIds);
    };
    const timeoutId = setTimeout(validateIds, 500);
    return () => clearTimeout(timeoutId);
  }, [frameIds, scopeMode, frameIncludeVerbs, mode]);

  const handleManualIdChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { value, selectionStart } = event.target;
    setManualIdsText(value);
    
    // Extract the current word being typed
    const textBeforeCursor = value.slice(0, selectionStart);
    const words = textBeforeCursor.split(/[\s,;,\n]/);
    const currentWord = words[words.length - 1] || '';
    
    if (currentWord.length >= 2) {
      setShowManualIdMenu(true);
      setManualIdQuery(currentWord);
      void searchManualIds(currentWord);
      
      requestAnimationFrame(() => {
        if (manualIdInputRef.current) {
          const position = calculateCursorPosition(manualIdInputRef.current, selectionStart);
          setManualIdMenuPosition(position);
          if ((document as any).fonts?.ready) {
            (document as any).fonts.ready.then(() => {
              if (manualIdInputRef.current && showManualIdMenu) {
                const pos2 = calculateCursorPosition(
                  manualIdInputRef.current,
                  manualIdInputRef.current.selectionStart ?? selectionStart
                );
                setManualIdMenuPosition(pos2);
              }
            });
          }
        }
      });
    } else {
      setShowManualIdMenu(false);
      setManualIdQuery('');
    }
  };

  const handleManualIdKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showManualIdMenu || manualIdSuggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setManualIdActiveIndex(prev => (prev + 1) % manualIdSuggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setManualIdActiveIndex(prev => (prev - 1 + manualIdSuggestions.length) % manualIdSuggestions.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const idx = manualIdActiveIndex >= 0 ? manualIdActiveIndex : 0;
      const choice = manualIdSuggestions[idx];
      if (choice) insertManualId(choice.code);
    } else if (event.key === 'Escape') {
      setShowManualIdMenu(false);
      setManualIdActiveIndex(-1);
    }
  };

  const handleFrameIdChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { value, selectionStart } = event.target;
    setFrameIdsText(value);
    
    // Extract the current word being typed
    const textBeforeCursor = value.slice(0, selectionStart);
    const words = textBeforeCursor.split(/[\s,;,\n]/);
    const currentWord = words[words.length - 1] || '';
    
    if (currentWord.length >= 2) {
      setShowFrameIdMenu(true);
      setFrameIdQuery(currentWord);
      void searchFrameIds(currentWord);
      
      requestAnimationFrame(() => {
        if (frameIdInputRef.current) {
          const position = calculateCursorPosition(frameIdInputRef.current, selectionStart);
          setFrameIdMenuPosition(position);
          if ((document as any).fonts?.ready) {
            (document as any).fonts.ready.then(() => {
              if (frameIdInputRef.current && showFrameIdMenu) {
                const pos2 = calculateCursorPosition(
                  frameIdInputRef.current,
                  frameIdInputRef.current.selectionStart ?? selectionStart
                );
                setFrameIdMenuPosition(pos2);
              }
            });
          }
        }
      });
    } else {
      setShowFrameIdMenu(false);
      setFrameIdQuery('');
    }
  };

  const handleFrameIdKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showFrameIdMenu || frameIdSuggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setFrameIdActiveIndex(prev => (prev + 1) % frameIdSuggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFrameIdActiveIndex(prev => (prev - 1 + frameIdSuggestions.length) % frameIdSuggestions.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const idx = frameIdActiveIndex >= 0 ? frameIdActiveIndex : 0;
      const choice = frameIdSuggestions[idx];
      if (choice) insertFrameId(choice.frame_name);
    } else if (event.key === 'Escape') {
      setShowFrameIdMenu(false);
      setFrameIdActiveIndex(-1);
    }
  };

  const insertManualId = (code: string) => {
    const textarea = manualIdInputRef.current;
    if (!textarea) return;

    const { selectionStart, selectionEnd, value } = textarea;
    const textBeforeCursor = value.slice(0, selectionStart);
    const words = textBeforeCursor.split(/[\s,;,\n]/);
    const beforeLastWord = textBeforeCursor.slice(0, textBeforeCursor.length - (words[words.length - 1]?.length || 0));
    const after = value.slice(selectionEnd);
    
    const newValue = `${beforeLastWord}${code}${after}`;
    setManualIdsText(newValue);
    setShowManualIdMenu(false);
    setManualIdActiveIndex(-1);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = beforeLastWord.length + code.length;
      textarea.selectionStart = cursor;
      textarea.selectionEnd = cursor;
    });
  };

  const insertFrameId = (id: string) => {
    const textarea = frameIdInputRef.current;
    if (!textarea) return;

    const { selectionStart, selectionEnd, value } = textarea;
    const textBeforeCursor = value.slice(0, selectionStart);
    const words = textBeforeCursor.split(/[\s,;,\n]/);
    const beforeLastWord = textBeforeCursor.slice(0, textBeforeCursor.length - (words[words.length - 1]?.length || 0));
    const after = value.slice(selectionEnd);
    
    const newValue = `${beforeLastWord}${id}${after}`;
    setFrameIdsText(newValue);
    setShowFrameIdMenu(false);
    setFrameIdActiveIndex(-1);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = beforeLastWord.length + id.length;
      textarea.selectionStart = cursor;
      textarea.selectionEnd = cursor;
    });
  };

  const insertVariable = (key: string) => {
    const textarea = promptRef.current;
    if (!textarea) return;

    const { selectionStart, selectionEnd, value } = textarea;
    const toInsert = `{{${key}}}`;

    const { start: replaceStart, end: replaceEnd } = getReplacementRange(value, selectionStart, selectionEnd);
    const before = value.slice(0, replaceStart);
    const after = value.slice(replaceEnd);
    const newValue = `${before}${toInsert}${after}`;
    setPromptTemplate(newValue);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = before.length + toInsert.length;
      textarea.selectionStart = cursor;
      textarea.selectionEnd = cursor;
    });
    setShowVariableMenu(false);
    setVariableActiveIndex(-1);
  };

  const handleValidateFilters = async () => {
    setFilterValidateLoading(true);
    setFilterValidateError(null);
    setFilterValidateCount(null);
    setFilterValidateSample([]);
    try {
      const scope = buildScope('filters', mode, [], '', '', filterGroup, filterLimit, frameIncludeVerbs, frameFlagTarget);
      const resp = await api.post<{ totalItems: number; sampleSize: number; sample: Array<{ code: string; gloss: string }> }>(
        '/api/llm-jobs/validate',
        { scope }
      );
      setFilterValidateCount(resp.totalItems);
      setFilterValidateSample(resp.sample);
    } catch (error) {
      setFilterValidateError(error instanceof Error ? error.message : 'Validation failed');
    } finally {
      setFilterValidateLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (isSubmitDisabled) return;
    setSubmissionLoading(true);
    setSubmissionError(null);
    try {
      const scope = buildScope(scopeMode, mode, selectedIds, manualIdsText, frameIdsText, filterGroup, filterLimit, frameIncludeVerbs, frameFlagTarget);
      
      // Create job (fast, DB-only operation)
      const job = await api.post<SerializedJob>('/api/llm-jobs', {
        label,
        model,
        promptTemplate,
        scope,
        serviceTier: priority === 'normal' ? 'default' : priority,
        reasoning: { effort: reasoningEffort },
        metadata: {
          source: 'table-mode',
        },
      });
      
      // Update UI immediately
      await loadJobs();
      setActiveJobId(job.id);
      closeCreateFlow();
      
      // Start submission progress tracking (Lambda will handle actual submission)
      setSubmissionProgress({
        jobId: job.id,
        submitted: 0,
        total: job.total_items,
        failed: 0,
        isSubmitting: true,
      });
      
      showGlobalAlert({
        type: 'success',
        title: 'Job Created',
        message: `Job ${job.id} created with ${job.total_items} item${job.total_items === 1 ? '' : 's'}. Lambda will submit items automatically.`,
        durationMs: 5000,
      });
      
      // Initialize progress display (Lambda handles actual submission)
      void startJobSubmission(job.id);
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit job';
      setSubmissionError(message);
      showGlobalAlert({
        type: 'error',
        title: 'Submission failed',
        message,
        durationMs: 7000,
      });
    } finally {
      setSubmissionLoading(false);
    }
  };

  const handleCancelJob = useCallback(async (jobId: string) => {
    try {
      await api.post(`/api/llm-jobs/${jobId}/cancel`, {});
      await loadJobs();
      // Reload the job details to show updated status
      if (activeJobId === jobId) {
        await loadJobDetails(jobId);
      }
    } catch (error) {
      console.error('Failed to cancel job', error);
    }
  }, [loadJobs, loadJobDetails, activeJobId]);

  const handleDeleteJob = useCallback(async (jobId: string) => {
    try {
      await api.delete(`/api/llm-jobs/${jobId}`);
      
      // Immediately clear the selection to prevent race conditions with polling
      setActiveJobId(prev => (prev === jobId ? null : prev));
      setSelectedJobDetails(null);
      
      // Then reload the job list
      await loadJobs();
      
      showGlobalAlert({
        type: 'success',
        title: 'Deleted',
        message: `Job ${jobId} deleted.`,
        durationMs: 5000,
      });
    } catch (error) {
      console.error('Failed to delete job', error);
      showGlobalAlert({
        type: 'error',
        title: 'Delete failed',
        message: error instanceof Error ? error.message : 'Failed to delete job',
        durationMs: 7000,
      });
    }
  }, [loadJobs]);

  const selectedJob = useMemo(() => jobs.find(job => job.id === activeJobId) ?? jobs[0] ?? null, [jobs, activeJobId]);

  const pendingBadge = pendingJobsCount > 0 ? pendingJobsCount : null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}
        onClick={onClose}
      />
      <div className="relative z-10 flex h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="border-b border-gray-200 bg-gray-50 px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
              <h2 className="text-xl font-semibold text-gray-900">AI Batch Moderation</h2>
            <p className="text-sm text-gray-600">Create and track AI-assisted flagging runs for {mode} table entries.</p>
          </div>
            <div className="flex items-center gap-2">
            {pendingBadge && (
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                Pending Jobs: {pendingBadge}
              </span>
            )}
            <button
              onClick={() => loadJobs()}
              disabled={jobsLoading}
              className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium transition focus:outline-none focus:ring-2 ${
                jobsLoading
                  ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 focus:ring-gray-300'
                  : 'cursor-pointer border-gray-300 bg-white text-gray-700 hover:bg-gray-100 focus:ring-blue-500'
              }`}
              type="button"
            >
              <svg className={`h-4 w-4 ${jobsLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            <button
              onClick={onClose}
                className="cursor-pointer inline-flex items-center gap-1 rounded-md bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400"
                type="button"
            >
              Close
            </button>
          </div>
          </div>
          {/* Success messages are shown as a global alert banner */}
        </header>

        {isCreating ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="border-b border-gray-200 px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Create New Job</p>
                  <h3 className="text-base font-semibold text-gray-900">{STEP_TITLES[currentStep]}</h3>
                </div>
                <button
                  onClick={closeCreateFlow}
                  className="cursor-pointer inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="cursor-pointer inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  type="button"
                >
                  Back
                </button>
                <div className="flex items-center gap-3">
                  {!isLastStep ? (
                    <button
                      onClick={goToNextStep}
                      disabled={nextDisabled}
                      className="cursor-pointer inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:from-blue-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 disabled:pointer-events-none"
                      type="button"
                    >
                      {nextButtonLabel}
                    </button>
                  ) : (
                    <button
                      onClick={handleSubmit}
                      disabled={isSubmitDisabled}
                      className="cursor-pointer inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:from-blue-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 disabled:pointer-events-none"
                      type="button"
                    >
                      {submissionLoading ? (
                        <>
                          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Creating Job…
                        </>
                      ) : (
                        'Submit Job'
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            <aside className="w-96 border-r border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-6 py-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">Jobs</h3>
                </div>
                <button
                  onClick={startCreateFlow}
                  disabled={isCreating}
                  className="cursor-pointer inline-flex items-center justify-center rounded-md bg-gradient-to-r from-blue-500 to-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:from-blue-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 disabled:pointer-events-none"
                  type="button"
                >
                  Create New Job
                </button>
              </div>
              <div className="h-full overflow-auto px-2">
                {jobsError && (
                  <div className="m-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {jobsError}
                  </div>
                )}
                {jobs.length === 0 && !jobsLoading ? (
                  <div className="p-4 text-xs text-gray-500">
                    No AI jobs yet. Use "Create New Job" to start a batch.
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-200">
                    {jobs.map(job => (
                      <li key={job.id} className="relative">
                        <button
                          onClick={() => setActiveJobId(job.id)}
                          className={`cursor-pointer flex w-full flex-col items-start gap-1 rounded-md px-4 py-3 text-left transition ${
                            job.id === selectedJob?.id ? 'bg-white shadow-inner' : 'hover:bg-white'
                          }`}
                          type="button"
                        >
                          <div className="flex w-full items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">{job.label ?? `Job ${job.id}`}</span>
                            <div className="flex items-center gap-2">
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  loadJobSettings(job);
                                }}
                                className="cursor-pointer rounded p-1 text-blue-600 hover:bg-blue-50"
                                title="Clone job settings"
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    loadJobSettings(job);
                                  }
                                }}
                              >
                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              </div>
                              <StatusPill status={job.status} />
                            </div>
                          </div>
                          <div className="flex w-full items-center justify-between text-xs text-gray-500">
                            <span>{job.total_items} items</span>
                            <span>{new Date(job.created_at).toLocaleString()}</span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>

            <main className="relative flex flex-1 flex-col overflow-hidden bg-white">
              <div className="flex-1 overflow-auto px-8 py-6">
                {selectedJobLoading ? (
                  <div className="flex h-full items-center justify-center text-sm text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="h-6 w-6 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Loading job details...</span>
                    </div>
                  </div>
                ) : selectedJobDetails ? (
                  <JobDetails
                    job={selectedJobDetails}
                    onCancel={handleCancelJob}
                    onDelete={handleDeleteJob}
                    onClose={onClose}
                    onCloneSettings={loadJobSettings}
                    submissionProgress={submissionProgress}
                    mode={mode}
                    onLoadMore={loadMoreItems}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-gray-500">
                    Select a job from the list to view details.
                  </div>
                )}
              </div>
            </main>
          </div>
        )}
      </div>
    </div>
  );
}

function parseIds(raw: string): string[] {
  return raw
    .split(/\s|,|;|\n/)
    .map(value => value.trim())
    .filter(Boolean);
}

function idsToText(ids: string[]): string {
  return ids.join(', ');
}

function serviceTierToPriority(tier?: string | null): 'flex' | 'normal' | 'priority' {
  if (tier === 'flex') return 'flex';
  if (tier === 'priority') return 'priority';
  return 'normal'; // default or null
}

function buildScope(
  mode: ScopeMode,
  pos: 'verbs' | 'nouns' | 'adjectives' | 'adverbs' | 'frames',
  selectedIds: string[],
  manualIdsText: string,
  frameIdsText: string,
  filterGroup?: BooleanFilterGroup,
  filterLimit?: number,
  frameIncludeVerbs?: boolean,
  frameFlagTarget?: 'frame' | 'verb' | 'both'
) {
  switch (mode) {
    case 'selection':
      return {
        kind: 'ids',
        pos,
        ids: selectedIds,
      };
    case 'all':
      return {
        kind: 'filters',
        pos,
        filters: { limit: 0 },
      } as const;
    case 'filters':
      return {
        kind: 'filters',
        pos,
        filters: {
          limit: typeof filterLimit === 'number' ? filterLimit : 50,
          where: filterGroup && filterGroup.children.length > 0 ? filterGroup : undefined,
        },
      } as const;
    case 'manual':
      return {
        kind: 'ids',
        pos,
        ids: parseIds(manualIdsText).map(normalizeLexicalCode),
      };
    case 'frames':
      return {
        kind: 'frame_ids',
        pos,
        frameIds: parseIds(frameIdsText),
        includeVerbs: frameIncludeVerbs,
        flagTarget: frameFlagTarget,
      };
    default:
      return {
        kind: 'ids',
        pos,
        ids: selectedIds,
      };
  }
}

function normalizeLexicalCode(input: string): string {
  const value = input.trim().toLowerCase();
  const match = value.match(/^([a-z0-9_]+)\.([vna])\.([0-9]{1,2})$/);
  if (!match) return value;
  const [, lemma, pos, sense] = match;
  const padded = sense.padStart(2, '0');
  return `${lemma}.${pos}.${padded}`;
}

function truncate(value: string, length: number) {
  if (value.length <= length) return value;
  return `${value.slice(0, length)}…`;
}

const StatusPill = memo(function StatusPill({ status }: { status: SerializedJob['status'] }) {
  const { label, color } = useMemo(() => {
    switch (status) {
      case 'queued':
        return { label: 'Queued', color: 'bg-yellow-100 text-yellow-800' };
      case 'running':
        return { label: 'Running', color: 'bg-blue-100 text-blue-800' };
      case 'completed':
        return { label: 'Completed', color: 'bg-green-100 text-green-800' };
      case 'failed':
        return { label: 'Failed', color: 'bg-red-100 text-red-800' };
      case 'cancelled':
        return { label: 'Cancelled', color: 'bg-gray-200 text-gray-700' };
      case 'paused':
        return { label: 'Paused', color: 'bg-orange-100 text-orange-700' };
      default:
        return { label: status, color: 'bg-gray-200 text-gray-700' };
    }
  }, [status]);

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${color}`}>
      {label}
    </span>
  );
});

const JobDetails = memo(function JobDetails({ 
  job, 
  onCancel, 
  onDelete, 
  onClose,
  onCloneSettings,
  submissionProgress,
  mode,
  onLoadMore
}: { 
  job: SerializedJob; 
  onCancel: (jobId: string) => void; 
  onDelete: (jobId: string) => void; 
  onClose: () => void;
  onCloneSettings: (job: SerializedJob) => void;
  submissionProgress: {
    jobId: string;
    submitted: number;
    total: number;
    failed: number;
    isSubmitting: boolean;
  } | null;
  mode: 'verbs' | 'nouns' | 'adjectives' | 'adverbs' | 'frames';
  onLoadMore: (status: 'pending' | 'succeeded' | 'failed') => void;
}) {
  const router = useRouter();
  
  // Memoize filtered item lists to prevent re-computation
  const pendingItems = useMemo(
    () => job.items.filter(item => item.status === 'queued' || item.status === 'processing'),
    [job.items]
  );
  const succeededItems = useMemo(
    () => job.items.filter(item => item.status === 'succeeded'),
    [job.items]
  );
  const failedItems = useMemo(
    () => job.items.filter(item => item.status === 'failed'),
    [job.items]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{job.label ?? `Job ${job.id}`}</h3>
          <p className="text-xs text-gray-500">Created {new Date(job.created_at).toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onCloneSettings(job)}
            className="cursor-pointer inline-flex items-center gap-2 rounded-md border border-blue-600 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            title="Clone job settings to create a new job"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Clone Job Settings
          </button>
          {job.status === 'completed' && (
            <button
              onClick={() => {
                onClose();
                // Navigate to the correct table page based on entity type
                const baseUrl = mode === 'verbs' || mode === 'frames'
                  ? `/table?flaggedByJobId=${encodeURIComponent(job.id)}&tab=${mode}`
                  : `/table/${mode}?flaggedByJobId=${encodeURIComponent(job.id)}`;
                router.push(baseUrl);
              }}
              className="cursor-pointer inline-flex items-center gap-2 rounded-md border border-blue-600 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            >
              See all flagged {mode}
            </button>
          )}
          {['queued', 'running'].includes(job.status) && (
            <button
              onClick={() => onCancel(job.id)}
              className="cursor-pointer inline-flex items-center gap-2 rounded-md border border-red-600 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              Cancel Job
            </button>
          )}
          <button
            onClick={() => onDelete(job.id)}
            className="cursor-pointer inline-flex items-center gap-2 rounded-md border border-red-600 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            Delete Job
          </button>
        </div>
      </div>

      {submissionProgress && submissionProgress.jobId === job.id && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-blue-800">
              Submitting to OpenAI...
            </span>
            <span className="text-sm text-blue-700">
              {submissionProgress.submitted} / {submissionProgress.total}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-blue-200">
            <div 
              className="h-full rounded-full bg-blue-600 transition-all duration-300"
              style={{ 
                width: `${(submissionProgress.submitted / submissionProgress.total) * 100}%` 
              }}
            />
          </div>
          {submissionProgress.failed > 0 && (
            <p className="mt-2 text-xs text-red-600">
              {submissionProgress.failed} items failed to submit
            </p>
          )}
        </div>
      )}

      {/* Completion Progress - shown when items are being processed by OpenAI */}
      {['queued', 'running'].includes(job.status) && 
       job.submitted_items === job.total_items && 
       (job.processed_items ?? 0) < job.total_items && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-green-800">
              Processing with OpenAI...
            </span>
            <span className="text-sm text-green-700">
              {job.processed_items ?? 0} / {job.total_items}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-green-200">
            <div 
              className="h-full rounded-full bg-green-600 transition-all duration-300"
              style={{ 
                width: `${((job.processed_items ?? 0) / job.total_items) * 100}%` 
              }}
            />
          </div>
          <div className="mt-2 flex gap-3 text-xs">
            {(job.succeeded_items ?? 0) > 0 && (
              <span className="text-green-700">
                ✓ {job.succeeded_items} succeeded
              </span>
            )}
            {(job.failed_items ?? 0) > 0 && (
              <span className="text-red-600">
                ✗ {job.failed_items} failed
              </span>
            )}
            {(job.flagged_items ?? 0) > 0 && (
              <span className="text-amber-600">
                ⚠ {job.flagged_items} flagged
              </span>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Status" value={<StatusPill status={job.status} />} />
        <Metric label="Items" value={`${job.processed_items}/${job.total_items}`} helper="Processed" />
        <Metric label="Succeeded" value={job.succeeded_items.toString()} helper="Items completed" />
        <Metric label="Failed" value={job.failed_items.toString()} helper="Items errored" />
        <Metric label="Flagged" value={job.flagged_items.toString()} helper="AI suggested flagged" />
        <Metric
          label="Runtime"
          value={formatRuntime(job.started_at, job.completed_at ?? undefined)}
          helper="Duration"
        />
      </div>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-800">Job Items</h4>
        <ItemList 
          title="Pending" 
          items={pendingItems} 
          emptyMessage="No items pending." 
          totalCount={job.total_items - job.succeeded_items - job.failed_items}
          onLoadMore={() => onLoadMore('pending')}
        />
        <ItemList 
          title="Succeeded" 
          items={succeededItems} 
          emptyMessage="No successes yet." 
          totalCount={job.succeeded_items}
          onLoadMore={() => onLoadMore('succeeded')}
        />
        <ItemList 
          title="Failed" 
          items={failedItems} 
          emptyMessage="No failures." 
          totalCount={job.failed_items}
          onLoadMore={() => onLoadMore('failed')}
        />
      </section>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison to prevent re-renders when only counts change
  // We compare key fields that should trigger re-render
  return (
    prevProps.job.id === nextProps.job.id &&
    prevProps.job.status === nextProps.job.status &&
    prevProps.job.processed_items === nextProps.job.processed_items &&
    prevProps.job.succeeded_items === nextProps.job.succeeded_items &&
    prevProps.job.failed_items === nextProps.job.failed_items &&
    prevProps.job.flagged_items === nextProps.job.flagged_items &&
    prevProps.job.items.length === nextProps.job.items.length &&
    prevProps.submissionProgress?.jobId === nextProps.submissionProgress?.jobId &&
    prevProps.submissionProgress?.submitted === nextProps.submissionProgress?.submitted &&
    prevProps.onCancel === nextProps.onCancel &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.onCloneSettings === nextProps.onCloneSettings
  );
});

const Metric = memo(function Metric({ label, value, helper }: { label: string; value: string | JSX.Element; helper?: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-gray-900">{value}</div>
      {helper && <div className="text-[11px] text-gray-500">{helper}</div>}
    </div>
  );
});

const ItemList = memo(function ItemList({
  title,
  items,
  emptyMessage,
  totalCount,
  onLoadMore,
}: {
  title: string;
  items: SerializedJob['items'];
  emptyMessage: string;
  totalCount: number;
  onLoadMore?: () => void;
}) {
  const hasMore = items.length < totalCount;
  const remaining = totalCount - items.length;
  
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</h5>
        {items.length > 0 && (
          <span className="text-[11px] text-gray-500">Showing {items.length} of {totalCount}</span>
        )}
      </div>
      {items.length === 0 ? (
        <div className="rounded border border-dashed border-gray-200 p-3 text-[11px] text-gray-500">{emptyMessage}</div>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map(item => {
              const getItemColors = () => {
                switch (item.status) {
                  case 'queued':
                  case 'submitting':
                  case 'processing':
                    return 'border-blue-200 bg-blue-50 text-blue-700';
                  case 'succeeded':
                    return 'border-green-200 bg-green-50 text-green-700';
                  case 'failed':
                    return 'border-red-200 bg-red-50 text-red-700';
                  case 'skipped':
                    return 'border-gray-200 bg-gray-50 text-gray-700';
                  default:
                    return 'border-gray-200 bg-gray-50 text-gray-700';
                }
              };
              
              return (
                <li key={item.id} className={`rounded border px-3 py-2 text-[11px] ${getItemColors()}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold">{item.entry.code ?? item.id}</span>
                      <span className="ml-2 uppercase opacity-75">{item.entry.pos}</span>
                    </div>
                    <span className="opacity-75">{item.status}</span>
                  </div>
                  {item.last_error && <div className="mt-1 text-[10px] text-red-600">{item.last_error}</div>}
                  {item.response_payload && item.status === 'succeeded' && (
                    <div className="mt-1 text-[10px] opacity-75">
                      Flagged: {item.flagged ? 'Yes' : 'No'}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {hasMore && onLoadMore && (
            <button
              onClick={onLoadMore}
              className="mt-2 w-full rounded border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Load More ({remaining} remaining)
            </button>
          )}
        </>
      )}
    </div>
  );
});

function formatRuntime(start: string | null, end?: string) {
  if (!start) return '—';
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const diff = endTime - startTime;
  if (diff <= 0) return '—';
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

const ScopeSelector = memo(function ScopeSelector({
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
  onImportFromUrl,
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
  onImportFromUrl: () => void;
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
    <div className="space-y-2 rounded-md border border-gray-200 bg-white p-3 shadow-sm">
      <div className="text-xs font-semibold text-gray-700">Scope</div>
      <div className="space-y-2">
        <label className={`flex items-start gap-2 rounded-md border px-3 py-2 ${mode === 'selection' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
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

        <label className={`flex items-start gap-2 rounded-md border px-3 py-2 ${mode === 'all' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
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

        <label className={`flex items-start gap-2 rounded-md border px-3 py-2 ${mode === 'filters' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
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
                    onClick={onImportFromUrl}
                    className="cursor-pointer rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                    type="button"
                  >
                    Import from table filters
                  </button>
                  <button
                    onClick={onValidateFilters}
                    className="cursor-pointer rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
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

        <label className={`flex items-start gap-2 rounded-md border px-3 py-2 ${mode === 'manual' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
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
            <p className="text-xs text-gray-500">Paste lexical IDs (e.g., say.v.01) separated by commas, spaces, or new lines.</p>
            {mode === 'manual' && (
              <div className="relative mt-2">
                <textarea
                  ref={manualIdInputRef}
                  value={manualIdsText}
                  onChange={handleManualIdChange}
                  onKeyDown={handleManualIdKeyDown}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g., say.v.01, run.v.02"
                />
                {showManualIdMenu && manualIdSuggestions.length > 0 && (
                  <div
                    className="fixed z-10 max-h-48 w-60 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg"
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

        <label className={`flex items-start gap-2 rounded-md border px-3 py-2 ${mode === 'frames' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
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
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g., Communication, 1023"
                />
                {showFrameIdMenu && frameIdSuggestions.length > 0 && (
                  <div
                    className="fixed z-10 max-h-48 w-60 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg"
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
                  <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50 p-2">
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

      </div>
    </div>
  );
});

export default AIJobsOverlay;

