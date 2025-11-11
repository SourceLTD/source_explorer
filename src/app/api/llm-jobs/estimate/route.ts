import { NextRequest, NextResponse } from 'next/server';
import type { CreateLLMJobParams } from '@/lib/llm/types';
import { fetchEntriesForScope, renderPrompt } from '@/lib/llm/jobs';
import { getOpenAIClient } from '@/lib/llm/client';
import { estimateUsdCost } from '@/lib/llm/pricing';

interface EstimateResponseBody {
  totalItems: number;
  sampleSize: number;
  inputTokensPerItem: number;
  outputTokensPerItem: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUSD: number | null;
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Partial<CreateLLMJobParams> & {
      outputTokensPerItem?: number;
    };

    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
    if (!payload.model || typeof payload.model !== 'string') {
      return NextResponse.json({ error: 'model is required.' }, { status: 400 });
    }
    if (!payload.promptTemplate || typeof payload.promptTemplate !== 'string') {
      return NextResponse.json({ error: 'promptTemplate is required.' }, { status: 400 });
    }
    if (!payload.scope || typeof payload.scope !== 'object') {
      return NextResponse.json({ error: 'scope is required.' }, { status: 400 });
    }

    const entries = await fetchEntriesForScope(payload.scope);
    if (entries.length === 0) {
      return NextResponse.json({ error: 'No entries found for provided scope.' }, { status: 400 });
    }

    const sampleSize = Math.min(entries.length, 5);
    const sample = entries.slice(0, sampleSize);

    const client = getOpenAIClient();
    const rendered = sample.map(entry => renderPrompt(payload.promptTemplate!, entry).prompt);

    // Try to use Responses input token counting; fall back to heuristic
    const inputTokenCounts: number[] = [];
    for (const text of rendered) {
      let counted: number | null = null;
      if (client) {
        try {
          const anyClient: any = client as any;
          if (anyClient?.responses?.inputTokens?.create) {
            const resp = await anyClient.responses.inputTokens.create({
              model: payload.model,
              input: text,
            });
            counted = resp?.usage?.input_tokens ?? resp?.input_tokens ?? null;
          } else if (anyClient?.responses?.countTokens) {
            const resp = await anyClient.responses.countTokens({
              model: payload.model,
              input: text,
            });
            counted = resp?.tokens ?? resp?.usage?.input_tokens ?? null;
          }
        } catch {
          // ignore and use fallback
        }
      }
      if (typeof counted !== 'number' || !Number.isFinite(counted)) {
        // Simple heuristic ~4 chars per token
        counted = Math.ceil(text.length / 4);
      }
      inputTokenCounts.push(counted);
    }

    const avgInputTokens = Math.round(inputTokenCounts.reduce((a, b) => a + b, 0) / inputTokenCounts.length);
    const totalItems = entries.length;
    const totalInputTokens = avgInputTokens * totalItems;
    const outputTokensPerItem = typeof payload.outputTokensPerItem === 'number' ? payload.outputTokensPerItem : 5000;
    const totalOutputTokens = outputTokensPerItem * totalItems;

    const estimatedCostUSD = estimateUsdCost({
      model: payload.model,
      totalInputTokens,
      totalOutputTokens,
      serviceTier: payload.serviceTier,
    });

    const body: EstimateResponseBody = {
      totalItems,
      sampleSize,
      inputTokensPerItem: avgInputTokens,
      outputTokensPerItem,
      totalInputTokens,
      totalOutputTokens,
      estimatedCostUSD,
    };

    return NextResponse.json(body);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to estimate cost' },
      { status: 500 }
    );
  }
}


