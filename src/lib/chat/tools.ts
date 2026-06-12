import { tool } from 'ai';
import { z } from 'zod';

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
        error: `MCP tool ${toolName} timed out after ${MCP_TOOL_TIMEOUT_MS / 1000}s. Consider increasing MCP_TOOL_TIMEOUT_MS.`,
      };
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const searchConceptsParams = z.object({
  query: z.string().describe('Natural language search text'),
  limit: z.number().int().min(1).max(50).default(20).describe('Max results to return'),
  similarity_threshold: z.number().min(0).max(1).default(0.3).describe('Minimum similarity score (0-1)'),
  include_roles: z.boolean().default(false).describe('Whether to include concept properties in the response'),
});

const selectConceptsParams = z.object({
  ids: z.array(z.number().int()).optional().describe('Filter by specific concept IDs'),
  label: z.string().optional().describe('Substring match on concept label (case-insensitive)'),
  definition: z.string().optional().describe('Substring match on definition (case-insensitive)'),
  flagged: z.boolean().optional().describe('Filter by flagged status'),
  verifiable: z.boolean().optional().describe('Filter by verifiable status'),
  include_roles: z.boolean().default(false).describe('Include concept properties in the response'),
  limit: z.number().int().min(1).max(100).default(100).describe('Max results'),
});

const selectLexicalUnitsParams = z.object({
  ids: z.array(z.number().int()).optional().describe('Filter by specific lexical unit IDs'),
  codes: z.array(z.string()).optional().describe('Filter by codes like "run.v.01", "dog.n.01"'),
  pos: z.array(z.enum(['verb', 'noun', 'adjective', 'adverb'])).optional().describe('Filter by part of speech'),
  lemma: z.string().optional().describe('Substring match in lemmas array (case-insensitive)'),
  gloss: z.string().optional().describe('Substring match on gloss (case-insensitive)'),
  concept_id: z.number().int().optional().describe('Filter by assigned concept ID'),
  flagged: z.boolean().optional().describe('Filter by flagged status'),
  include_frame: z.boolean().default(false).describe('Include concept info in the response'),
  limit: z.number().int().min(1).max(100).default(100).describe('Max results'),
});

const reparentConceptParams = z.object({
  concept_id: z.number().int().describe('ID of the concept to reparent'),
  new_parent_frame_id: z.number().int().describe('ID of the new parent concept in the parent_of hierarchy'),
  author: z.string().default('chat').describe('Author of the change'),
});

const askQuestionsParams = z.object({
  title: z.string().optional().describe('Optional title for the questions section, e.g. "Questions"'),
  questions: z.array(z.object({
    id: z.string().describe('Unique identifier for this question, e.g. "q1"'),
    prompt: z.string().describe('The question text to present to the user'),
    options: z.array(z.object({
      id: z.string().describe('Short option identifier, e.g. "A", "B", "C"'),
      label: z.string().describe('Display text for this option'),
    })).min(2).describe('Available choices (minimum 2)'),
    allow_multiple: z.boolean().default(false).describe('Whether multiple options can be selected simultaneously'),
  })).min(1).describe('One or more questions to present to the user'),
});

export type AskQuestionsInput = z.infer<typeof askQuestionsParams>;

type SearchConceptsInput = z.infer<typeof searchConceptsParams>;
type SelectConceptsInput = z.infer<typeof selectConceptsParams>;
type SelectLexicalUnitsInput = z.infer<typeof selectLexicalUnitsParams>;
type ReparentConceptInput = z.infer<typeof reparentConceptParams>;

export const chatTools = {
  search_frames: tool<SearchConceptsInput, any>({
    description:
      'Search for semantic concepts using natural language. Uses vector embeddings to find concepts semantically similar to the query.',
    inputSchema: searchConceptsParams,
    execute: async (params) => callMcpTool('search_frames', params),
  }),

  select_frames: tool<SelectConceptsInput, any>({
    description:
      'Look up concepts by specific criteria: IDs, label substring, definition substring, or flag states. Use this when you know the exact concept you want or need to filter by properties.',
    inputSchema: selectConceptsParams,
    execute: async (params) => callMcpTool('select_frames', params),
  }),

  select_lexical_units: tool<SelectLexicalUnitsInput, any>({
    description:
      'Look up lexical units (word senses) by specific criteria: IDs, codes (e.g. "run.v.01"), part of speech, lemma, gloss, concept assignment, or flags. Returns detailed linguistic properties.',
    inputSchema: selectLexicalUnitsParams,
    execute: async (params) => callMcpTool('select_lexical_units', params),
  }),

  reparent_frame: tool<ReparentConceptInput, any>({
    description:
      'Move a concept to a new parent in the parent_of DAG hierarchy. Stages a pending changeset that removes the old parent_of relation and creates a new one. Validates that both concepts exist and that the reparent does not create a cycle. The change requires human approval before taking effect.',
    inputSchema: reparentConceptParams,
    execute: async (params) => callMcpTool('reparent_frame', params),
  }),

  ask_questions: tool({
    description:
      'Present one or more structured multiple-choice questions to the user and wait for their answers. Use this when you need clarification, the user\'s request is ambiguous, there are multiple valid approaches, or a decision point requires human input. Each question must have 2-6 options. Always include a final option like "Let me explain" or "Other" so the user can provide a custom answer. The tool pauses execution until the user responds. IMPORTANT: You must call this tool at most ONCE per response. Put ALL questions into the single call\'s questions array — never split questions across multiple ask_questions calls.',
    inputSchema: askQuestionsParams,
  }),
};
