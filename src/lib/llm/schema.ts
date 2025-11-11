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

