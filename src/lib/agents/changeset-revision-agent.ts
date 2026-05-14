/**
 * Changeset Revision Agent
 *
 * Uses an LLM with Supabase MCP access to revise proposed changesets based
 * on natural language user feedback.
 */

import { generateText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { getChatModel } from '@/lib/chat/models';
import type { EntityType } from '@/lib/version-control/types';

const MCP_SERVER_URL = process.env.MCP_SERVER_URL;
const MCP_API_KEY = process.env.MCP_API_KEY;
const MCP_TOOL_TIMEOUT_MS = Number(process.env.MCP_TOOL_TIMEOUT_MS) || 120_000;

let _mcpRequestId = 0;

async function callMcpTool(toolName: string, input: Record<string, unknown>) {
  if (!MCP_SERVER_URL) {
    return { error: 'MCP_SERVER_URL is not configured' };
  }

  const endpoint = MCP_SERVER_URL.replace(/\/+$/, '') + '/mcp';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MCP_TOOL_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(MCP_API_KEY ? { 'x-api-key': MCP_API_KEY } : {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: ++_mcpRequestId,
        method: 'tools/call',
        params: { name: toolName, arguments: input },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      return { error: `MCP tool ${toolName} failed (${response.status}): ${text}` };
    }

    const rpcResponse = await response.json();

    if (rpcResponse.error) {
      return { error: `MCP error ${rpcResponse.error.code}: ${rpcResponse.error.message}` };
    }

    const content = rpcResponse.result?.content;
    if (Array.isArray(content) && content.length > 0 && content[0].text) {
      try {
        return JSON.parse(content[0].text);
      } catch {
        return { text: content[0].text };
      }
    }

    return rpcResponse.result ?? rpcResponse;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        error: `MCP tool ${toolName} timed out after ${MCP_TOOL_TIMEOUT_MS / 1000}s`,
      };
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const REVISION_MODEL = 'us.anthropic.claude-sonnet-4-20250514-v1:0';

const SYSTEM_PROMPT = `You are a changeset revision agent for a lexical resource database.

The database contains:
- frames: Semantic frames with labels, definitions, roles, relations
- lexical_units: Word senses with lemmas, glosses, POS, examples
- frame_roles: Roles belonging to frames (PROTO_AGENT, PATIENT, etc.)
- frame_senses: Intermediate entities linking lexical units to frames
- frame_relations: Parent-child hierarchy between frames
- frame_role_mappings: Role inheritance mappings between parent/child frames

A changeset represents a proposed modification to one entity. It contains:
- entity_type: Which table (frame, lexical_unit, frame_role, etc.)
- entity_id: The ID of the entity being changed (null for creates)
- operation: create, update, delete, or merge
- field_changes: Array of {field_name, old_value, new_value} pairs

Your job: Given the current changeset and the user's natural language feedback,
produce a revised set of field changes. You can:
1. Modify existing field values (change new_value)
2. Add new field changes (propose changes to additional fields)
3. Remove field changes (keep the original value for that field)

You have access to database query tools to look up related entities for context.

Rules:
- Only propose valid field names for the entity type
- Preserve old_value from the original changeset (it's the current DB state)
- If the user's request is unclear, make your best interpretation
- For text fields like definitions, make changes that are linguistically appropriate
- For relational fields (frame_id, parent relations), query the DB to validate targets`;

export interface ChangesetContext {
  changeset_id: string;
  entity_type: EntityType;
  entity_id: string | null;
  operation: string;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  field_changes: Array<{
    field_name: string;
    old_value: unknown;
    new_value: unknown;
    status: string;
  }>;
}

export interface RevisionResult {
  field_changes: Array<{
    field_name: string;
    old_value: unknown;
    new_value: unknown;
  }>;
  reasoning: string;
}

export async function reviseChangeset(
  context: ChangesetContext,
  userPrompt: string,
): Promise<RevisionResult> {
  const contextJson = JSON.stringify({
    entity_type: context.entity_type,
    entity_id: context.entity_id,
    operation: context.operation,
    before_snapshot: context.before_snapshot,
    current_field_changes: context.field_changes,
  }, null, 2);

  const userMessage = `## Current Changeset
\`\`\`json
${contextJson}
\`\`\`

## User Feedback
${userPrompt}

## Task
Revise the changeset according to the user's feedback. Return the complete set of field_changes for the new revision.
Keep old_value fields matching the original (they represent the current DB state).
Only change new_value fields based on the user's intent.

You MUST respond with a JSON object in this exact format (no markdown fences):
{
  "field_changes": [{"field_name": "...", "old_value": ..., "new_value": ...}],
  "reasoning": "Brief explanation of what was changed"
}`;

  const executeSqlParams = z.object({
    query: z.string().describe('A SELECT SQL query to execute'),
  });

  const searchFramesParams = z.object({
    query: z.string().describe('Search text'),
    limit: z.number().default(10),
  });

  const selectFramesParams = z.object({
    ids: z.array(z.number()).optional(),
    label: z.string().optional(),
    include_roles: z.boolean().default(false),
    limit: z.number().default(20),
  });

  const selectLexicalUnitsParams = z.object({
    ids: z.array(z.number()).optional(),
    codes: z.array(z.string()).optional(),
    lemma: z.string().optional(),
    frame_id: z.number().optional(),
    limit: z.number().default(20),
  });

  const { text } = await generateText({
    model: getChatModel(REVISION_MODEL),
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    tools: {
      execute_sql: tool<z.infer<typeof executeSqlParams>, any>({
        description: 'Execute a read-only SQL query against the database for validation and context gathering. Only use SELECT statements.',
        inputSchema: executeSqlParams,
        execute: async ({ query }) => {
          if (!query.trim().toLowerCase().startsWith('select')) {
            return { error: 'Only SELECT queries are allowed' };
          }
          return callMcpTool('execute_sql', { query });
        },
      }),
      search_frames: tool<z.infer<typeof searchFramesParams>, any>({
        description: 'Search for frames by label or definition substring to find related frames.',
        inputSchema: searchFramesParams,
        execute: async (params) => callMcpTool('search_frames', params),
      }),
      select_frames: tool<z.infer<typeof selectFramesParams>, any>({
        description: 'Look up frames by ID, label substring, or other criteria.',
        inputSchema: selectFramesParams,
        execute: async (params) => callMcpTool('select_frames', params),
      }),
      select_lexical_units: tool<z.infer<typeof selectLexicalUnitsParams>, any>({
        description: 'Look up lexical units by ID, code, lemma, or other criteria.',
        inputSchema: selectLexicalUnitsParams,
        execute: async (params) => callMcpTool('select_lexical_units', params),
      }),
    },
    stopWhen: stepCountIs(5),
  });

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Agent did not return valid JSON');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  if (!parsed.field_changes || !Array.isArray(parsed.field_changes)) {
    throw new Error('Agent response missing field_changes array');
  }

  return {
    field_changes: parsed.field_changes,
    reasoning: parsed.reasoning || 'Revision applied',
  };
}
