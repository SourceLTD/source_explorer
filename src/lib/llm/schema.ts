export const FLAGGING_RESPONSE_SCHEMA = {
  name: 'lexical_flagging_response',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['flagged', 'flagged_reason', 'confidence', 'notes'],
    properties: {
      flagged: {
        type: 'boolean',
        description: 'Whether the entry should be marked as flagged.',
      },
      flagged_reason: {
        type: 'string',
        description: 'Short explanation for why the entry should be flagged. Leave empty string if not flagged.',
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence score for the recommendation (0-1).',
      },
      notes: {
        type: 'string',
        description: 'Optional analyst notes or remediation ideas. Use empty string if none.',
      },
    },
  },
} as const;

export type FlaggingResponse = {
  flagged: boolean;
  flagged_reason?: string | null;
  confidence?: number | null;
  notes?: string | null;
};

export const EDIT_RESPONSE_SCHEMA = {
  name: 'lexical_edit_response',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['edits', 'relations', 'confidence', 'notes'],
    properties: {
      edits: {
        type: 'object',
        description: 'Key-value pairs of fields to update.',
        additionalProperties: { 
          anyOf: [
            { type: 'string' },
            { type: 'number' },
            { type: 'boolean' },
            { type: 'array', items: { type: 'string' } }
          ]
        }
      },
      frame_id: {
        type: ['integer', 'null'],
        description: 'Optional numeric ID of the frame to reallocate this entry to.',
      },
      relations: {
        type: 'object',
        description: 'Key-value pairs of relation types to arrays of target lexical codes (e.g., hypernym: ["word.v.01"]).',
        additionalProperties: { 
          type: 'array',
          items: { type: 'string' }
        }
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence score for the recommendation (0-1).',
      },
      notes: {
        type: 'string',
        description: 'Optional analyst notes or remediation ideas.',
      },
    },
  },
} as const;

export type EditResponse = {
  edits: Record<string, string | number | boolean | string[]>;
  frame_id?: number | null;
  relations: Record<string, string[]>;
  confidence: number;
  notes: string;
};

