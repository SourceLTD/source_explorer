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
- frame_relations: Parent-child hierarchy between frames (source_id = PARENT frame, target_id = CHILD frame, type = 'parent_of')
- frame_role_mappings: Role inheritance mappings between parent/child frames

CRITICAL: In frame_relations, source_id is the PARENT and target_id is the CHILD.
A row {source_id: A, target_id: B, type: 'parent_of'} means "A is parent of B".
To change which frame is the NEW PARENT, you change source_id.

A changeset represents a proposed modification to one entity. It contains:
- entity_type: Which table (frame, lexical_unit, frame_role, frame_relation, etc.)
- entity_id: The ID of the entity being changed (null for creates)
- operation: create, update, delete, move, or merge
- before_snapshot: The full entity row as it currently exists (null for creates)
- after_snapshot: The intended final state of the entity (null for deletes)
- field_changes: Array of {field_name, old_value, new_value} pairs

Your job: Given the current changeset and the user's natural language feedback,
produce a revised set of field changes. You can:
1. Modify existing field values (change new_value)
2. Add new field changes (propose changes to additional fields)
3. Remove field changes (keep the original value for that field)
4. For structural operations (create/delete), propose field changes that redefine
   the target — e.g. changing which parent frame a reparent targets by modifying
   the source_id field (since source_id = parent), or changing any field on the
   entity being created.

IMPORTANT for reparent (move_frame_parent) operations:
- A reparent plan has a CREATE changeset for the new frame_relation.
- The CREATE changeset's after_snapshot has: source_id (the NEW parent),
  target_id (the child being moved), type ('parent_of').
- If the user says "move X under Y" or "make X a child of Y", they want
  source_id changed to Y's frame ID (because source_id = parent).
- Derive field_changes from after_snapshot for the CREATE changeset:
  each field becomes {field_name, old_value: null, new_value: <value>}
- Then modify source_id's new_value to the user's requested parent frame.

IMPORTANT for structural operations (create/delete/move):
- If the changeset has NO field_changes but has before_snapshot/after_snapshot,
  derive field changes from the snapshot. For creates, every non-null field in
  after_snapshot is a proposed new value. For deletes, the before_snapshot
  shows what is being removed.
- ALWAYS return at least one field_change representing the core of what the
  changeset does, even for create/delete ops.

You have access to database query tools to look up related entities for context.

Rules:
- Only propose valid field names for the entity type
- Preserve old_value from the original changeset (it's the current DB state)
- If the user's request is unclear, make your best interpretation
- For text fields like definitions, make changes that are linguistically appropriate
- For relational fields (frame_id, parent relations), use query_database to validate targets
- NEVER use placeholder values like "SOME_FRAME_ID" — always look up the actual ID using query_database
- Use query_database for ALL lookups. Example queries:
  SELECT id, label FROM frames WHERE label ILIKE '%search_term%' LIMIT 10
  SELECT id, source_id, target_id, type FROM frame_relations WHERE target_id = 123
  SELECT id, frame_id, label FROM frame_roles WHERE frame_id = 123
- You MUST always return field_changes — never return an empty array
- You MUST always use real, verified database IDs — never guess or use placeholders`;

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
    after_snapshot: context.after_snapshot,
    current_field_changes: context.field_changes,
  }, null, 2);

  console.log('[RevisionAgent] Starting revision for changeset', context.changeset_id);
  console.log('[RevisionAgent] Entity:', context.entity_type, '#' + context.entity_id, '| Operation:', context.operation);
  console.log('[RevisionAgent] Field changes count:', context.field_changes.length);
  console.log('[RevisionAgent] Before snapshot keys:', context.before_snapshot ? Object.keys(context.before_snapshot) : 'null');
  console.log('[RevisionAgent] After snapshot keys:', context.after_snapshot ? Object.keys(context.after_snapshot) : 'null');
  console.log('[RevisionAgent] User prompt:', userPrompt);

  const userMessage = `## Current Changeset
\`\`\`json
${contextJson}
\`\`\`

## User Feedback
${userPrompt}

## Task
Revise the changeset according to the user's feedback. Return the complete set of field_changes for the new revision.

For UPDATE operations:
- Keep old_value fields matching the original (they represent the current DB state).
- Only change new_value fields based on the user's intent.

For CREATE operations (no field_changes but has after_snapshot):
- Derive field_changes from the after_snapshot — each field becomes {field_name, old_value: null, new_value: <snapshot value>}
- Modify the new_value fields per the user's feedback.

For DELETE operations (no field_changes but has before_snapshot):
- If the user wants to change what is being deleted, propose field_changes
  that describe what the revised deletion should target.

For MOVE / structural operations:
- The key structural fields (e.g. source_id, target_id for frame_relations)
  define what the operation does. Revise those per the user's feedback.

You MUST respond with a JSON object in this exact format (no markdown fences):
{
  "field_changes": [{"field_name": "...", "old_value": ..., "new_value": ...}],
  "reasoning": "Brief explanation of what was changed"
}

IMPORTANT: You must ALWAYS return at least one field_change. Never return an empty array.`;

  const executeSqlParams = z.object({
    query: z.string().describe('A read-only SELECT SQL query to execute against the Supabase PostgreSQL database'),
  });

  const { text } = await generateText({
    model: getChatModel(REVISION_MODEL),
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    tools: {
      query_database: tool<z.infer<typeof executeSqlParams>, any>({
        description: 'Execute a read-only SQL query against the PostgreSQL database. Use this to look up frames, relations, lexical units, roles, etc. Key tables: frames (id, label, definition), frame_relations (id, source_id, target_id, type), frame_roles (id, frame_id, label, description), frame_senses (id, frame_id, pos, definition), lexical_units (id, lemma, pos). Only SELECT statements are allowed.',
        inputSchema: executeSqlParams,
        execute: async ({ query }) => {
          console.log('[RevisionAgent] Tool call: query_database |', query.slice(0, 200));
          if (!query.trim().toLowerCase().startsWith('select')) {
            return { error: 'Only SELECT queries are allowed' };
          }
          const result = await callMcpTool('query_database', { query });
          console.log('[RevisionAgent] query_database result:', JSON.stringify(result).slice(0, 300));
          return result;
        },
      }),
    },
    stopWhen: stepCountIs(10),
  });

  console.log('[RevisionAgent] LLM response received, text length:', text.length);
  console.log('[RevisionAgent] Raw LLM text (first 1000 chars):', text.slice(0, 1000));

  let jsonMatch = text.match(/\{[\s\S]*"field_changes"[\s\S]*\}/);
  
  if (!jsonMatch) {
    console.warn('[RevisionAgent] No JSON in initial response. Sending follow-up to force JSON output.');
    const { text: retryText } = await generateText({
      model: getChatModel(REVISION_MODEL),
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userMessage },
        { role: 'assistant', content: text },
        { role: 'user', content: 'You must now respond with the JSON result. Do not call any more tools. Return ONLY the JSON object with "field_changes" and "reasoning" based on the research you have already done.' },
      ],
      stopWhen: stepCountIs(1),
    });
    console.log('[RevisionAgent] Retry response (first 1000 chars):', retryText.slice(0, 1000));
    jsonMatch = retryText.match(/\{[\s\S]*"field_changes"[\s\S]*\}/);
  }

  if (!jsonMatch) {
    console.error('[RevisionAgent] No JSON found after retry. Full text:', text);
    throw new Error('Agent did not return valid JSON');
  }

  console.log('[RevisionAgent] Extracted JSON (first 500 chars):', jsonMatch[0].slice(0, 500));

  const parsed = JSON.parse(jsonMatch[0]);

  if (!parsed.field_changes || !Array.isArray(parsed.field_changes)) {
    console.error('[RevisionAgent] Response missing field_changes. Parsed:', JSON.stringify(parsed).slice(0, 500));
    throw new Error('Agent response missing field_changes array');
  }

  console.log('[RevisionAgent] Revision complete. field_changes count:', parsed.field_changes.length);
  console.log('[RevisionAgent] Reasoning:', parsed.reasoning);
  if (parsed.field_changes.length > 0) {
    console.log('[RevisionAgent] Field changes:', JSON.stringify(parsed.field_changes).slice(0, 500));
  }

  return {
    field_changes: parsed.field_changes,
    reasoning: parsed.reasoning || 'Revision applied',
  };
}
