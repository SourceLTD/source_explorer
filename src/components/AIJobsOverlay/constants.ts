import type { ScopeMode } from './types';

export const MODEL_OPTIONS = [
  { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'gpt-5', label: 'GPT-5' },
  { value: 'gpt-5.2', label: 'GPT-5.2' },
  { value: 'gpt-5.2-pro', label: 'GPT-5.2 Pro' },
] as const;

export type JobType = 'flag' | 'edit' | 'allocate_contents' | 'allocate' | 'split';
export type LexicalJobType = 'flag' | 'edit' | 'allocate';
export type ConceptJobType = 'flag' | 'edit' | 'allocate' | 'allocate_contents' | 'split';
export type EntityType = 'lexical_units' | 'concepts';

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
- Look up concept definitions and find semantically similar concepts
- Search for related verbs, nouns, or other lexical units
- Verify concept assignments by examining other entries in the same concept
- Research alternative concepts before making recommendations

Be thorough in your research before finalizing your response.
</tools>`;

/**
 * Scope context descriptions (varies by scope mode)
 */
const SCOPE_CONTEXT: Record<ScopeMode, string> = {
  all: 'You are reviewing entries from the complete database.',
  selection: 'You are reviewing a user-selected subset of entries.',
  manual: 'You are reviewing specific entries chosen by the user.',
  concepts: 'You are reviewing entries associated with specific concepts.',
  filters: 'You are reviewing entries matching specific filter criteria.',
};

// ============================================================================
// BASE PROMPTS
// ============================================================================

// Prompts for lexical units (verbs, nouns, adjectives, adverbs)
const LEXICAL_PROMPTS: Record<LexicalJobType, string> = {
  flag: `You are reviewing lexical units for quality assurance.

Entry Code: {{code}}
Part of Speech: {{pos}}
Gloss: {{gloss}}
Lemmas: {{lemmas}}
Examples:\n{{examples}}
Concept: {{label}}
Currently Flagged: {{flagged}}
Flagged Reason: {{flagged_reason}}

Decide whether the entry should be flagged for review. Consider:
- Is the gloss accurate and well-formed?
- Do the examples properly illustrate the meaning?
- Is the concept assignment appropriate?

Respond using the provided JSON schema.`,

  edit: `You are improving the quality of lexical unit data.

Entry Code: {{code}}
Part of Speech: {{pos}}
Current Gloss: {{gloss}}
Current Lemmas: {{lemmas}}
Current Examples:\n{{examples}}
Concept: {{label}}

Review this entry and suggest improvements to make the data more accurate and useful:
- Improve the gloss if it's unclear, incomplete, or grammatically awkward
- Enhance examples to better illustrate the word's usage
- Fix any obvious errors or inconsistencies

Respond using the provided JSON schema with your suggested edits.`,

  allocate: `You are evaluating concept assignments for lexical units.

Entry Code: {{code}}
Part of Speech: {{pos}}
Gloss: {{gloss}}
Lemmas: {{lemmas}}
Examples:\n{{examples}}
Current Concept: {{label}}
Concept Definition: {{concept.definition}}

Evaluate whether this entry is in the best possible concept:
- Does the entry's meaning align with the current concept?
- Would a different concept be more semantically appropriate?
- Consider typical usage patterns and semantic roles

Respond using the provided JSON schema with your concept recommendation.`,
};

// Prompts for concepts (different fields: label, definition, short_definition, etc.)
const CONCEPT_PROMPTS: Record<ConceptJobType, string> = {
  flag: `You are reviewing semantic concepts for quality assurance.

Concept Label: {{label}}
Definition: {{definition}}
Short Definition: {{short_definition}}
Currently Flagged: {{flagged}}
Flagged Reason: {{flagged_reason}}
Verifiable: {{verifiable}}
Unverifiable Reason: {{unverifiable_reason}}
Number of Properties: {{roles_count}}
Number of Lexical Units: {{lexical_units_count}}

Decide whether the concept should be flagged for review. Consider:
- Is the definition clear and comprehensive?
- Does the short definition accurately summarize the concept's meaning?

Respond using the provided JSON schema.`,

  edit: `You are improving the quality of semantic concept data.

Concept Label: {{label}}
Current Definition: {{definition}}
Current Short Definition: {{short_definition}}
Number of Properties: {{roles_count}}
Number of Lexical Units: {{lexical_units_count}}

Review this concept and suggest improvements to make the data more accurate and useful:
- Improve the definition if it's unclear, incomplete, or could be more precise
- Enhance the short definition to be more concise yet informative

Respond using the provided JSON schema with your suggested edits.`,

  allocate_contents: `You are reviewing the composition of a semantic concept.

Concept Label: {{label}}
Definition: {{definition}}
Short Definition: {{short_definition}}
Number of Properties: {{roles_count}}
Number of Lexical Units: {{lexical_units_count}}

Evaluate whether verbs and other lexical units in this concept are correctly assigned:
- Does the concept's definition clearly delineate what entries should belong?
- Are there entries that might fit better in a different concept?
- Consider the semantic coherence of the concept's contents

Respond using the provided JSON schema with your recommendations.`,

  allocate: `You are evaluating the hierarchical placement of a semantic concept.

Concept ID: {{id}}
Concept Label: {{label}}
Definition: {{definition}}
Short Definition: {{short_definition}}
Number of Properties: {{roles_count}}
Number of Lexical Units: {{lexical_units_count}}

Evaluate whether this concept is correctly placed in the parent_of hierarchy:
- Does the concept's meaning suggest it should inherit from a different parent concept?
- Consider the semantic relationships between this concept and potential parent concepts
- Use recommended_parent_frame_id to suggest a new parent in the parent_of DAG
- Use recommended_super_frame_id to suggest a new superconcept grouping

Respond using the provided JSON schema with your recommendation.`,

  split: `You are splitting a semantic concept into multiple more specific concepts.

Concept ID: {{id}}
Concept Label: {{label}}
Definition: {{definition}}
Short Definition: {{short_definition}}
Number of Lexical Units: {{lexical_units_count}}

Current Lexical Units:
{% for lu in lexical_units %}
- {{lu.code}} ({{lu.pos}}): {{lu.gloss}}
{% endfor %}

Your task is to split this concept into {{min_splits}} to {{max_splits}} new concepts. For each new concept:
1. Create a unique, descriptive label
2. Write a clear definition that distinguishes it from sibling concepts
3. Write a concise short_definition
4. Assign each lexical unit to exactly one of the new concepts

IMPORTANT:
- Set properties = [] for every proposed new concept in the structured response.

Guidelines:
- Each new concept should be semantically coherent and distinct
- All lexical units from the original concept must be assigned to a new concept
- The split should result in more precise, useful concept definitions
- Consider the semantic relationships between lexical units when grouping

Respond using the provided JSON schema with:
- Whether the concept should be split
- Proposed new concepts (labels/definitions/short_definition)
- Assignment of every lexical unit to exactly one proposed new concept
- Whether the original should be deleted
- Confidence + justification`,
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
  if (entityType === 'concepts') {
    return CONCEPT_PROMPTS[jobType as ConceptJobType];
  }
  // Lexical entries only support flag, edit, and allocate
  if (jobType === 'allocate_contents' || jobType === 'split') {
    return LEXICAL_PROMPTS.flag; // Fallback - shouldn't happen
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
    agenticMode: true,
    scopeMode: 'all',
  });
}

// Legacy exports for backwards compatibility
export const DEFAULT_PROMPTS = LEXICAL_PROMPTS;
export const DEFAULT_PROMPT = LEXICAL_PROMPTS.flag;

export const DEFAULT_LABEL = 'AI Flagging Review';

export const STEPPER_STEPS = ['scope', 'model', 'prompt', 'review'] as const;

export type StepperStep = typeof STEPPER_STEPS[number];

export const STEP_TITLES: Record<StepperStep, string> = {
  scope: 'Job Scope',
  model: 'Job Model',
  prompt: 'Prompt',
  review: 'Review & Submit',
};

