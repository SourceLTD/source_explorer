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
      entry_reallocations: {
        type: 'object',
        description: 'For frame jobs: map of entry codes to target frame IDs (e.g., {"verb.eat.01": 456, "noun.food.01": 789}).',
        additionalProperties: { type: 'integer' }
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
  entry_reallocations?: Record<string, number> | null;
  relations: Record<string, string[]>;
  confidence: number;
  notes: string;
};

export const REALLOCATION_RESPONSE_SCHEMA = {
  name: 'lexical_reallocation_response',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['reallocations', 'confidence', 'notes'],
    properties: {
      reallocations: {
        type: 'object',
        description: 'Map of entry codes to target frame IDs. Only include entries that should be moved to a different frame (e.g., {"verb.eat.01": 456, "noun.food.01": 789}).',
        additionalProperties: { type: 'integer' }
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence score for the reallocation recommendations (0-1).',
      },
      notes: {
        type: 'string',
        description: 'Explanation for the suggested reallocations. Use empty string if none.',
      },
    },
  },
} as const;

export type ReallocationResponse = {
  reallocations: Record<string, number>;
  confidence: number;
  notes: string;
};

export const ALLOCATION_RESPONSE_SCHEMA = {
  name: 'lexical_allocation_response',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['recommended_frame_id', 'keep_current', 'confidence', 'reasoning'],
    properties: {
      recommended_frame_id: {
        type: ['integer', 'null'],
        description: 'The numeric ID of the recommended frame. Use null if entry should remain unassigned.',
      },
      keep_current: {
        type: 'boolean',
        description: 'True if the current frame assignment is optimal and should not change.',
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence score for the recommendation (0-1).',
      },
      reasoning: {
        type: 'string',
        description: 'Explanation for why this frame is the best fit for this entry.',
      },
    },
  },
} as const;

export type AllocationResponse = {
  recommended_frame_id: number | null;
  keep_current: boolean;
  confidence: number;
  reasoning: string;
};

export const CHANGE_REVIEW_RESPONSE_SCHEMA = {
  name: 'change_review_response',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['action', 'justification', 'confidence'],
    properties: {
      action: {
        type: 'string',
        enum: ['approve', 'reject', 'modify', 'keep_as_is'],
        description: 'The recommended action for this pending change.',
      },
      modifications: {
        type: 'object',
        description: 'If action is "modify", the suggested new values for each field. Keys are field names, values are the suggested new values.',
        additionalProperties: {
          anyOf: [
            { type: 'string' },
            { type: 'number' },
            { type: 'boolean' },
            { type: 'array', items: { type: 'string' } },
            { type: 'null' }
          ]
        }
      },
      justification: {
        type: 'string',
        description: 'Detailed explanation for the recommendation, addressing the user question and providing reasoning.',
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence score for the recommendation (0-1).',
      },
    },
  },
} as const;

export type ChangeReviewResponse = {
  action: 'approve' | 'reject' | 'modify' | 'keep_as_is';
  modifications?: Record<string, string | number | boolean | string[] | null>;
  justification: string;
  confidence: number;
};

/**
 * Split response schema for frame/superframe split jobs.
 * 
 * Note: Split jobs are agentic - the AI uses MCP tools (create_frame, edit_frames, 
 * edit_lexical_units) to perform the actual split. This schema captures the summary
 * of what was done for logging and review purposes.
 */
export const SPLIT_RESPONSE_SCHEMA = {
  name: 'frame_split_response',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['split_completed', 'new_frames', 'original_frame_deleted', 'confidence', 'reasoning'],
    properties: {
      split_completed: {
        type: 'boolean',
        description: 'Whether the split operation was successfully completed using MCP tools.',
      },
      new_frames: {
        type: 'array',
        description: 'Array of new frames created during the split.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'changeset_id'],
          properties: {
            label: {
              type: 'string',
              description: 'Label of the new frame.',
            },
            changeset_id: {
              type: 'string',
              description: 'Changeset ID for the frame creation (pending approval).',
            },
            definition: {
              type: 'string',
              description: 'Definition of the new frame.',
            },
            assigned_items_count: {
              type: 'integer',
              description: 'Number of lexical units or child frames assigned to this new frame.',
            },
          },
        },
      },
      original_frame_deleted: {
        type: 'boolean',
        description: 'Whether a delete changeset was created for the original frame.',
      },
      delete_changeset_id: {
        type: ['string', 'null'],
        description: 'Changeset ID for the original frame deletion (pending approval).',
      },
      reallocation_changeset_ids: {
        type: 'array',
        description: 'Changeset IDs for lexical unit or child frame reallocations.',
        items: { type: 'string' },
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'Confidence score for the split decision (0-1).',
      },
      reasoning: {
        type: 'string',
        description: 'Explanation for why the frame was split this way and how items were distributed.',
      },
    },
  },
} as const;

export type SplitResponseNewFrame = {
  label: string;
  changeset_id: string;
  definition?: string;
  assigned_items_count?: number;
};

export type SplitResponse = {
  split_completed: boolean;
  new_frames: SplitResponseNewFrame[];
  original_frame_deleted: boolean;
  delete_changeset_id?: string | null;
  reallocation_changeset_ids?: string[];
  confidence: number;
  reasoning: string;
};
