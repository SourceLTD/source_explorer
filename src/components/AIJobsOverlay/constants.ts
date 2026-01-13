import type { ScopeMode } from './types';

export const MODEL_OPTIONS = [
  { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'gpt-5.2', label: 'GPT-5.2' },
  { value: 'gpt-5.2-pro', label: 'GPT-5.2 Pro' },
] as const;

export type JobType = 'moderation' | 'editing' | 'reallocation' | 'allocate';
export type LexicalJobType = 'moderation' | 'editing' | 'allocate';
export type FrameJobType = 'moderation' | 'editing' | 'reallocation';
export type EntityType = 'lexical_units' | 'frames';

// ============================================================================
// PROMPT BUILDING BLOCKS
// ============================================================================

/**
 * Persistence instructions appended to ALL prompts
 */
const PERSISTENCE_BLOCK = `
<persistence>
- You are an agent - please keep going until the user's query is completely resolved, before ending your turn and yielding back to the user.
- Only terminate your turn when you are sure that the problem is solved.
- Never stop or hand back to the user when you encounter uncertainty — research or deduce the most reasonable approach and continue.
- Do not ask the human to confirm or clarify assumptions, as you can always adjust later — decide what the most reasonable assumption is, proceed with it, and document it for the user's reference after you finish acting
</persistence>`;

/**
 * Agentic mode instructions (only added when agentic mode is enabled)
 */
const AGENTIC_INSTRUCTIONS = `
<tools>
You have access to MCP tools for searching the database. Use these tools to:
- Look up frame definitions and find semantically similar frames
- Search for related verbs, nouns, or other lexical entries
- Verify frame assignments by examining other entries in the same frame
- Research alternative frames before making recommendations

Be thorough in your research before finalizing your response.
</tools>`;

/**
 * Scope context descriptions (varies by scope mode)
 */
const SCOPE_CONTEXT: Record<ScopeMode, string> = {
  all: 'You are reviewing entries from the complete database.',
  selection: 'You are reviewing a user-selected subset of entries.',
  manual: 'You are reviewing specific entries chosen by the user.',
  frames: 'You are reviewing entries associated with specific frames.',
  filters: 'You are reviewing entries matching specific filter criteria.',
};

// ============================================================================
// BASE PROMPTS
// ============================================================================

// Prompts for lexical entries (verbs, nouns, adjectives, adverbs)
const LEXICAL_PROMPTS: Record<LexicalJobType, string> = {
  moderation: `You are reviewing lexical entries for quality assurance.

Entry Code: {{code}}
Part of Speech: {{pos}}
Gloss: {{gloss}}
Lemmas: {{lemmas}}
Examples:\n{{examples}}
Frame: {{label}}
Currently Flagged: {{flagged}}
Flagged Reason: {{flagged_reason}}

Decide whether the entry should be flagged for review. Consider:
- Is the gloss accurate and well-formed?
- Do the examples properly illustrate the meaning?
- Is the frame assignment appropriate?

Respond using the provided JSON schema.`,

  editing: `You are improving the quality of lexical entry data.

Entry Code: {{code}}
Part of Speech: {{pos}}
Current Gloss: {{gloss}}
Current Lemmas: {{lemmas}}
Current Examples:\n{{examples}}
Frame: {{label}}

Review this entry and suggest improvements to make the data more accurate and useful:
- Improve the gloss if it's unclear, incomplete, or grammatically awkward
- Enhance examples to better illustrate the word's usage
- Fix any obvious errors or inconsistencies

Respond using the provided JSON schema with your suggested edits.`,

  allocate: `You are evaluating frame assignments for lexical entries.

Entry Code: {{code}}
Part of Speech: {{pos}}
Gloss: {{gloss}}
Lemmas: {{lemmas}}
Examples:\n{{examples}}
Current Frame: {{label}}
Frame Definition: {{frame.definition}}

Evaluate whether this entry is in the best possible frame:
- Does the entry's meaning align with the current frame?
- Would a different frame be more semantically appropriate?
- Consider typical usage patterns and semantic roles

Respond using the provided JSON schema with your frame recommendation.`,
};

// Prompts for frames (different fields: label, definition, short_definition, etc.)
const FRAME_PROMPTS: Record<FrameJobType, string> = {
  moderation: `You are reviewing semantic frames for quality assurance.

Frame Label: {{label}}
Definition: {{definition}}
Short Definition: {{short_definition}}
Prototypical Synset: {{prototypical_synset}}
Currently Flagged: {{flagged}}
Flagged Reason: {{flagged_reason}}
Verifiable: {{verifiable}}
Unverifiable Reason: {{unverifiable_reason}}
Number of Roles: {{roles_count}}
Number of Lexical Units: {{lexical_units_count}}

Decide whether the frame should be flagged for review. Consider:
- Is the definition clear and comprehensive?
- Does the short definition accurately summarize the frame's meaning?
- Is the prototypical synset appropriate?

Respond using the provided JSON schema.`,

  editing: `You are improving the quality of semantic frame data.

Frame Label: {{label}}
Current Definition: {{definition}}
Current Short Definition: {{short_definition}}
Current Prototypical Synset: {{prototypical_synset}}
Number of Roles: {{roles_count}}
Number of Lexical Units: {{lexical_units_count}}

Review this frame and suggest improvements to make the data more accurate and useful:
- Improve the definition if it's unclear, incomplete, or could be more precise
- Enhance the short definition to be more concise yet informative
- Suggest a better prototypical synset if appropriate

Respond using the provided JSON schema with your suggested edits.`,

  reallocation: `You are reviewing the composition of a semantic frame.

Frame Label: {{label}}
Definition: {{definition}}
Short Definition: {{short_definition}}
Number of Roles: {{roles_count}}
Number of Lexical Units: {{lexical_units_count}}

Evaluate whether verbs and other lexical entries in this frame are correctly assigned:
- Does the frame's definition clearly delineate what entries should belong?
- Are there entries that might fit better in a different frame?
- Consider the semantic coherence of the frame's contents

Respond using the provided JSON schema with your recommendations.`,
};

// ============================================================================
// PROMPT BUILDING FUNCTIONS
// ============================================================================

/**
 * Options for building a dynamic prompt
 */
export interface BuildPromptOptions {
  entityType: EntityType;
  jobType: JobType;
  agenticMode: boolean;
  scopeMode: ScopeMode;
}

/**
 * Get the base prompt template for a given entity type and job type
 */
function getBasePrompt(entityType: EntityType, jobType: JobType): string {
  if (entityType === 'frames') {
    // Frames only support moderation, editing, and reallocation
    if (jobType === 'allocate') {
      return FRAME_PROMPTS.moderation; // Fallback - shouldn't happen
    }
    return FRAME_PROMPTS[jobType as FrameJobType];
  }
  // Lexical entries only support moderation, editing, and allocate
  if (jobType === 'reallocation') {
    return LEXICAL_PROMPTS.moderation; // Fallback - shouldn't happen
  }
  return LEXICAL_PROMPTS[jobType as LexicalJobType];
}

/**
 * Build a complete prompt by composing multiple sections based on the options.
 * 
 * Structure:
 * 1. Scope context (what they're reviewing)
 * 2. Base prompt (role + task + entity data + response instructions)
 * 3. Agentic instructions (if enabled)
 * 4. Persistence block (always)
 */
export function buildPrompt(options: BuildPromptOptions): string {
  const { entityType, jobType, agenticMode, scopeMode } = options;
  
  const sections: string[] = [];
  
  // 1. Add scope context
  const scopeContext = SCOPE_CONTEXT[scopeMode];
  if (scopeContext) {
    sections.push(`<context>\n${scopeContext}\n</context>`);
  }
  
  // 2. Add base prompt
  const basePrompt = getBasePrompt(entityType, jobType);
  sections.push(basePrompt);
  
  // 3. Add agentic instructions if enabled
  if (agenticMode) {
    sections.push(AGENTIC_INSTRUCTIONS);
  }
  
  // 4. Always add persistence block
  sections.push(PERSISTENCE_BLOCK);
  
  return sections.join('\n');
}

/**
 * Get the default prompt for a given entity type and job type.
 * This is a simplified version for backwards compatibility that uses default options.
 */
export function getDefaultPrompt(entityType: EntityType, jobType: JobType): string {
  return buildPrompt({
    entityType,
    jobType,
    agenticMode: true, // Default to agentic mode enabled
    scopeMode: 'all',  // Default scope
  });
}

// Legacy exports for backwards compatibility
export const DEFAULT_PROMPTS = LEXICAL_PROMPTS;
export const DEFAULT_PROMPT = LEXICAL_PROMPTS.moderation;

export const DEFAULT_LABEL = 'AI Flagging Review';

export const STEPPER_STEPS = ['scope', 'model', 'prompt', 'review'] as const;

export type StepperStep = typeof STEPPER_STEPS[number];

export const STEP_TITLES: Record<StepperStep, string> = {
  scope: 'Job Scope',
  model: 'Job Model',
  prompt: 'Prompt',
  review: 'Review & Submit',
};

