import OpenAI from 'openai';

declare global {
  var _openAIClient: OpenAI | undefined;
}

function createClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn('[LLM] OPENAI_API_KEY is not set. LLM job features are disabled.');
    return null;
  }

  return new OpenAI({ apiKey });
}

export function getOpenAIClient(): OpenAI | null {
  if (globalThis._openAIClient === undefined) {
    globalThis._openAIClient = createClient() ?? undefined;
  }

  return globalThis._openAIClient ?? null;
}

