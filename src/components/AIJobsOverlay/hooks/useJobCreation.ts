import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { api } from '@/lib/api-client';
import { createEmptyGroup, type BooleanFilterGroup } from '@/lib/filters/types';
import { showGlobalAlert } from '@/lib/alerts';
import type { SerializedJob, JobScope } from '@/lib/llm/types';
import type { PartOfSpeech as POSType } from '@/lib/types';
import type { DataTableMode } from '../../DataTable/types';
import { getVariablesForEntityType, getIterableVariablesForEntityType } from '@/lib/llm/schema-variables';
import { buildSystemPrompt } from '@/lib/llm/system-prompts';
import type { PreviewResponse, ScopeMode } from '../types';
import { 
  MODEL_OPTIONS, 
  buildPrompt, 
  DEFAULT_LABEL, 
  STEPPER_STEPS,
  type StepperStep 
} from '../constants';
import {
  calculateCursorPosition,
  parseIds,
  idsToText,
  serviceTierToPriority,
  buildScope,
  normalizeLexicalCode,
  estimateScopeSize,
  addLimitToScope,
  addOffsetAndLimitToScope,
} from '../utils';
import { useAutocomplete } from './useAutocomplete';

export interface SubmissionProgress {
  jobId: string;
  submitted: number;
  total: number;
  failed: number;
  isSubmitting: boolean;
  phase?: 'preparing' | 'submitting';
  current?: number;
}

export interface UseJobCreationOptions {
  mode: DataTableMode;
  selectedIds: string[];
  isOpen: boolean;
  /** Email of the current user, used to track who submitted the job */
  userEmail?: string | null;
  onJobCreated: (job: SerializedJob) => void;
}

export interface UseJobCreationReturn {
  // Creation flow state
  isCreating: boolean;
  currentStep: StepperStep;
  stepIndex: number;
  isLastStep: boolean;
  
  // Job settings
  label: string;
  setLabel: (label: string) => void;
  labelManuallyEdited: boolean;
  setLabelManuallyEdited: (edited: boolean) => void;
  model: string;
  setModel: (model: string) => void;
  jobType: 'flag' | 'edit' | 'allocate_contents' | 'allocate' | 'split';
  setJobType: (type: 'flag' | 'edit' | 'allocate_contents' | 'allocate' | 'split') => void;
  targetFields: string[];
  setTargetFields: (fields: string[]) => void;
  reallocationEntityTypes: POSType[];
  setReallocationEntityTypes: (types: POSType[]) => void;
  priority: 'flex' | 'normal' | 'priority';
  setPriority: (priority: 'flex' | 'normal' | 'priority') => void;
  reasoningEffort: 'low' | 'medium' | 'high';
  setReasoningEffort: (effort: 'low' | 'medium' | 'high') => void;
  agenticMode: boolean;
  setAgenticMode: (enabled: boolean) => void;
  // Split job settings
  splitMinFrames: number;
  setSplitMinFrames: (min: number) => void;
  splitMaxFrames: number;
  setSplitMaxFrames: (max: number) => void;
  
  // Scope state
  scopeMode: ScopeMode;
  setScopeMode: (mode: ScopeMode) => void;
  manualIdsText: string;
  frameIdsText: string;
  manualIds: string[];
  frameIds: string[];
  validatedManualIds: Set<string>;
  validatedFrameIds: Set<string>;
  frameIncludeLexicalUnits: boolean;
  setFrameIncludeLexicalUnits: (include: boolean) => void;
  frameFlagTarget: 'frame' | 'lexical_unit' | 'both';
  setFrameFlagTarget: (target: 'frame' | 'lexical_unit' | 'both') => void;
  
  // Filter state
  filterGroup: BooleanFilterGroup;
  setFilterGroup: (group: BooleanFilterGroup) => void;
  filterLimit: number;
  setFilterLimit: (limit: number) => void;
  filterValidateLoading: boolean;
  filterValidateError: string | null;
  filterValidateCount: number | null;
  filterValidateSample: Array<{ code: string; gloss: string }>;
  
  // Manual ID autocomplete
  manualIdInputRef: React.RefObject<HTMLTextAreaElement>;
  showManualIdMenu: boolean;
  manualIdSuggestions: Array<{ code: string; gloss: string }>;
  manualIdMenuPosition: { top: number; left: number };
  manualIdActiveIndex: number;
  handleManualIdChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleManualIdKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  insertManualId: (code: string) => void;
  
  // Frame ID autocomplete
  frameIdInputRef: React.RefObject<HTMLTextAreaElement>;
  showFrameIdMenu: boolean;
  frameIdSuggestions: Array<{ id: string; label: string }>;
  frameIdMenuPosition: { top: number; left: number };
  frameIdActiveIndex: number;
  handleFrameIdChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleFrameIdKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  insertFrameId: (id: string) => void;
  
  // Prompt state
  promptMode: 'simple' | 'advanced';
  setPromptMode: (mode: 'simple' | 'advanced') => void;
  promptTemplate: string;
  setPromptTemplate: (template: string) => void;
  promptManuallyEdited: boolean;
  /** Effective system prompt sent as the OpenAI "system" message (derived from job type + agentic mode) */
  systemPrompt: string;
  promptRef: React.RefObject<HTMLTextAreaElement>;
  // Prompt clustering (render-only, affects preview/estimate/job creation)
  clusterLoopListsEnabled: boolean;
  setClusterLoopListsEnabled: (enabled: boolean) => void;
  /** Optional manual k override (empty string = auto). */
  clusterKOverrideText: string;
  setClusterKOverrideText: (value: string) => void;
  showVariableMenu: boolean;
  variableMenuPosition: { top: number; left: number };
  variableActiveIndex: number;
  filteredVariables: Array<{ key: string; label: string; category?: string }>;
  availableVariables: Array<{ key: string; label: string; category?: string }>;
  editorScroll: { top: number; left: number };
  setEditorScroll: (scroll: { top: number; left: number }) => void;
  handlePromptChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handlePromptKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  insertVariable: (key: string) => void;
  
  // Preview & estimate state
  preview: PreviewResponse | null;
  previewLoading: boolean;
  currentPreviewIndex: number;
  setCurrentPreviewIndex: (index: number) => void;
  estimate: {
    totalItems: number;
    sampleSize: number;
    inputTokensPerItem: number;
    outputTokensPerItem: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedCostUSD: number | null;
  } | null;
  estimateLoading: boolean;
  estimateError: string | null;
  
  // Submission state
  submissionLoading: boolean;
  submissionProgress: SubmissionProgress | null;
  
  // Validation
  isScopeValid: boolean;
  promptIsValid: boolean;
  isSubmitDisabled: boolean;
  nextDisabled: boolean;
  
  // Computed values
  parsedSelectionCount: number;
  scopeSummary: string;
  scopeExampleList: string[];
  modelLabel: string;
  
  // Actions
  startCreateFlow: () => void;
  closeCreateFlow: () => void;
  goToNextStep: () => void;
  goToPreviousStep: () => void;
  handleValidateFilters: () => Promise<void>;
  handleSubmit: () => Promise<void>;
  loadJobSettings: (job: SerializedJob) => void;
  setSubmissionProgress: (progress: SubmissionProgress | null) => void;
}

export function useJobCreation({
  mode,
  selectedIds,
  isOpen,
  userEmail,
  onJobCreated,
}: UseJobCreationOptions): UseJobCreationReturn {
  // Creation flow state
  const [isCreating, setIsCreating] = useState(false);
  const [currentStep, setCurrentStep] = useState<StepperStep>('scope');
  
  // Job settings
  const [label, setLabel] = useState(DEFAULT_LABEL);
  const [labelManuallyEdited, setLabelManuallyEdited] = useState(false);
  const [model, setModel] = useState<string>(MODEL_OPTIONS[0].value);
  const [jobType, setJobType] = useState<'flag' | 'edit' | 'allocate_contents' | 'allocate' | 'split'>('flag');
  const [targetFields, setTargetFields] = useState<string[]>([]);
  const [reallocationEntityTypes, setReallocationEntityTypes] = useState<POSType[]>([]);
  const [priority, setPriority] = useState<'flex' | 'normal' | 'priority'>('normal');
  const [reasoningEffort, setReasoningEffort] = useState<'low' | 'medium' | 'high'>('medium');
  const [agenticMode, setAgenticMode] = useState(true); // MCP tools enabled by default
  // Split job settings
  const [splitMinFrames, setSplitMinFrames] = useState(2);
  const [splitMaxFrames, setSplitMaxFrames] = useState(5);
  
  // Scope state
  const [scopeMode, setScopeMode] = useState<ScopeMode>('all');
  const [frameIncludeLexicalUnits, setFrameIncludeLexicalUnits] = useState(false);
  const [frameFlagTarget, setFrameFlagTarget] = useState<'frame' | 'lexical_unit' | 'both'>('lexical_unit');
  const [validatedManualIds, setValidatedManualIds] = useState<Set<string>>(new Set());
  const [validatedFrameIds, setValidatedFrameIds] = useState<Set<string>>(new Set());
  
  // Filter state
  const [filterGroup, setFilterGroup] = useState<BooleanFilterGroup>(createEmptyGroup());
  const [filterLimit, setFilterLimit] = useState<number>(50);
  const [filterValidateLoading, setFilterValidateLoading] = useState(false);
  const [filterValidateError, setFilterValidateError] = useState<string | null>(null);
  const [filterValidateCount, setFilterValidateCount] = useState<number | null>(null);
  const [filterValidateSample, setFilterValidateSample] = useState<Array<{ code: string; gloss: string }>>([]);
  
  // Prompt state
  const [promptMode, setPromptMode] = useState<'simple' | 'advanced'>('simple');
  const [promptTemplate, setPromptTemplate] = useState(() => buildPrompt({
    entityType: mode,
    jobType: 'flag',
    agenticMode: true, // Default matches initial agenticMode state
    scopeMode: 'all',  // Default matches initial scopeMode state
    isSuperFrame: mode === 'super_frames',
  }));
  const [promptManuallyEdited, setPromptManuallyEdited] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // Prompt clustering (render-only): group loop lists (lexical_units / child_frames) via source-clustering.
  const [clusterLoopListsEnabled, setClusterLoopListsEnabled] = useState(false);
  const [clusterKOverrideText, setClusterKOverrideText] = useState('');
  const clusterKOverride = useMemo(() => {
    const n = Number.parseInt(clusterKOverrideText, 10);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
    return n;
  }, [clusterKOverrideText]);

  // Effective prompt used for previews, estimates, and submission
  // In simple mode, always use the default prompt
  // In advanced mode, use the manually edited template
  const effectivePrompt = useMemo(() => {
    if (promptMode === 'simple') {
      return buildPrompt({
        entityType: mode,
        jobType,
        agenticMode,
        scopeMode,
        isSuperFrame: mode === 'super_frames',
      });
    }
    return promptTemplate;
  }, [promptMode, promptTemplate, mode, jobType, agenticMode, scopeMode]);

  const systemPrompt = useMemo(() => buildSystemPrompt({ jobType, agenticMode }), [jobType, agenticMode]);

  const [showVariableMenu, setShowVariableMenu] = useState(false);
  const [variableQuery, setVariableQuery] = useState('');
  const [variableMenuPosition, setVariableMenuPosition] = useState({ top: 0, left: 0 });
  const [variableActiveIndex, setVariableActiveIndex] = useState(-1);
  const [editorScroll, setEditorScroll] = useState({ top: 0, left: 0 });
  const [variableCursorPos, setVariableCursorPos] = useState(0); // Track cursor position for loop detection
  const pendingCursorRef = useRef<number | null>(null); // Cursor position to set after next render
  
  // Preview & estimate state
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
  
  // Apply 3x multiplier to token estimates when agentic mode is enabled
  const adjustedEstimate = useMemo(() => {
    if (!estimate) return null;
    if (!agenticMode) return estimate;
    
    const multiplier = 3;
    return {
      ...estimate,
      inputTokensPerItem: Math.round(estimate.inputTokensPerItem * multiplier),
      outputTokensPerItem: Math.round(estimate.outputTokensPerItem * multiplier),
      totalInputTokens: Math.round(estimate.totalInputTokens * multiplier),
      totalOutputTokens: Math.round(estimate.totalOutputTokens * multiplier),
      estimatedCostUSD: estimate.estimatedCostUSD !== null 
        ? estimate.estimatedCostUSD * multiplier 
        : null,
    };
  }, [estimate, agenticMode]);
  
  // Submission state
  const [submissionLoading, setSubmissionLoading] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submissionProgress, setSubmissionProgress] = useState<SubmissionProgress | null>(null);
  
  const previewTimerRef = useRef<number | null>(null);
  
  const parsedSelectionCount = selectedIds.length;

  // Manual ID autocomplete using the useAutocomplete hook
  const searchManualIds = useCallback(async (query: string) => {
    const response = await api.get<{ results: Array<{ code: string; gloss: string }> }>(
      `/api/llm-jobs/search-ids?q=${encodeURIComponent(query)}&pos=${mode}&limit=10`
    );
    return response.results;
  }, [mode]);

  const manualIdAutocomplete = useAutocomplete<{ code: string; gloss: string }>({
    onSearch: searchManualIds,
    getInsertValue: (item) => item.code,
    minQueryLength: 2,
  });
  // Extract stable functions to avoid dependency array issues
  const { setText: setManualIdText, setShowMenu: setManualIdShowMenu } = manualIdAutocomplete;

  // Frame ID autocomplete using the useAutocomplete hook
  const searchFrameIds = useCallback(async (query: string) => {
    const response = await api.get<{ results: Array<{ id: string; label: string }> }>(
      `/api/llm-jobs/search-frames?q=${encodeURIComponent(query)}&limit=10`
    );
    return response.results;
  }, []);

  const frameIdAutocomplete = useAutocomplete<{ id: string; label: string }>({
    onSearch: searchFrameIds,
    getInsertValue: (item) => item.label,
    minQueryLength: 2,
  });
  // Extract stable functions to avoid dependency array issues
  const { setText: setFrameIdText, setShowMenu: setFrameIdShowMenu } = frameIdAutocomplete;

  // Derive parsed IDs
  const manualIds = useMemo(() => parseIds(manualIdAutocomplete.text), [manualIdAutocomplete.text]);
  const frameIds = useMemo(() => parseIds(frameIdAutocomplete.text), [frameIdAutocomplete.text]);

  // Available variables based on mode
  const availableVariables = useMemo(() => getVariablesForEntityType(mode), [mode]);
  
  // Get iterable collections for loop detection
  const iterableCollections = useMemo(() => getIterableVariablesForEntityType(mode), [mode]);

  // Apply pending cursor position after React has updated the DOM
  useEffect(() => {
    if (pendingCursorRef.current !== null && promptRef.current) {
      const pos = pendingCursorRef.current;
      pendingCursorRef.current = null;
      
      // Use requestAnimationFrame to ensure DOM is fully updated
      requestAnimationFrame(() => {
        if (promptRef.current) {
          promptRef.current.focus();
          promptRef.current.setSelectionRange(pos, pos);
          setEditorScroll({
            top: promptRef.current.scrollTop,
            left: promptRef.current.scrollLeft,
          });
        }
      });
    }
  }, [promptTemplate]);


  // Detect if cursor is inside a {% for X in Y %} loop and return loop variable info
  const detectLoopContext = useCallback((template: string, cursorPos: number): { loopVar: string; collectionKey: string } | null => {
    // Find all {% for X in Y %} patterns before cursor
    const beforeCursor = template.slice(0, cursorPos);
    const forLoopRegex = /\{%\s*for\s+(\w+)\s+in\s+([a-zA-Z0-9_.]+)\s*%\}/g;
    const endforRegex = /\{%\s*endfor\s*%\}/g;
    
    let match;
    
    // Find all for loops
    const forLoops: Array<{ loopVar: string; collectionKey: string; index: number }> = [];
    while ((match = forLoopRegex.exec(beforeCursor)) !== null) {
      forLoops.push({
        loopVar: match[1],
        collectionKey: match[2],
        index: match.index,
      });
    }
    
    // Find all endfor positions
    const endforPositions: number[] = [];
    while ((match = endforRegex.exec(beforeCursor)) !== null) {
      endforPositions.push(match.index);
    }
    
    // Match for loops with endfor to find unclosed ones
    const events: Array<{ type: 'for' | 'endfor'; index: number; data?: { loopVar: string; collectionKey: string } }> = [];
    
    for (const fl of forLoops) {
      events.push({ type: 'for', index: fl.index, data: fl });
    }
    for (const ep of endforPositions) {
      events.push({ type: 'endfor', index: ep });
    }
    
    // Sort by position
    events.sort((a, b) => a.index - b.index);
    
    // Track open loops stack
    const openLoops: Array<{ loopVar: string; collectionKey: string }> = [];
    for (const event of events) {
      if (event.type === 'for' && event.data) {
        openLoops.push(event.data);
      } else if (event.type === 'endfor' && openLoops.length > 0) {
        openLoops.pop();
      }
    }
    
    // Return the innermost open loop
    if (openLoops.length > 0) {
      return openLoops[openLoops.length - 1];
    }
    
    return null;
  }, []);

  const filteredVariables = useMemo(() => {
    const query = variableQuery.trim().toLowerCase();
    
    // Start with base available variables
    let vars = [...availableVariables];
    
    // Detect if we're inside a loop and add loop variable subfields
    if (showVariableMenu && variableCursorPos > 0) {
      const loopContext = detectLoopContext(promptTemplate, variableCursorPos);
      if (loopContext) {
        // Find the collection definition to get item fields
        const collection = iterableCollections.find(c => c.key === loopContext.collectionKey);
        if (collection && collection.itemFields) {
          // Add loop variable subfields (e.g., verb.code, verb.gloss)
          const loopVarFields = collection.itemFields.map(field => ({
            key: `${loopContext.loopVar}.${field.key}`,
            label: field.label,
            category: 'loop' as const,
          }));
          // Prepend loop variable fields so they appear first when relevant
          vars = [...loopVarFields, ...vars];
        }
      }
    }
    
    if (!query) return vars;
    return vars.filter(variable =>
      variable.key.toLowerCase().includes(query) || variable.label.toLowerCase().includes(query)
    );
  }, [variableQuery, availableVariables, iterableCollections, detectLoopContext, promptTemplate, showVariableMenu, variableCursorPos]);

  // Step navigation
  const stepIndex = STEPPER_STEPS.indexOf(currentStep);
  const isLastStep = stepIndex === STEPPER_STEPS.length - 1;

  const isAllocateAllowed = useCallback((tableMode: DataTableMode) => {
    return tableMode === 'lexical_units' || tableMode === 'frames_only' || tableMode === 'frames';
  }, []);

  const isReallocateAllowed = useCallback((tableMode: DataTableMode) => {
    return tableMode === 'frames' || tableMode === 'frames_only' || tableMode === 'super_frames';
  }, []);

  const isSplitAllowed = useCallback((tableMode: DataTableMode) => {
    return tableMode === 'frames' || tableMode === 'frames_only' || tableMode === 'super_frames';
  }, []);

  // Generate dynamic label based on job type, scope, and timestamp
  const generateDynamicLabel = useCallback(() => {
    const action =
      jobType === 'flag'
        ? 'Flag'
        : jobType === 'edit'
          ? 'Edit'
          : jobType === 'split'
            ? 'Split'
            : jobType === 'allocate'
              ? 'Allocate'
              : 'Allocate Contents';
    
    let scopeDesc: string;
    switch (scopeMode) {
      case 'all':
        scopeDesc = `All ${mode.charAt(0).toUpperCase() + mode.slice(1)}`;
        break;
      case 'selection':
        scopeDesc = `${parsedSelectionCount} Selected`;
        break;
      case 'manual':
        const manualCount = manualIdAutocomplete.text.split(/[\s,;\n]+/).filter(s => s.trim()).length;
        scopeDesc = `${manualCount} ${mode.charAt(0).toUpperCase() + mode.slice(1)}`;
        break;
      case 'frames':
        const frameNames = frameIdAutocomplete.text.split(/[\s,;\n]+/).filter(s => s.trim()).slice(0, 2);
        scopeDesc = frameNames.length > 0 ? frameNames.join(', ') : 'Frames';
        if (frameIdAutocomplete.text.split(/[\s,;\n]+/).filter(s => s.trim()).length > 2) {
          scopeDesc += '...';
        }
        break;
      case 'filters':
        scopeDesc = `Filtered ${mode.charAt(0).toUpperCase() + mode.slice(1)}`;
        break;
      default:
        scopeDesc = mode.charAt(0).toUpperCase() + mode.slice(1);
    }
    
    const now = new Date();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dateTime = `${monthNames[now.getMonth()]} ${now.getDate()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    return `${action} ${scopeDesc} - ${dateTime}`;
  }, [jobType, scopeMode, mode, parsedSelectionCount, manualIdAutocomplete.text, frameIdAutocomplete.text]);

  // Validation
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
        if (mode !== 'lexical_units' && mode !== 'frames') return false;
        return frameIds.length > 0 && frameIds.every(id => validatedFrameIds.has(id));
      default:
        return false;
    }
  }, [scopeMode, parsedSelectionCount, manualIds, frameIds, validatedManualIds, validatedFrameIds, mode]);

  const promptIsValid = useMemo(() => effectivePrompt.trim().length > 0, [effectivePrompt]);

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
        if (mode !== 'lexical_units' && mode !== 'frames') return true;
        return frameIds.length === 0 || !frameIds.every(id => validatedFrameIds.has(id));
      default:
        return true;
    }
  }, [submissionLoading, promptIsValid, model, scopeMode, parsedSelectionCount, manualIds, frameIds, validatedManualIds, validatedFrameIds, mode]);

  const nextDisabled = useMemo(() => {
    if (currentStep === 'scope') {
      if (jobType === 'edit' && targetFields.length === 0) return true;
      // For superframes, allocate_contents targets child frames, so no entity type selection needed
      if (jobType === 'allocate_contents' && mode !== 'super_frames' && reallocationEntityTypes.length === 0) return true;
      return !isScopeValid;
    }
    if (currentStep === 'model') return false;
    if (currentStep === 'prompt') return !promptIsValid;
    return false;
  }, [currentStep, isScopeValid, promptIsValid, jobType, targetFields, reallocationEntityTypes, mode]);

  // Computed summaries
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
    if (scopeMode === 'manual') return manualIds.slice(0, 5);
    if (scopeMode === 'frames') return frameIds.slice(0, 5);
    return [];
  }, [scopeMode, manualIds, frameIds]);

  const modelLabel = useMemo(
    () => MODEL_OPTIONS.find(option => option.value === model)?.label ?? model,
    [model]
  );

  // Reset creation fields
  const resetCreationFields = useCallback(() => {
    setLabel(DEFAULT_LABEL);
    setLabelManuallyEdited(false);
    setModel(MODEL_OPTIONS[0].value);
    setJobType('flag');
    setTargetFields([]);
    setReallocationEntityTypes([]);
    setPriority('normal');
    setReasoningEffort('medium');
    setAgenticMode(true);
    setScopeMode('all');
    setFrameIncludeLexicalUnits(false);
    setFrameFlagTarget('lexical_unit');
    setManualIdText('');
    setFrameIdText('');
    setPromptMode('simple');
    setPromptTemplate(buildPrompt({
      entityType: mode,
      jobType: 'flag',
      agenticMode: true,
      scopeMode: 'all',
      isSuperFrame: mode === 'super_frames',
    }));
    setPromptManuallyEdited(false);
    setPreview(null);
    setSubmissionError(null);
    setSubmissionLoading(false);
    setShowVariableMenu(false);
    setVariableQuery('');
    setManualIdShowMenu(false);
    setFrameIdShowMenu(false);
    setValidatedManualIds(new Set());
    setValidatedFrameIds(new Set());
  }, [setManualIdText, setFrameIdText, setManualIdShowMenu, setFrameIdShowMenu]);

  // Flow control
  const startCreateFlow = useCallback(() => {
    resetCreationFields();
    setIsCreating(true);
    setCurrentStep('scope');
  }, [resetCreationFields]);

  const closeCreateFlow = useCallback(() => {
    setIsCreating(false);
    setCurrentStep('scope');
    resetCreationFields();
  }, [resetCreationFields]);

  const goToNextStep = useCallback(() => {
    if (isLastStep) return;
    setCurrentStep(STEPPER_STEPS[stepIndex + 1]);
  }, [isLastStep, stepIndex]);

  const goToPreviousStep = useCallback(() => {
    if (stepIndex === 0) return;
    setCurrentStep(STEPPER_STEPS[stepIndex - 1]);
  }, [stepIndex]);

  // Load settings from existing job
  const loadJobSettings = useCallback((job: SerializedJob) => {
    const config = job.config as { 
      model?: string; 
      userPromptTemplate?: string; 
      serviceTier?: string | null;
      jobType?: 'flag' | 'edit' | 'allocate_contents' | 'allocate' | 'split';
      targetFields?: string[];
      reallocationEntityTypes?: POSType[];
      reasoning?: { effort?: 'low' | 'medium' | 'high' } | null;
      mcpEnabled?: boolean | null;
      splitMinFrames?: number | null;
      splitMaxFrames?: number | null;
    } | null;
    
    const scope = job.scope as JobScope | null;

    let loadedJobType =
      config?.jobType ?? (job.job_type as 'flag' | 'edit' | 'allocate_contents' | 'allocate' | 'split') ?? 'flag';
    // Normalize job type to what is valid for the current table mode
    if (loadedJobType === 'allocate' && !isAllocateAllowed(mode)) {
      loadedJobType = 'flag';
    }
    if (loadedJobType === 'allocate_contents' && !isReallocateAllowed(mode)) {
      loadedJobType = 'flag';
    }
    if (loadedJobType === 'split' && !isSplitAllowed(mode)) {
      loadedJobType = 'flag';
    }
    setLabel(job.label ?? DEFAULT_LABEL);
    setLabelManuallyEdited(true);
    setModel(config?.model ?? MODEL_OPTIONS[0].value);
    setJobType(loadedJobType);
    setTargetFields(config?.targetFields ?? []);
    setReallocationEntityTypes(config?.reallocationEntityTypes ?? []);
    setPriority(serviceTierToPriority(config?.serviceTier));
    setReasoningEffort(config?.reasoning?.effort ?? 'medium');
    // Agentic mode is enabled if mcpEnabled is not false
    const loadedAgenticMode = config?.mcpEnabled !== false;
    setAgenticMode(loadedAgenticMode);
    // Split job settings
    if (loadedJobType === 'split') {
      setSplitMinFrames(config?.splitMinFrames ?? 2);
      setSplitMaxFrames(config?.splitMaxFrames ?? 5);
    }
    // Use || instead of ?? so empty strings also fall back to default prompt
    const loadedPrompt = config?.userPromptTemplate || buildPrompt({
      entityType: mode,
      jobType: loadedJobType,
      agenticMode: loadedAgenticMode,
      scopeMode: 'all', // Will be determined later, but prompt is already stored in job
      isSuperFrame: mode === 'super_frames',
    });
    setPromptTemplate(loadedPrompt);
    setPromptManuallyEdited(true);
    setPromptMode('advanced'); // When loading a job, use advanced mode since prompt may be customized

    if (scope) {
      if (scope.kind === 'ids') {
        const scopeIds = scope.ids ?? [];
        if (scopeIds.length > 0 && scopeIds.length === selectedIds.length && 
            scopeIds.every(id => selectedIds.includes(id))) {
          setScopeMode('selection');
        } else {
          setScopeMode('manual');
          manualIdAutocomplete.setText(idsToText(scopeIds));
        }
      } else if (scope.kind === 'frame_ids') {
        if (mode === 'lexical_units' || mode === 'frames') {
          setScopeMode('frames');
          frameIdAutocomplete.setText(idsToText(scope.frameIds ?? []));
          setFrameIncludeLexicalUnits(scope.includeLexicalUnits ?? false);
          setFrameFlagTarget(scope.flagTarget ?? 'lexical_unit');
        } else {
          setScopeMode('selection');
        }
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

    setIsCreating(true);
    setCurrentStep('scope');
  }, [selectedIds, mode, manualIdAutocomplete, frameIdAutocomplete, isAllocateAllowed, isReallocateAllowed, isSplitAllowed]);

  // Prompt handlers
  const handlePromptChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { value, selectionStart } = event.target;
    setPromptTemplate(value);
    setPromptManuallyEdited(true);
    // Auto-switch to advanced mode when user edits the prompt
    setPromptMode('advanced');

    const uptoCursor = value.slice(0, selectionStart);
    const openIndex = uptoCursor.lastIndexOf('{{');
    const closeIndex = uptoCursor.lastIndexOf('}}');

    if (openIndex !== -1 && openIndex > closeIndex) {
      setShowVariableMenu(true);
      const query = uptoCursor.slice(openIndex + 2).trim();
      setVariableQuery(query);
      setVariableActiveIndex(0);
      setVariableCursorPos(selectionStart); // Track cursor position for loop context detection
      
      requestAnimationFrame(() => {
        if (promptRef.current) {
          const position = calculateCursorPosition(promptRef.current, selectionStart);
          setVariableMenuPosition(position);
        }
      });
    } else {
      setShowVariableMenu(false);
      setVariableQuery('');
      setVariableActiveIndex(-1);
    }
  }, []);

  const handlePromptKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
  }, [showVariableMenu, filteredVariables, variableActiveIndex]);

  const insertVariable = useCallback((key: string) => {
    const textarea = promptRef.current;
    if (!textarea) return;

    const { selectionStart, value } = textarea;
    // Special-case lemma arrays in loop contexts so insertion renders as a comma-separated list.
    // Top-level `lemmas` is already a string in buildVariableMap, but loop vars like `lu.lemmas` are arrays.
    const toInsert = key.includes('.') && key.endsWith('.lemmas')
      ? `{{${key} | join(', ')}}`
      : `{{${key}}}`;

    // Find the {{ before the cursor
    const textBeforeCursor = value.slice(0, selectionStart);
    const openBraceIndex = textBeforeCursor.lastIndexOf('{{');
    
    if (openBraceIndex === -1) return; // No {{ found, shouldn't happen
    
    // Build new value: everything before {{ + the variable + everything after cursor
    const before = value.slice(0, openBraceIndex);
    const after = value.slice(selectionStart);
    const newValue = before + toInsert + after;
    
    // Store where cursor should go (right after the }})
    pendingCursorRef.current = before.length + toInsert.length;
    
    // Close menu and update template
    setShowVariableMenu(false);
    setVariableActiveIndex(-1);
    setPromptTemplate(newValue);
  }, []);

  // Filter validation
  const handleValidateFilters = useCallback(async () => {
    setFilterValidateLoading(true);
    setFilterValidateError(null);
    setFilterValidateCount(null);
    setFilterValidateSample([]);
    try {
      const scope = buildScope('filters', mode, [], '', '', filterGroup, filterLimit, frameIncludeLexicalUnits, frameFlagTarget);
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
  }, [mode, filterGroup, filterLimit, frameIncludeLexicalUnits, frameFlagTarget]);

  // Preview and estimate
  const handlePreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreview(null);
    setCurrentPreviewIndex(0);
    try {
      const scope = buildScope(scopeMode, mode, selectedIds, manualIdAutocomplete.text, frameIdAutocomplete.text, filterGroup, filterLimit, frameIncludeLexicalUnits, frameFlagTarget);
      const response = await api.post<PreviewResponse>('/api/llm-jobs/preview', {
        model,
        promptTemplate: effectivePrompt,
        systemPrompt,
        scope,
        metadata: {
          promptClustering: {
            enabled: clusterLoopListsEnabled,
            kOverride: clusterKOverride,
          },
        },
        serviceTier: priority === 'normal' ? 'default' : priority,
        reasoning: { effort: reasoningEffort },
      });
      setPreview(response);
      if (response.clusteringError) {
        showGlobalAlert({
          type: 'error',
          title: 'Clustering unavailable',
          message: response.clusteringError,
          durationMs: 12000,
        });
      }
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
  }, [scopeMode, mode, selectedIds, manualIdAutocomplete.text, frameIdAutocomplete.text, filterGroup, filterLimit, frameIncludeLexicalUnits, frameFlagTarget, model, effectivePrompt, systemPrompt, clusterLoopListsEnabled, clusterKOverride, priority, reasoningEffort]);

  const handleEstimate = useCallback(async () => {
    setEstimateLoading(true);
    setEstimateError(null);
    setEstimate(null);
    try {
      const scope = buildScope(scopeMode, mode, selectedIds, manualIdAutocomplete.text, frameIdAutocomplete.text, filterGroup, filterLimit, frameIncludeLexicalUnits, frameFlagTarget);
      const response = await api.post<{
        totalItems: number;
        sampleSize: number;
        inputTokensPerItem: number;
        outputTokensPerItem: number;
        totalInputTokens: number;
        totalOutputTokens: number;
        estimatedCostUSD: number | null;
        clusteringError?: string;
      }>('/api/llm-jobs/estimate', {
        model,
        promptTemplate: effectivePrompt,
        systemPrompt,
        scope,
        metadata: {
          promptClustering: {
            enabled: clusterLoopListsEnabled,
            kOverride: clusterKOverride,
          },
        },
        serviceTier: priority === 'normal' ? 'default' : priority,
        reasoning: { effort: reasoningEffort },
        outputTokensPerItem: 5000,
      });
      setEstimate(response);
      if (response.clusteringError) {
        showGlobalAlert({
          type: 'error',
          title: 'Clustering unavailable',
          message: response.clusteringError,
          durationMs: 12000,
        });
      }
    } catch (error) {
      setEstimateError(error instanceof Error ? error.message : 'Failed to estimate cost');
    } finally {
      setEstimateLoading(false);
    }
  }, [scopeMode, mode, selectedIds, manualIdAutocomplete.text, frameIdAutocomplete.text, filterGroup, filterLimit, frameIncludeLexicalUnits, frameFlagTarget, model, effectivePrompt, systemPrompt, clusterLoopListsEnabled, clusterKOverride, priority, reasoningEffort]);

  // Submission
  const handleSubmit = useCallback(async () => {
    if (isSubmitDisabled) return;
    setSubmissionLoading(true);
    setSubmissionError(null);
    try {
      const scope: JobScope = buildScope(scopeMode, mode, selectedIds, manualIdAutocomplete.text, frameIdAutocomplete.text, filterGroup, filterLimit, frameIncludeLexicalUnits, frameFlagTarget);
      
      const BATCH_SIZE = 3000;
      let totalEntries = estimateScopeSize(scope);
      
      if (totalEntries === null) {
        console.log('[useJobCreation] Fetching scope count from backend...');
        const countResult = await api.post<{ count: number }>('/api/llm-jobs/count-scope', { scope });
        totalEntries = countResult.count;
      }

      console.log(`[useJobCreation] Total entries: ${totalEntries}, Batch size: ${BATCH_SIZE}, Needs batching: ${totalEntries > BATCH_SIZE}`);

      const needsBatching = totalEntries > BATCH_SIZE;
      let job: SerializedJob;

      if (needsBatching) {
        setSubmissionProgress({
          jobId: '',
          submitted: 0,
          total: totalEntries,
          failed: 0,
          isSubmitting: false,
          phase: 'preparing',
          current: 0,
        });

        const firstBatchScope = addLimitToScope(scope, BATCH_SIZE);
        const payload = {
          label,
          submittedBy: userEmail,
          model,
          promptTemplate: effectivePrompt,
          systemPrompt,
          scope: firstBatchScope,
          jobType,
          targetFields,
          reallocationEntityTypes,
          serviceTier: priority === 'normal' ? 'default' : priority,
          reasoning: { effort: reasoningEffort },
          // MCP tools are optional. When enabled, the AI may use tools for additional context (no direct edits).
          mcpEnabled: agenticMode,
          metadata: {
            source: 'table-mode',
            promptClustering: {
              enabled: clusterLoopListsEnabled,
              kOverride: clusterKOverride,
            },
          },
          initialBatchSize: BATCH_SIZE,
          // Split configuration (only relevant for split jobs)
          ...(jobType === 'split' && { splitMinFrames, splitMaxFrames }),
        };

        console.log(`[useJobCreation] Creating job with first batch (${BATCH_SIZE} items)...`);
        job = await api.post<SerializedJob>('/api/llm-jobs', payload);

        try {
          for (let offset = BATCH_SIZE; offset < totalEntries; offset += BATCH_SIZE) {
            const batchScope = addOffsetAndLimitToScope(scope, offset, BATCH_SIZE);
            const remaining = totalEntries - offset;
            const batchCount = Math.min(BATCH_SIZE, remaining);

            console.log(`[useJobCreation] Appending batch at offset ${offset}, count ${batchCount}...`);
            
            setSubmissionProgress({
              jobId: job.id,
              submitted: 0,
              total: totalEntries,
              failed: 0,
              isSubmitting: false,
              phase: 'preparing',
              current: offset,
            });

            await api.post(`/api/llm-jobs/${job.id}/append-items`, { scope: batchScope });
          }

          console.log('[useJobCreation] All batches appended successfully');
        } catch (batchError) {
          console.error('[useJobCreation] Batch append failed:', batchError);
          
          try {
            await api.post(`/api/llm-jobs/${job.id}/cancel`, {});
            console.log('[useJobCreation] Incomplete job cancelled');
          } catch (cancelError) {
            console.error('[useJobCreation] Failed to cancel incomplete job:', cancelError);
          }

          throw new Error(
            `Failed to prepare all batches: ${batchError instanceof Error ? batchError.message : 'Unknown error'}. ` +
            `The job has been cancelled. Please try again or use a smaller batch size.`
          );
        }
      } else {
        const payload = {
          label,
          submittedBy: userEmail,
          model,
          promptTemplate: effectivePrompt,
          systemPrompt,
          scope,
          jobType,
          targetFields,
          reallocationEntityTypes,
          serviceTier: priority === 'normal' ? 'default' : priority,
          reasoning: { effort: reasoningEffort },
          // MCP tools are optional. When enabled, the AI may use tools for additional context (no direct edits).
          mcpEnabled: agenticMode,
          metadata: {
            source: 'table-mode',
            promptClustering: {
              enabled: clusterLoopListsEnabled,
              kOverride: clusterKOverride,
            },
          },
          // Split configuration (only relevant for split jobs)
          ...(jobType === 'split' && { splitMinFrames, splitMaxFrames }),
        };

        job = await api.post<SerializedJob>('/api/llm-jobs', payload);
      }
      
      onJobCreated(job);
      closeCreateFlow();
      
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
        message: `Job ${job.id} created with ${job.total_items} item${job.total_items === 1 ? '' : 's'}.${
          needsBatching ? ` Prepared in ${Math.ceil(totalEntries / BATCH_SIZE)} batches.` : ''
        }`,
        durationMs: 5000,
      });
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit job';
      setSubmissionError(message);
      
      if (message.includes('405') || message.includes('413') || message.includes('too large') || message.includes('payload')) {
        showGlobalAlert({
          type: 'error',
          title: 'Batch too large',
          message: 'Selection exceeds maximum size. Please use Advanced Filters scope mode for very large batches, or reduce your selection size.',
          durationMs: 10000,
        });
      } else {
        showGlobalAlert({
          type: 'error',
          title: 'Submission failed',
          message,
          durationMs: 7000,
        });
      }
    } finally {
      setSubmissionLoading(false);
    }
  }, [isSubmitDisabled, scopeMode, mode, selectedIds, manualIdAutocomplete.text, frameIdAutocomplete.text, filterGroup, filterLimit, frameIncludeLexicalUnits, frameFlagTarget, label, userEmail, model, effectivePrompt, systemPrompt, jobType, targetFields, reallocationEntityTypes, clusterLoopListsEnabled, clusterKOverride, priority, reasoningEffort, agenticMode, onJobCreated, closeCreateFlow]);

  // Effects
  // Auto-update label when job type or scope changes
  useEffect(() => {
    if (!labelManuallyEdited && isCreating) {
      setLabel(generateDynamicLabel());
    }
  }, [labelManuallyEdited, isCreating, generateDynamicLabel]);

  // Auto-update prompt when job type, mode, agentic mode, or scope mode changes
  useEffect(() => {
    if (!promptManuallyEdited && isCreating) {
      setPromptTemplate(buildPrompt({
        entityType: mode,
        jobType,
        agenticMode,
        scopeMode,
        isSuperFrame: mode === 'super_frames',
      }));
    }
  }, [jobType, mode, agenticMode, scopeMode, promptManuallyEdited, isCreating]);

  // Reset job type to flag if it's not valid for the current mode
  // - Allocate is only valid for lexical_units and frames (frames_only/frames)
  // - Allocate Contents is only valid for frames and super frames
  // - Split is only valid for frames and super frames
  useEffect(() => {
    if (jobType === 'allocate' && !isAllocateAllowed(mode)) {
      setJobType('flag');
      setTargetFields([]);
      setReallocationEntityTypes([]);
    }
    if (jobType === 'allocate_contents' && !isReallocateAllowed(mode)) {
      setJobType('flag');
      setReallocationEntityTypes([]);
    }
    if (jobType === 'split' && !isSplitAllowed(mode)) {
      setJobType('flag');
    }
  }, [mode, jobType, isAllocateAllowed, isReallocateAllowed, isSplitAllowed]);

  // Close variable menu when leaving prompt step
  useEffect(() => {
    if (currentStep !== 'prompt') {
      setShowVariableMenu(false);
      setVariableQuery('');
    }
  }, [currentStep]);

  // Update variable menu position on scroll
  useEffect(() => {
    if (!showVariableMenu || !promptRef.current) return;

    const textarea = promptRef.current;
    const updatePosition = () => {
      if (textarea && showVariableMenu) {
        const cursorPos = textarea.selectionStart;
        const position = calculateCursorPosition(textarea, cursorPos);
        setVariableMenuPosition(position);
        if ((document as unknown as { fonts?: { ready: Promise<void> } }).fonts?.ready) {
          (document as unknown as { fonts: { ready: Promise<void> } }).fonts.ready.then(() => {
            if (textarea && showVariableMenu) {
              const pos2 = calculateCursorPosition(textarea, textarea.selectionStart);
              setVariableMenuPosition(pos2);
            }
          });
        }
      }
    };

    textarea.addEventListener('scroll', updatePosition);
    document.addEventListener('selectionchange', updatePosition);

    return () => {
      textarea.removeEventListener('scroll', updatePosition);
      document.removeEventListener('selectionchange', updatePosition);
    };
  }, [showVariableMenu]);

  // Clear preview when closing creation flow
  useEffect(() => {
    if (!isCreating) {
      setSubmissionError(null);
      setPreview(null);
    }
  }, [isCreating]);

  // Close creation flow when overlay closes
  useEffect(() => {
    if (!isOpen) {
      closeCreateFlow();
    }
  }, [isOpen, closeCreateFlow]);

  // Auto-render preview on Review step
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
  }, [isOpen, isCreating, currentStep, isScopeValid, promptIsValid, scopeMode, manualIdAutocomplete.text, frameIdAutocomplete.text, effectivePrompt, model, selectedIds, handlePreview, handleEstimate]);

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
            `/api/llm-jobs/search-ids?q=${encodeURIComponent(normalized)}&pos=${mode}&exact=true&limit=1`
          );
          if (response.results.length > 0) {
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
    if (scopeMode !== 'frames' || frameIds.length === 0 || (mode !== 'lexical_units' && mode !== 'frames')) {
      setValidatedFrameIds(new Set());
      return;
    }
    const validateIds = async () => {
      const validIds = new Set<string>();
      for (const id of frameIds) {
        try {
          const response = await api.get<{ results: Array<{ id: string; label: string }> }>(
            `/api/llm-jobs/search-frames?q=${encodeURIComponent(id)}&limit=1`
          );
          const frameResult = response.results.find(r => 
            r.id === id || r.label.toLowerCase() === id.toLowerCase()
          );
          
          if (frameResult) {
            if (frameIncludeLexicalUnits && mode === 'lexical_units') {
              try {
                const frameDetailsResponse = await api.get(`/api/frames/paginated?search=${encodeURIComponent(frameResult.label)}&limit=1`);
                const frameData = frameDetailsResponse as { data?: Array<{ lexical_units_count?: number }> };
                if (frameData.data && frameData.data.length > 0 && frameData.data[0].lexical_units_count && frameData.data[0].lexical_units_count > 0) {
                  validIds.add(id);
                }
              } catch (error) {
                console.error(`Failed to check lexical unit count for frame ${id}:`, error);
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
  }, [frameIds, scopeMode, frameIncludeLexicalUnits, mode]);

  return {
    // Creation flow state
    isCreating,
    currentStep,
    stepIndex,
    isLastStep,
    
    // Job settings
    label,
    setLabel,
    labelManuallyEdited,
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
    // Split job settings
    splitMinFrames,
    setSplitMinFrames,
    splitMaxFrames,
    setSplitMaxFrames,
    
    // Scope state
    scopeMode,
    setScopeMode,
    manualIdsText: manualIdAutocomplete.text,
    frameIdsText: frameIdAutocomplete.text,
    manualIds,
    frameIds,
    validatedManualIds,
    validatedFrameIds,
    frameIncludeLexicalUnits,
    setFrameIncludeLexicalUnits,
    frameFlagTarget,
    setFrameFlagTarget,
    
    // Filter state
    filterGroup,
    setFilterGroup,
    filterLimit,
    setFilterLimit,
    filterValidateLoading,
    filterValidateError,
    filterValidateCount,
    filterValidateSample,
    
    // Manual ID autocomplete
    manualIdInputRef: manualIdAutocomplete.inputRef,
    showManualIdMenu: manualIdAutocomplete.showMenu,
    manualIdSuggestions: manualIdAutocomplete.suggestions,
    manualIdMenuPosition: manualIdAutocomplete.menuPosition,
    manualIdActiveIndex: manualIdAutocomplete.activeIndex,
    handleManualIdChange: manualIdAutocomplete.handleChange,
    handleManualIdKeyDown: manualIdAutocomplete.handleKeyDown,
    insertManualId: (code: string) => {
      const item = manualIdAutocomplete.suggestions.find(s => s.code === code);
      if (item) manualIdAutocomplete.insert(item);
    },
    
    // Frame ID autocomplete
    frameIdInputRef: frameIdAutocomplete.inputRef,
    showFrameIdMenu: frameIdAutocomplete.showMenu,
    frameIdSuggestions: frameIdAutocomplete.suggestions,
    frameIdMenuPosition: frameIdAutocomplete.menuPosition,
    frameIdActiveIndex: frameIdAutocomplete.activeIndex,
    handleFrameIdChange: frameIdAutocomplete.handleChange,
    handleFrameIdKeyDown: frameIdAutocomplete.handleKeyDown,
    insertFrameId: (id: string) => {
      const item = frameIdAutocomplete.suggestions.find(s => s.label === id);
      if (item) frameIdAutocomplete.insert(item);
    },
    
    // Prompt state
    promptMode,
    setPromptMode,
    promptTemplate,
    setPromptTemplate,
    promptManuallyEdited,
    systemPrompt,
    promptRef,
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
    
    // Preview & estimate state
    preview,
    previewLoading,
    currentPreviewIndex,
    setCurrentPreviewIndex,
    estimate: adjustedEstimate,
    estimateLoading,
    estimateError,
    
    // Submission state
    submissionLoading,
    submissionProgress,
    
    // Validation
    isScopeValid,
    promptIsValid,
    isSubmitDisabled,
    nextDisabled,
    
    // Computed values
    parsedSelectionCount,
    scopeSummary,
    scopeExampleList,
    modelLabel,
    
    // Actions
    startCreateFlow,
    closeCreateFlow,
    goToNextStep,
    goToPreviousStep,
    handleValidateFilters,
    handleSubmit,
    loadJobSettings,
    setSubmissionProgress,
  };
}

