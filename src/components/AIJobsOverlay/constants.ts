export const MODEL_OPTIONS = [
  { value: 'gpt-5-nano', label: 'GPT-5 Nano (cheapest)' },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini (balanced)' },
  { value: 'gpt-5', label: 'GPT-5 (highest quality)' },
];

export const DEFAULT_PROMPT = `You are reviewing lexical entries for quality assurance.

Entry ID: {{id}}
Part of Speech: {{pos}}
Gloss: {{gloss}}
Lemmas: {{lemmas}}
Examples:\n{{examples}}
Frame: {{label}}
Currently Flagged: {{flagged}}
Flagged Reason: {{flagged_reason}}

Decide whether the entry should be flagged. Respond using the provided JSON schema.`;

export const DEFAULT_LABEL = 'AI Flagging Review';

export const STEPPER_STEPS = ['details', 'scope', 'prompt', 'review'] as const;

export type StepperStep = typeof STEPPER_STEPS[number];

export const STEP_TITLES: Record<StepperStep, string> = {
  details: 'Job Details',
  scope: 'Scope Selection',
  prompt: 'Prompt Template',
  review: 'Review & Submit',
};

