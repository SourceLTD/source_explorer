export const MODEL_OPTIONS = [
  { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'gpt-5.2', label: 'GPT-5.2' },
  { value: 'gpt-5.2-pro', label: 'GPT-5.2 Pro' },
] as const;

export const DEFAULT_PROMPTS: Record<'moderation' | 'editing' | 'reallocation', string> = {
  moderation: `You are reviewing lexical entries for quality assurance.

Entry ID: {{id}}
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

Entry ID: {{id}}
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

  reallocation: `You are reviewing frame assignments for lexical entries.

Entry ID: {{id}}
Part of Speech: {{pos}}
Gloss: {{gloss}}
Lemmas: {{lemmas}}
Examples:\n{{examples}}
Current Frame: {{label}}
Frame Definition: {{frame_definition}}

Evaluate whether this entry is correctly assigned to its current frame:
- Does the entry's meaning align with the frame's semantic structure?
- Would a different frame be more appropriate?
- Consider the entry's typical usage patterns and semantic roles

Respond using the provided JSON schema with your frame assignment recommendation.`,
};

// Legacy export for backwards compatibility
export const DEFAULT_PROMPT = DEFAULT_PROMPTS.moderation;

export const DEFAULT_LABEL = 'AI Flagging Review';

export const STEPPER_STEPS = ['scope', 'model', 'prompt', 'review'] as const;

export type StepperStep = typeof STEPPER_STEPS[number];

export const STEP_TITLES: Record<StepperStep, string> = {
  scope: 'Job Scope',
  model: 'Job Model',
  prompt: 'Prompt Template',
  review: 'Review & Submit',
};

