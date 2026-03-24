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

const searchFramesParams = z.object({
  query: z.string().describe('Natural language search text'),
  limit: z.number().int().min(1).max(50).default(20).describe('Max results to return'),
  similarity_threshold: z.number().min(0).max(1).default(0.3).describe('Minimum similarity score (0-1)'),
  include_roles: z.boolean().default(false).describe('Whether to include frame roles in the response'),
});

const selectFramesParams = z.object({
  ids: z.array(z.number().int()).optional().describe('Filter by specific frame IDs'),
  label: z.string().optional().describe('Substring match on frame label (case-insensitive)'),
  definition: z.string().optional().describe('Substring match on definition (case-insensitive)'),
  flagged: z.boolean().optional().describe('Filter by flagged status'),
  verifiable: z.boolean().optional().describe('Filter by verifiable status'),
  include_roles: z.boolean().default(false).describe('Include frame roles in the response'),
  limit: z.number().int().min(1).max(100).default(100).describe('Max results'),
});

const selectSuperframesParams = z.object({
  ids: z.array(z.number().int()).optional().describe('Filter by specific superframe IDs'),
  label: z.string().optional().describe('Substring match on label (case-insensitive)'),
  definition: z.string().optional().describe('Substring match on definition (case-insensitive)'),
  flagged: z.boolean().optional().describe('Filter by flagged status'),
  verifiable: z.boolean().optional().describe('Filter by verifiable status'),
  include_roles: z.boolean().default(true).describe('Include frame roles in the response'),
  child_frames_limit: z.number().int().min(1).max(80).default(80).describe('Max child frames per superframe'),
  limit: z.number().int().min(1).max(50).default(50).describe('Max results'),
});

const selectLexicalUnitsParams = z.object({
  ids: z.array(z.number().int()).optional().describe('Filter by specific lexical unit IDs'),
  codes: z.array(z.string()).optional().describe('Filter by codes like "run.v.01", "dog.n.01"'),
  pos: z.array(z.enum(['verb', 'noun', 'adjective', 'adverb'])).optional().describe('Filter by part of speech'),
  lemma: z.string().optional().describe('Substring match in lemmas array (case-insensitive)'),
  gloss: z.string().optional().describe('Substring match on gloss (case-insensitive)'),
  frame_id: z.number().int().optional().describe('Filter by assigned frame ID'),
  flagged: z.boolean().optional().describe('Filter by flagged status'),
  include_frame: z.boolean().default(false).describe('Include frame info in the response'),
  limit: z.number().int().min(1).max(100).default(100).describe('Max results'),
});

type SearchFramesInput = z.infer<typeof searchFramesParams>;
type SelectFramesInput = z.infer<typeof selectFramesParams>;
type SelectSuperframesInput = z.infer<typeof selectSuperframesParams>;
type SelectLexicalUnitsInput = z.infer<typeof selectLexicalUnitsParams>;

export const chatTools = {
  search_frames: tool<SearchFramesInput, any>({
    description:
      'Search for semantic frames using natural language. Uses vector embeddings to find frames semantically similar to the query. Returns non-top-level frames (frames that belong to a superframe).',
    inputSchema: searchFramesParams,
    execute: async (params) => callMcpTool('search_frames', params),
  }),

  search_superframes: tool<SearchFramesInput, any>({
    description:
      'Search for superframes (top-level frames) using natural language. Uses vector embeddings to find superframes semantically similar to the query.',
    inputSchema: searchFramesParams,
    execute: async (params) => callMcpTool('search_superframes', params),
  }),

  select_frames: tool<SelectFramesInput, any>({
    description:
      'Look up frames by specific criteria: IDs, label substring, definition substring, or flag states. Use this when you know the exact frame you want or need to filter by properties. Returns non-top-level frames.',
    inputSchema: selectFramesParams,
    execute: async (params) => callMcpTool('select_frames', params),
  }),

  select_superframes: tool<SelectSuperframesInput, any>({
    description:
      'Look up superframes (top-level frames) by specific criteria. Returns superframe details plus their child frames.',
    inputSchema: selectSuperframesParams,
    execute: async (params) => callMcpTool('select_superframes', params),
  }),

  select_lexical_units: tool<SelectLexicalUnitsInput, any>({
    description:
      'Look up lexical units (word senses) by specific criteria: IDs, codes (e.g. "run.v.01"), part of speech, lemma, gloss, frame assignment, or flags. Returns detailed linguistic properties.',
    inputSchema: selectLexicalUnitsParams,
    execute: async (params) => callMcpTool('select_lexical_units', params),
  }),
};
